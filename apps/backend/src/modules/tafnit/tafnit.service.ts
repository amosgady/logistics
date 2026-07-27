import { XMLParser } from 'fast-xml-parser';
import { Department } from '@prisma/client';
import prisma from '../../utils/prisma';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

// ─── Field-name assumptions (update when Tafnit provides real schema) ──────────
// Order level  : OrderNumber, CustomerName, IDNumber, Address, City,
//                Phone1, Phone2, Department, OrderDate, DeliveryDate
// Line level   : LineNumber, ItemCode, Description, LineNote,
//                Quantity, StockQuantity, Price, DiscountPercent,
//                TotalAfterDiscount, Weight, Batch, Department
// ────────────────────────────────────────────────────────────────────────────────

function mapDepartment(raw: string): Department {
  const v = (raw || '').toLowerCase();
  if (v.includes('מטבח')) return v.includes('התקנ') ? Department.KITCHEN_INSTALLATION : Department.KITCHEN_TRANSPORT;
  if (v.includes('דלת')) return v.includes('התקנ') ? Department.INTERIOR_DOOR_INSTALLATION : Department.INTERIOR_DOOR_TRANSPORT;
  if (v.includes('מקלחת') || v.includes('מקלחות')) return Department.SHOWER_INSTALLATION;
  return Department.GENERAL_TRANSPORT;
}

function num(val: unknown): number {
  const n = parseFloat(String(val ?? 0));
  return isNaN(n) ? 0 : n;
}

function str(val: unknown): string {
  return String(val ?? '').trim();
}

function toArray<T>(val: T | T[] | undefined): T[] {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function extractOrders(parsed: Record<string, unknown>): unknown[] {
  if (parsed.Orders) return toArray((parsed.Orders as Record<string, unknown>).Order);
  if (parsed.Order) return toArray(parsed.Order);
  return [];
}

export async function importOrdersFromXml(xmlBody: string) {
  const parsed = xmlParser.parse(xmlBody) as Record<string, unknown>;
  const rawOrders = extractOrders(parsed);

  if (rawOrders.length === 0) {
    return { created: [], skipped: [], failed: [{ orderNumber: '(none)', error: 'No orders found in XML' }] };
  }

  const results = {
    created: [] as string[],
    skipped: [] as string[],
    failed: [] as { orderNumber: string; error: string }[],
  };

  for (const raw of rawOrders) {
    const r = raw as Record<string, unknown>;
    const orderNumber = str(r.OrderNumber);

    if (!orderNumber) {
      results.failed.push({ orderNumber: '(unknown)', error: 'Missing OrderNumber' });
      continue;
    }

    const department = mapDepartment(str(r.Department));

    try {
      const existing = await prisma.order.findFirst({ where: { orderNumber, department } });
      if (existing) {
        results.skipped.push(orderNumber);
        continue;
      }

      const rawLines = toArray((r.Lines as Record<string, unknown>)?.Line);

      const deliveryDate = r.DeliveryDate
        ? new Date(str(r.DeliveryDate))
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const orderDate = r.OrderDate ? new Date(str(r.OrderDate)) : new Date();

      await prisma.order.create({
        data: {
          orderNumber,
          orderDate,
          deliveryDate,
          customerName: str(r.CustomerName) || 'לא צוין',
          address: str(r.Address || r.DeliveryAddress) || 'לא צוין',
          city: str(r.City) || 'לא צוינה',
          phone: str(r.Phone1 || r.Phone),
          phone2: str(r.Phone2) || null,
          department,
          status: 'PENDING',
          orderLines: {
            create: rawLines.map((line, idx) => {
              const l = line as Record<string, unknown>;
              return {
                lineNumber: parseInt(str(l.LineNumber)) || idx + 1,
                product: str(l.ItemCode),
                description: str(l.Description) || null,
                quantity: Math.max(1, Math.round(num(l.Quantity))),
                price: num(l.Price),
                discount: num(l.DiscountPercent) || null,
                totalPrice: num(l.TotalAfterDiscount) || null,
                weight: num(l.Weight),
                currentStock: Math.round(num(l.StockQuantity)),
                department: mapDepartment(str(l.Department || r.Department)),
              };
            }),
          },
        },
      });

      results.created.push(orderNumber);
    } catch (err: unknown) {
      results.failed.push({
        orderNumber,
        error: err instanceof Error ? err.message : 'שגיאה לא ידועה',
      });
    }
  }

  return results;
}
