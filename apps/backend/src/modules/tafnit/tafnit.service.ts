import { Department } from '@prisma/client';
import prisma from '../../utils/prisma';

interface TafnitLine {
  LineNumber?: string | number;
  ItemCode?: string;
  Description?: string;
  Quantity?: string | number;
  Price?: string | number;
  DiscountPercent?: string | number;
  TotalAfterDiscount?: string | number;
  StockQuantity?: string | number;
  Weight?: string | number;
  Department?: string;
  Status?: string;
  Remark?: string;
  Batch?: string;
}

interface TafnitOrder {
  OrderNumber?: string | number;
  CustomerName?: string;
  CustomerID?: string;
  BranchName?: string;
  SalesPerson?: string;
  Address?: string;
  City?: string;
  Phone1?: string;
  Phone2?: string;
  OrderDate?: string;
  DeliveryDate?: string;
  Lines?: TafnitLine[];
}

function num(val: unknown): number {
  const n = parseFloat(String(val ?? 0));
  return isNaN(n) ? 0 : n;
}

function str(val: unknown): string {
  return String(val ?? '').trim();
}

const DEPARTMENT_MAP: Record<string, Department> = {
  'הובלה למדרכה':                       Department.GENERAL_TRANSPORT,
  'הובלת מטבחים':                        Department.KITCHEN_TRANSPORT,
  'הובלת דלתות פנים':                    Department.INTERIOR_DOOR_TRANSPORT,
  'הובלה לסניף':                         Department.BRANCH_TRANSPORT,
  'התקנת מטבחים':                        Department.KITCHEN_INSTALLATION,
  'איסוף מאשדוד':                        Department.ASHDOD_PICKUP,
  'התקנת מקלחונים וארונות אמבטיה':      Department.SHOWER_INSTALLATION,
  'התקנת דלתות פנים':                    Department.INTERIOR_DOOR_INSTALLATION,
};

function mapDepartment(val: unknown): Department | null {
  const s = str(val);
  return DEPARTMENT_MAP[s] ?? null;
}

const PROXY_URL = process.env.TAFNIT_PROXY_URL || '';
const PROXY_SECRET = process.env.TAFNIT_PROXY_SECRET || '';
const COMPANY_CODE = process.env.TAFNIT_COMPANY_CODE || '1';

export async function freezeOrder(orderNumber: string, frozenBy?: string): Promise<{ success: boolean; raw?: string; error?: string }> {
  if (!PROXY_URL || !PROXY_SECRET) {
    return { success: false, error: 'TAFNIT_PROXY_URL / TAFNIT_PROXY_SECRET not configured' };
  }

  // Verified against the Hovalot.Webservices WSDL (host 147.235.45.98):
  //   method  SetHovalaSTT (namespace http://tempuri.org)
  //   params  HEV = company, HZM = order number, STT = status (3 = frozen)
  //   returns boolean SetHovalaSTTResult
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SetHovalaSTT xmlns="http://tempuri.org">
      <HEV>${COMPANY_CODE}</HEV>
      <HZM>${orderNumber}</HZM>
      <STT>3</STT>
    </SetHovalaSTT>
  </soap:Body>
</soap:Envelope>`;

  let success = false;
  let error: string | undefined;
  let raw: string | undefined;

  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Tafnit-Proxy-Secret': PROXY_SECRET,
        'X-Tafnit-Soapaction': 'http://tempuri.org/Hovalot.Webservices.SetHovalaSTT',
      },
      body: envelope,
    });

    raw = await res.text();
    if (!res.ok) {
      error = `HTTP ${res.status}: ${raw.slice(0, 300)}`;
    } else {
      // Even on HTTP 200 the SOAP result may be a fault or a boolean false
      // (e.g. order not found / wrong company) — parse before declaring success.
      const fault = raw.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
      const result = raw.match(/<SetHovalaSTTResult>([\s\S]*?)<\/SetHovalaSTTResult>/i);
      if (fault) {
        error = `SOAP Fault: ${fault[1].trim()}`;
      } else if (result) {
        const v = result[1].trim().toLowerCase();
        if (v === 'true' || v === '1') {
          success = true;
        } else {
          error = 'Tafnit החזירה false — ההזמנה לא הוקפאה (ייתכן שמספר ההזמנה או קוד החברה שגויים)';
        }
      } else {
        error = `תשובה לא צפויה מ-Tafnit: ${raw.slice(0, 300)}`;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Request failed';
  }

  // Record the freeze attempt
  await prisma.frozenOrder.create({
    data: { orderNumber, frozenBy: frozenBy || null, success, error: error || null },
  });

  // If successful, update all matching orders to FROZEN status in our system
  if (success) {
    await prisma.order.updateMany({
      where: { orderNumber },
      data: { status: 'FROZEN' },
    });
  }

  return { success, raw, error };
}

export async function getFrozenOrders(limit = 200) {
  return prisma.frozenOrder.findMany({
    orderBy: { frozenAt: 'desc' },
    take: limit,
  });
}

export async function getLogs(limit = 100) {
  return prisma.tafnitLog.findMany({
    orderBy: { receivedAt: 'desc' },
    take: limit,
  });
}

export async function importOrderFromJson(body: TafnitOrder, ip = '') {
  const orderNumber = str(body.OrderNumber);
  if (!orderNumber) {
    return { created: [], skipped: [], failed: [{ orderNumber: '(unknown)', error: 'Missing OrderNumber' }] };
  }

  // Save raw log before processing
  await prisma.tafnitLog.create({
    data: {
      ip,
      orderNumber: orderNumber || null,
      rawBody: JSON.stringify(body, null, 2),
    },
  });

  const deliveryDate = body.DeliveryDate ? new Date(body.DeliveryDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const orderDate = body.OrderDate ? new Date(body.OrderDate) : new Date();
  const lines = Array.isArray(body.Lines) ? body.Lines : [];

  // Group lines by mapped department
  const groups = new Map<Department | null, TafnitLine[]>();
  for (const line of lines) {
    const dept = mapDepartment(line.Department);
    if (!groups.has(dept)) groups.set(dept, []);
    groups.get(dept)!.push(line);
  }

  // If no lines, create one order with null department
  if (groups.size === 0) groups.set(null, []);

  const created: string[] = [];
  const skipped: string[] = [];

  for (const [department, deptLines] of groups) {
    const existing = await prisma.order.findFirst({
      where: { orderNumber, department: department ?? null },
    });

    if (existing) {
      skipped.push(`${orderNumber}${department ? `/${department}` : ''}`);
      continue;
    }

    await prisma.order.create({
      data: {
        orderNumber,
        department: department ?? null,
        orderDate,
        deliveryDate,
        customerName: str(body.CustomerName) || 'לא צוין',
        customerId: str(body.CustomerID) || null,
        branchName: str(body.BranchName) || null,
        salesPerson: str(body.SalesPerson) || null,
        address: str(body.Address) || 'לא צוין',
        city: str(body.City) || 'לא צוינה',
        phone: str(body.Phone1),
        phone2: str(body.Phone2) || null,
        status: 'PENDING',
        orderLines: {
          create: deptLines.map((line, idx) => ({
            lineNumber: parseInt(str(line.LineNumber)) || idx + 1,
            product: str(line.ItemCode),
            description: str(line.Description) || null,
            quantity: Math.max(1, Math.round(num(line.Quantity))),
            price: num(line.Price),
            discount: num(line.DiscountPercent) || null,
            totalPrice: num(line.TotalAfterDiscount) || null,
            weight: num(line.Weight),
            currentStock: num(line.StockQuantity),
            department: department ?? null,
            lineStatus: str(line.Status) || null,
            lineRemark: str(line.Remark) || null,
            batch: str(line.Batch) || null,
          })),
        },
      },
    });

    created.push(`${orderNumber}${department ? `/${department}` : ''}`);
  }

  const result = { created, skipped, failed: [] as string[] };

  // Update log with result
  await prisma.tafnitLog.updateMany({
    where: { orderNumber, result: { equals: null as any } },
    data: { result: result as any },
  });

  return result;
}
