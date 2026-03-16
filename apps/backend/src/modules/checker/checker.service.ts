import { Prisma } from '@prisma/client';
import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

interface CheckerOrderFilters {
  search?: string;
  inspectionStatus?: 'all' | 'checked' | 'unchecked';
  date?: string;
}

export class CheckerService {
  async searchOrders(filters: CheckerOrderFilters) {
    const where: Prisma.OrderWhereInput = {
      sentToChecker: true,
    };

    if (filters.date) {
      where.deliveryDate = {
        gte: new Date(filters.date + 'T00:00:00'),
        lte: new Date(filters.date + 'T23:59:59.999'),
      };
    }

    if (filters.search) {
      where.OR = [
        { orderNumber: { contains: filters.search, mode: 'insensitive' } },
        { customerName: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search } },
        { address: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        orderLines: {
          select: {
            id: true,
            checkedByInspector: true,
          },
        },
      },
      orderBy: { deliveryDate: 'asc' },
      take: 100,
    });

    // Calculate inspection progress and filter by inspection status
    const ordersWithProgress = orders.map((order) => {
      const totalLines = order.orderLines.length;
      const checkedLines = order.orderLines.filter((l) => l.checkedByInspector).length;
      const isFullyChecked = totalLines > 0 && checkedLines === totalLines;
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        address: order.address,
        city: order.city,
        phone: order.phone,
        deliveryDate: order.deliveryDate,
        department: order.department,
        totalLines,
        checkedLines,
        isFullyChecked,
      };
    });

    if (filters.inspectionStatus === 'checked') {
      return ordersWithProgress.filter((o) => o.isFullyChecked);
    }
    if (filters.inspectionStatus === 'unchecked') {
      return ordersWithProgress.filter((o) => !o.isFullyChecked);
    }
    return ordersWithProgress;
  }

  async getOrderLines(orderId: number) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        address: true,
        city: true,
        phone: true,
        deliveryDate: true,
        department: true,
        driverNote: true,
        checkerNote: true,
        orderLines: {
          orderBy: { lineNumber: 'asc' },
          select: {
            id: true,
            lineNumber: true,
            product: true,
            description: true,
            quantity: true,
            weight: true,
            checkedByInspector: true,
            checkedAt: true,
          },
        },
      },
    });

    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    return order;
  }

  async toggleLineCheck(lineId: number, checked: boolean) {
    const line = await prisma.orderLine.findUnique({
      where: { id: lineId },
      include: { order: { select: { id: true } } },
    });

    if (!line) throw new AppError(404, 'NOT_FOUND', 'שורת הזמנה לא נמצאה');

    const updated = await prisma.orderLine.update({
      where: { id: lineId },
      data: {
        checkedByInspector: checked,
        checkedAt: checked ? new Date() : null,
      },
    });

    // Check if all lines in the order are now checked
    const allLines = await prisma.orderLine.findMany({
      where: { orderId: line.orderId },
      select: { checkedByInspector: true },
    });

    const allLinesChecked = allLines.every((l) => l.checkedByInspector);

    return {
      lineId: updated.id,
      checked: updated.checkedByInspector,
      allLinesChecked,
    };
  }

  async updateCheckerNote(orderId: number, checkerNote: string | null) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    return prisma.order.update({
      where: { id: orderId },
      data: { checkerNote },
      select: { id: true, checkerNote: true },
    });
  }
}

export const checkerService = new CheckerService();
