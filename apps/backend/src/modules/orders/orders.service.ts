import { Prisma, OrderStatus } from '@prisma/client';
import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';
import { canTransition } from '@delivery/shared';

interface OrderFilters {
  status?: OrderStatus[];
  zoneId?: number;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  search?: string;
  department?: string[];
  sentToWms?: boolean;
  sentToChecker?: boolean;
  page?: number;
  pageSize?: number;
}

export class OrdersService {
  async getOrders(filters: OrderFilters) {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {};

    if (filters.status && filters.status.length > 0) {
      where.status = { in: filters.status };
    }
    if (filters.zoneId) {
      where.zoneId = filters.zoneId;
    }
    if (filters.deliveryDateFrom || filters.deliveryDateTo) {
      where.deliveryDate = {};
      if (filters.deliveryDateFrom) {
        where.deliveryDate.gte = new Date(filters.deliveryDateFrom + 'T00:00:00');
      }
      if (filters.deliveryDateTo) {
        where.deliveryDate.lte = new Date(filters.deliveryDateTo + 'T23:59:59.999');
      }
    }
    if (filters.department && filters.department.length > 0) {
      where.department = { in: filters.department as any[] };
    }
    if (filters.search) {
      where.OR = [
        { orderNumber: { contains: filters.search, mode: 'insensitive' } },
        { customerName: { contains: filters.search, mode: 'insensitive' } },
        { address: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search } },
      ];
    }
    if (filters.sentToWms) {
      where.exportedToCsv = true;
    }
    if (filters.sentToChecker) {
      where.sentToChecker = true;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          orderLines: true,
          zone: { select: { id: true, name: true, nameHe: true } },
          delivery: { include: { photos: true } },
        },
        orderBy: { deliveryDate: 'asc' },
        skip,
        take: pageSize,
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      meta: { page, pageSize, total },
    };
  }

  async getAllOrderIds(filters: Omit<OrderFilters, 'page' | 'pageSize'>) {
    const where: Prisma.OrderWhereInput = {};

    if (filters.status && filters.status.length > 0) {
      where.status = { in: filters.status };
    }
    if (filters.zoneId) {
      where.zoneId = filters.zoneId;
    }
    if (filters.deliveryDateFrom || filters.deliveryDateTo) {
      where.deliveryDate = {};
      if (filters.deliveryDateFrom) {
        where.deliveryDate.gte = new Date(filters.deliveryDateFrom + 'T00:00:00');
      }
      if (filters.deliveryDateTo) {
        where.deliveryDate.lte = new Date(filters.deliveryDateTo + 'T23:59:59.999');
      }
    }
    if (filters.department && filters.department.length > 0) {
      where.department = { in: filters.department as any[] };
    }
    if (filters.search) {
      where.OR = [
        { orderNumber: { contains: filters.search, mode: 'insensitive' } },
        { customerName: { contains: filters.search, mode: 'insensitive' } },
        { address: { contains: filters.search } },
        { phone: { contains: filters.search } },
      ];
    }
    if (filters.sentToWms) {
      where.exportedToCsv = true;
    }
    if (filters.sentToChecker) {
      where.sentToChecker = true;
    }

    const orders = await prisma.order.findMany({
      where,
      select: { id: true },
      orderBy: { deliveryDate: 'asc' },
    });

    return orders.map((o) => o.id);
  }

  async getOrderById(id: number) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        orderLines: { orderBy: { lineNumber: 'asc' } },
        zone: true,
        route: true,
        delivery: { include: { photos: true } },
        statusHistory: { orderBy: { changedAt: 'desc' } },
      },
    });

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    }

    return order;
  }

  async changeStatus(orderId: number, targetStatus: OrderStatus, userId: number, reason?: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    }

    if (!canTransition(order.status as any, targetStatus as any)) {
      throw new AppError(400, 'INVALID_STATUS_TRANSITION',
        `לא ניתן להעביר מסטטוס ${order.status} לסטטוס ${targetStatus}`,
        { currentStatus: order.status, targetStatus }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: targetStatus,
          changedBy: userId,
          reason,
        },
      });

      return tx.order.update({
        where: { id: orderId },
        data: { status: targetStatus },
        include: { orderLines: true, zone: true },
      });
    });

    return updated;
  }

  async bulkChangeStatus(orderIds: number[], targetStatus: OrderStatus, userId: number) {
    const results = { success: [] as number[], failed: [] as { id: number; reason: string }[] };

    for (const id of orderIds) {
      try {
        await this.changeStatus(id, targetStatus, userId);
        results.success.push(id);
      } catch (err) {
        results.failed.push({
          id,
          reason: err instanceof AppError ? err.message : 'שגיאה לא ידועה',
        });
      }
    }

    return results;
  }

  async bulkUpdateDeliveryDate(orderIds: number[], deliveryDate: string) {
    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { deliveryDate: new Date(deliveryDate) },
    });
    return { updated: orderIds.length };
  }

  async updateDeliveryDate(orderId: number, deliveryDate: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    }

    return prisma.order.update({
      where: { id: orderId },
      data: { deliveryDate: new Date(deliveryDate) },
      include: { orderLines: true, zone: true },
    });
  }

  async updateDepartment(orderId: number, department: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: { department: department as any },
      include: { orderLines: true, zone: true },
    });
  }

  async updateZone(orderId: number, zoneId: number) {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) {
      throw new AppError(404, 'NOT_FOUND', 'אזור לא נמצא');
    }

    return prisma.order.update({
      where: { id: orderId },
      data: { zoneId, zoneOverride: true },
      include: { orderLines: true, zone: true },
    });
  }

  async deleteOrder(orderId: number) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    }

    if (order.status !== 'PENDING' && order.status !== 'CANCELLED') {
      throw new AppError(400, 'INVALID_STATUS_FOR_DELETE',
        'ניתן למחוק הזמנות בסטטוס המתנה או בוטל בלבד',
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.deleteMany({ where: { orderId } });

      const delivery = await tx.delivery.findUnique({ where: { orderId } });
      if (delivery) {
        await tx.deliveryPhoto.deleteMany({ where: { deliveryId: delivery.id } });
        await tx.delivery.delete({ where: { orderId } });
      }

      // OrderLine cascades automatically
      await tx.order.delete({ where: { id: orderId } });
    });

    return { id: orderId };
  }

  async bulkDelete(orderIds: number[]) {
    const results = { success: [] as number[], failed: [] as { id: number; reason: string }[] };

    for (const id of orderIds) {
      try {
        await this.deleteOrder(id);
        results.success.push(id);
      } catch (err) {
        results.failed.push({
          id,
          reason: err instanceof AppError ? err.message : 'שגיאה לא ידועה',
        });
      }
    }

    return results;
  }

  async updateCoordination(orderId: number, data: { coordinationStatus: string; coordinationNotes?: string }) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    const isCoordinating = data.coordinationStatus === 'COORDINATED';
    const isUncoordinating = data.coordinationStatus === 'NOT_STARTED';

    // Only allow un-coordinating when currently coordinated
    if (isUncoordinating && order.coordinationStatus !== 'COORDINATED') {
      throw new AppError(400, 'INVALID_COORDINATION_CHANGE', 'חובה שההזמנה תהיה בסטטוס "בתיאום"');
    }

    // Auto-approve: when coordination is confirmed and order is in PLANNING or IN_COORDINATION,
    // automatically move it to APPROVED so "Send to Driver" becomes available.
    const shouldAutoApprove =
      isCoordinating &&
      (order.status === 'PLANNING' || order.status === 'ASSIGNED_TO_TRUCK' || order.status === 'IN_COORDINATION');

    // Revert to IN_COORDINATION when unchecking coordination
    const shouldRevertToCoordination =
      isUncoordinating &&
      order.status === 'APPROVED';

    const newStatus = shouldAutoApprove ? 'APPROVED' : shouldRevertToCoordination ? 'IN_COORDINATION' : undefined;

    return prisma.$transaction(async (tx) => {
      if (newStatus) {
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: newStatus,
            changedBy: 0,
            reason: isCoordinating ? 'אישור אוטומטי לאחר תיאום' : 'ביטול תיאום - חזרה לבתיאום',
          },
        });
      }

      // When uncoordinating, reset customer response and clear all SMS reply data
      if (isUncoordinating) {
        await tx.smsReplySession.updateMany({
          where: { orderId },
          data: { status: 'EXPIRED', replyBody: null, repliedAt: null },
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          coordinationStatus: data.coordinationStatus as any,
          coordinationNotes: data.coordinationNotes,
          ...(newStatus && { status: newStatus }),
          ...(isUncoordinating && {
            customerResponse: 'PENDING',
            customerNotes: null,
            respondedAt: null,
          }),
        },
        include: { orderLines: true, zone: true },
      });
    });
  }

  async updatePalletCount(orderId: number, palletCount: number) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    if (palletCount < 0) throw new AppError(400, 'INVALID', 'כמות משטחים לא יכולה להיות שלילית');

    return prisma.order.update({
      where: { id: orderId },
      data: { palletCount },
    });
  }

  async updateAddress(orderId: number, address: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    if (!address || !address.trim()) throw new AppError(400, 'INVALID', 'כתובת לא יכולה להיות ריקה');

    // Reset geocoding so it will be re-geocoded on next optimization
    return prisma.order.update({
      where: { id: orderId },
      data: {
        address: address.trim(),
        latitude: null,
        longitude: null,
        geocodeValid: null,
        geocodedAddress: null,
      },
    });
  }
  async updateCity(orderId: number, city: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    if (!city || !city.trim()) throw new AppError(400, 'INVALID', 'עיר לא יכולה להיות ריקה');

    // Reset geocoding so it will be re-geocoded on next optimization
    return prisma.order.update({
      where: { id: orderId },
      data: {
        city: city.trim(),
        latitude: null,
        longitude: null,
        geocodeValid: null,
        geocodedAddress: null,
      },
    });
  }

  async updateDoorCount(orderId: number, doorCount: number | null) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    return prisma.order.update({
      where: { id: orderId },
      data: { doorCount },
      include: { orderLines: true, zone: true },
    });
  }

  async updateHandleCount(orderId: number, handleCount: number | null) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    return prisma.order.update({
      where: { id: orderId },
      data: { handleCount },
      include: { orderLines: true, zone: true },
    });
  }

  async updateLineQuantity(lineId: number, quantity: number) {
    const line = await prisma.orderLine.findUnique({
      where: { id: lineId },
      include: { order: true },
    });
    if (!line) throw new AppError(404, 'NOT_FOUND', 'שורת הזמנה לא נמצאה');
    if (line.order.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_STATUS', 'ניתן לשנות כמות רק כאשר ההזמנה בסטטוס בהמתנה');
    }
    if (quantity < 1) throw new AppError(400, 'INVALID', 'כמות חייבת להיות לפחות 1');

    const totalPrice = line.discount
      ? Number(line.price) * quantity * (1 - Number(line.discount) / 100)
      : Number(line.price) * quantity;

    return prisma.orderLine.update({
      where: { id: lineId },
      data: {
        quantity,
        totalPrice: new Prisma.Decimal(totalPrice.toFixed(2)),
      },
    });
  }

  async updateDriverNote(orderId: number, driverNote: string | null) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    return prisma.order.update({
      where: { id: orderId },
      data: { driverNote: driverNote?.trim() || null },
      include: { orderLines: true, zone: true },
    });
  }

  async deleteOrderLine(lineId: number) {
    const line = await prisma.orderLine.findUnique({
      where: { id: lineId },
      include: { order: true },
    });
    if (!line) throw new AppError(404, 'NOT_FOUND', 'שורת הזמנה לא נמצאה');
    if (line.order.status !== 'PENDING') {
      throw new AppError(400, 'INVALID_STATUS', 'ניתן למחוק שורה רק כאשר ההזמנה בסטטוס בהמתנה');
    }

    await prisma.orderLine.delete({ where: { id: lineId } });
    return { id: lineId };
  }
}

export const ordersService = new OrdersService();
