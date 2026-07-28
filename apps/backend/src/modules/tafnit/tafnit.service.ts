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

export async function importOrderFromJson(body: TafnitOrder) {
  const orderNumber = str(body.OrderNumber);
  if (!orderNumber) {
    return { created: [], skipped: [], failed: [{ orderNumber: '(unknown)', error: 'Missing OrderNumber' }] };
  }

  const existing = await prisma.order.findFirst({ where: { orderNumber } });
  if (existing) {
    return { created: [], skipped: [orderNumber], failed: [] };
  }

  const deliveryDate = body.DeliveryDate ? new Date(body.DeliveryDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const orderDate = body.OrderDate ? new Date(body.OrderDate) : new Date();

  const lines = Array.isArray(body.Lines) ? body.Lines : [];

  await prisma.order.create({
    data: {
      orderNumber,
      orderDate,
      deliveryDate,
      customerName: str(body.CustomerName) || 'לא צוין',
      address: str(body.Address) || 'לא צוין',
      city: str(body.City) || 'לא צוינה',
      phone: str(body.Phone1),
      phone2: str(body.Phone2) || null,
      status: 'PENDING',
      orderLines: {
        create: lines.map((line, idx) => ({
          lineNumber: parseInt(str(line.LineNumber)) || idx + 1,
          product: str(line.ItemCode),
          description: str(line.Description) || null,
          quantity: Math.max(1, Math.round(num(line.Quantity))),
          price: num(line.Price),
          discount: num(line.DiscountPercent) || null,
          totalPrice: num(line.TotalAfterDiscount) || null,
          weight: num(line.Weight),
          currentStock: Math.round(num(line.StockQuantity)),
        })),
      },
    },
  });

  return { created: [orderNumber], skipped: [], failed: [] };
}
