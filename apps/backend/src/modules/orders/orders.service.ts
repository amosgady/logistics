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

    // Auto-approve: when coordination is confirmed and order is in PLANNING or IN_COORDINATION,
    // automatically move it to APPROVED so "Send to Driver" becomes available.
    const shouldAutoApprove =
      isCoordinating &&
      (order.status === 'PLANNING' || order.status === 'IN_COORDINATION');

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

      return tx.order.update({
        where: { id: orderId },
        data: {
          coordinationStatus: data.coordinationStatus as any,
          coordinationNotes: data.coordinationNotes,
          ...(newStatus && { status: newStatus }),
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
}

export const ordersService = new OrdersService();
