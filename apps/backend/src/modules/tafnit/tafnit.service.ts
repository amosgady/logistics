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
}

interface TafnitOrder {
  OrderNumber?: string | number;
  CustomerName?: string;
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
