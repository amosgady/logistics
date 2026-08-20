import { Department } from '@prisma/client';
import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

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

// Build a Prisma orderLine create object from a raw Tafnit line.
function buildLineData(line: TafnitLine, idx: number, department: Department | null) {
  return {
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
  };
}

export type LineDiffType = 'ADDED' | 'REMOVED' | 'CHANGED';
export interface LineDiffEntry {
  type: LineDiffType;
  product: string;
  description: string | null;
  oldQty: number;
  newQty: number;
}

// Compare existing order lines against a new Tafnit payload, aggregating
// quantity per product code. Returns only the products that differ.
function computeLineDiff(
  existingLines: { product: string; description: string | null; quantity: number }[],
  newLines: TafnitLine[],
): LineDiffEntry[] {
  const oldMap = new Map<string, { description: string | null; quantity: number }>();
  for (const l of existingLines) {
    const key = str(l.product);
    const cur = oldMap.get(key) || { description: l.description ?? null, quantity: 0 };
    cur.quantity += l.quantity;
    oldMap.set(key, cur);
  }
  const newMap = new Map<string, { description: string | null; quantity: number }>();
  for (const l of newLines) {
    const key = str(l.ItemCode);
    const cur = newMap.get(key) || { description: str(l.Description) || null, quantity: 0 };
    cur.quantity += Math.max(1, Math.round(num(l.Quantity)));
    newMap.set(key, cur);
  }

  const diff: LineDiffEntry[] = [];
  for (const [product, nv] of newMap) {
    const ov = oldMap.get(product);
    if (!ov) {
      diff.push({ type: 'ADDED', product, description: nv.description, oldQty: 0, newQty: nv.quantity });
    } else if (ov.quantity !== nv.quantity) {
      diff.push({ type: 'CHANGED', product, description: nv.description ?? ov.description, oldQty: ov.quantity, newQty: nv.quantity });
    }
  }
  for (const [product, ov] of oldMap) {
    if (!newMap.has(product)) {
      diff.push({ type: 'REMOVED', product, description: ov.description, oldQty: ov.quantity, newQty: 0 });
    }
  }
  return diff;
}

const PROXY_URL = process.env.TAFNIT_PROXY_URL || '';
const PROXY_SECRET = process.env.TAFNIT_PROXY_SECRET || '';
const COMPANY_CODE = process.env.TAFNIT_COMPANY_CODE || '1';
// When set (e.g. on the on-prem server that can reach Tafnit's network
// directly), freeze calls the Hovalot web service straight — no perfectline
// proxy, no WAF/Check Point in the path. Example:
//   TAFNIT_HOVALOT_DIRECT_URL=http://147.235.45.98/csp/bil/Hovalot.Webservices.cls
const HOVALOT_DIRECT_URL = process.env.TAFNIT_HOVALOT_DIRECT_URL || '';

export async function freezeOrder(orderNumber: string, frozenBy?: string): Promise<{ success: boolean; raw?: string; error?: string }> {
  if (!HOVALOT_DIRECT_URL && (!PROXY_URL || !PROXY_SECRET)) {
    return { success: false, error: 'Tafnit freeze not configured (need TAFNIT_HOVALOT_DIRECT_URL or TAFNIT_PROXY_URL+SECRET)' };
  }

  // Params: HEV = company, HZM = order number, STT = status (3 = frozen);
  // Tafnit replies with boolean SetHovalaSTTResult.
  const orderNum = String(orderNumber).replace(/[^0-9]/g, '');

  let success = false;
  let error: string | undefined;
  let raw: string | undefined;

  try {
    let res: Response;
    if (HOVALOT_DIRECT_URL) {
      // Direct SOAP call to the Hovalot web service (no proxy).
      const envelope = `<?xml version="1.0" encoding="utf-8"?>` +
        `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
        `<soap:Body><SetHovalaSTT xmlns="http://tempuri.org">` +
        `<HEV>${COMPANY_CODE}</HEV><HZM>${orderNum}</HZM><STT>3</STT>` +
        `</SetHovalaSTT></soap:Body></soap:Envelope>`;
      res = await fetch(HOVALOT_DIRECT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://tempuri.org/Hovalot.Webservices.SetHovalaSTT',
        },
        body: envelope,
      });
    } else {
      // Via perfectline proxy: POST a compact "FREEZE|company|order|status"
      // token to the /send route. The proxy rebuilds the real SetHovalaSTT
      // envelope server-side (its WAF fingerprinted that string) and forwards
      // it to the Hovalot service on .98.
      res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Tafnit-Proxy-Secret': PROXY_SECRET,
        },
        body: `FREEZE|${COMPANY_CODE}|${orderNum}|3`,
      });
    }

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

  // If the order already exists in the system and is FROZEN, do NOT touch it.
  // Instead compute the line/quantity differences and hold them as a pending
  // update for a user to review and approve.
  const existingRows = await prisma.order.findMany({
    where: { orderNumber },
    include: { orderLines: true },
  });
  const isFrozen = existingRows.some((o) => o.status === 'FROZEN');

  if (isFrozen) {
    const existingLines = existingRows.flatMap((o) =>
      o.orderLines.map((l) => ({ product: l.product, description: l.description, quantity: l.quantity })),
    );
    const diff = computeLineDiff(existingLines, lines);

    let pendingUpdate: string | null = null;
    let released = false;
    if (diff.length > 0) {
      const existingPU = await prisma.pendingOrderUpdate.findFirst({
        where: { orderNumber, status: 'PENDING' },
      });
      if (existingPU) {
        await prisma.pendingOrderUpdate.update({
          where: { id: existingPU.id },
          data: { rawPayload: body as any, diff: diff as any, receivedAt: new Date() },
        });
      } else {
        await prisma.pendingOrderUpdate.create({
          data: { orderNumber, rawPayload: body as any, diff: diff as any },
        });
      }
      pendingUpdate = orderNumber;
    } else {
      // Identical re-send of a frozen order = Tafnit re-confirmed it unchanged.
      // Release it from freeze back to PENDING automatically (no review needed),
      // and supersede any pending review that was open for it.
      await prisma.order.updateMany({
        where: { orderNumber, status: 'FROZEN' },
        data: { status: 'PENDING' },
      });
      await prisma.pendingOrderUpdate.updateMany({
        where: { orderNumber, status: 'PENDING' },
        data: { status: 'REJECTED', reviewedBy: 'אוטומטי (התקבלה זהה — שוחררה)', reviewedAt: new Date() },
      });
      released = true;
    }

    const result = { created: [], skipped: [] as string[], failed: [] as string[], frozen: true, pendingUpdate, released };
    await prisma.tafnitLog.updateMany({
      where: { orderNumber, result: { equals: null as any } },
      data: { result: result as any },
    });
    return result;
  }

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
          create: deptLines.map((line, idx) => buildLineData(line, idx, department)),
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

// ---- Pending updates (re-send of a frozen order) --------------------------

export async function getPendingUpdates(status: string = 'PENDING') {
  return prisma.pendingOrderUpdate.findMany({
    where: { status },
    orderBy: { receivedAt: 'desc' },
  });
}

// Apply an approved update: re-sync the order's lines to match the new Tafnit
// payload and release the order back to PENDING. We update lines per existing
// department row (no row deletion — other relations aren't cascade-safe).
export async function approvePendingUpdate(id: number, reviewedBy?: string) {
  const pu = await prisma.pendingOrderUpdate.findUnique({ where: { id } });
  if (!pu) throw new AppError(404, 'NOT_FOUND', 'עדכון לא נמצא');
  if (pu.status !== 'PENDING') throw new AppError(400, 'ALREADY_HANDLED', 'העדכון כבר טופל');

  const body = pu.rawPayload as unknown as TafnitOrder;
  const orderNumber = pu.orderNumber;
  const lines = Array.isArray(body.Lines) ? body.Lines : [];
  const deliveryDate = body.DeliveryDate ? new Date(body.DeliveryDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const orderDate = body.OrderDate ? new Date(body.OrderDate) : new Date();

  // Group new lines by department
  const groups = new Map<Department | null, TafnitLine[]>();
  for (const line of lines) {
    const dept = mapDepartment(line.Department);
    if (!groups.has(dept)) groups.set(dept, []);
    groups.get(dept)!.push(line);
  }

  const existing = await prisma.order.findMany({ where: { orderNumber } });

  await prisma.$transaction(async (tx) => {
    const handled = new Set<string>();
    for (const [department, deptLines] of groups) {
      const key = String(department ?? '__null__');
      handled.add(key);
      const row = existing.find((o) => (o.department ?? null) === (department ?? null));
      if (row) {
        await tx.orderLine.deleteMany({ where: { orderId: row.id } });
        await tx.order.update({
          where: { id: row.id },
          data: {
            status: 'PENDING',
            orderLines: { create: deptLines.map((l, i) => buildLineData(l, i, department)) },
          },
        });
      } else {
        await tx.order.create({
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
            orderLines: { create: deptLines.map((l, i) => buildLineData(l, i, department)) },
          },
        });
      }
    }

    // Departments that no longer appear in the new payload: clear their lines
    // and release to PENDING (we keep the row — deletion isn't cascade-safe).
    for (const row of existing) {
      const key = String(row.department ?? '__null__');
      if (!handled.has(key)) {
        await tx.orderLine.deleteMany({ where: { orderId: row.id } });
        await tx.order.update({ where: { id: row.id }, data: { status: 'PENDING' } });
      }
    }

    await tx.pendingOrderUpdate.update({
      where: { id },
      data: { status: 'APPROVED', reviewedBy: reviewedBy || null, reviewedAt: new Date() },
    });
  });

  return { orderNumber };
}

export async function rejectPendingUpdate(id: number, reviewedBy?: string) {
  const pu = await prisma.pendingOrderUpdate.findUnique({ where: { id } });
  if (!pu) throw new AppError(404, 'NOT_FOUND', 'עדכון לא נמצא');
  if (pu.status !== 'PENDING') throw new AppError(400, 'ALREADY_HANDLED', 'העדכון כבר טופל');
  await prisma.pendingOrderUpdate.update({
    where: { id },
    data: { status: 'REJECTED', reviewedBy: reviewedBy || null, reviewedAt: new Date() },
  });
  return { orderNumber: pu.orderNumber };
}
