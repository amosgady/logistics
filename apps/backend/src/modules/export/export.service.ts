import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

const DEPARTMENT_MAP: Record<string, string> = {
  GENERAL_TRANSPORT: 'הובלות כללי',
  KITCHEN_TRANSPORT: 'הובלות מטבחים',
  INTERIOR_DOOR_TRANSPORT: 'הובלת דלתות פנים',
  SHOWER_INSTALLATION: 'התקנת מקלחונים',
  INTERIOR_DOOR_INSTALLATION: 'התקנת דלתות פנים',
  KITCHEN_INSTALLATION: 'התקנת מטבחים',
};

export class ExportService {
  async sendToDriver(routeId: number) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        truck: true,
        orders: {
          include: { orderLines: true },
          orderBy: { routeSequence: 'asc' },
        },
      },
    });

    if (!route) throw new AppError(404, 'NOT_FOUND', 'מסלול לא נמצא');

    // Validate all orders are coordinated and approved
    const uncoordinated = route.orders.filter((o) => o.coordinationStatus !== 'COORDINATED');
    if (uncoordinated.length > 0) {
      throw new AppError(400, 'NOT_ALL_COORDINATED',
        `${uncoordinated.length} הזמנות טרם תואמו`,
        { orderIds: uncoordinated.map((o) => o.id) }
      );
    }

    const notApproved = route.orders.filter((o) => o.status !== 'APPROVED');
    if (notApproved.length > 0) {
      throw new AppError(400, 'NOT_ALL_APPROVED',
        `${notApproved.length} הזמנות לא בסטטוס מאושר`,
        { orderIds: notApproved.map((o) => o.id) }
      );
    }

    // Update all orders: status to SENT_TO_DRIVER, sentToDriver = true
    for (const order of route.orders) {
      await prisma.$transaction(async (tx) => {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'SENT_TO_DRIVER',
            changedBy: 0, // system
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'SENT_TO_DRIVER',
            sentToDriver: true,
          },
        });
      });
    }

    // Mark route as finalized
    await prisma.route.update({
      where: { id: routeId },
      data: { isFinalized: true },
    });

    return {
      sentCount: route.orders.length,
      truckName: route.truck!.name,
    };
  }

  async unsendFromDriver(routeId: number) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        truck: true,
        orders: true,
      },
    });

    if (!route) throw new AppError(404, 'NOT_FOUND', 'מסלול לא נמצא');

    // Only revert orders that are SENT_TO_DRIVER (skip COMPLETED)
    const sentOrders = route.orders.filter((o) => o.status === 'SENT_TO_DRIVER');
    if (sentOrders.length === 0) {
      throw new AppError(400, 'NO_SENT_ORDERS', 'אין הזמנות בסטטוס "נשלח לנהג" במסלול זה (ייתכן שכולן הושלמו)');
    }

    // Revert only non-completed orders back to coordination (APPROVED + COORDINATED)
    for (const order of sentOrders) {
      await prisma.$transaction(async (tx) => {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'APPROVED',
            changedBy: 0, // system
            reason: 'ביטול שליחה לנהג - חזרה לתיאום',
          },
        });

        await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'APPROVED',
            sentToDriver: false,
            coordinationStatus: 'COORDINATED',
          },
        });
      });
    }

    // Un-finalize route
    await prisma.route.update({
      where: { id: routeId },
      data: { isFinalized: false },
    });

    return {
      revertedCount: sentOrders.length,
      truckName: route.truck?.name || `מסלול ${route.id}`,
    };
  }

  async unsendOrder(orderId: number) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { route: true },
    });

    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    if (order.status !== 'SENT_TO_DRIVER') {
      throw new AppError(400, 'INVALID_STATUS', 'ההזמנה אינה בסטטוס "נשלח לנהג"');
    }

    await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: 'APPROVED',
          changedBy: 0,
          reason: 'ביטול שליחה לנהג - חזרה לתיאום',
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'APPROVED',
          sentToDriver: false,
          coordinationStatus: 'COORDINATED',
        },
      });
    });

    // Un-finalize route so coordination actions are possible
    if (order.routeId) {
      await prisma.route.update({
        where: { id: order.routeId },
        data: { isFinalized: false },
      });
    }

    return { orderId: order.id, orderNumber: order.orderNumber };
  }

  async exportWmsCsv(routeId: number, coordinatorName: string) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        truck: true,
        installerProfile: { include: { user: true } },
        orders: {
          include: { orderLines: true },
          orderBy: { routeSequence: 'asc' },
        },
      },
    });

    if (!route) throw new AppError(404, 'NOT_FOUND', 'מסלול לא נמצא');

    // Only allow WMS export for APPROVED orders
    const nonApprovedOrders = route.orders.filter((o) => o.status !== 'APPROVED');
    if (nonApprovedOrders.length > 0) {
      const orderNumbers = nonApprovedOrders.map((o) => o.orderNumber).join(', ');
      throw new AppError(400, 'INVALID_STATUS', `לא ניתן לשלוח ל-WMS הזמנות שאינן בסטטוס מאושר: ${orderNumbers}`);
    }

    const vehicleName = route.truck?.name
      || route.installerProfile?.user?.fullName
      || `מסלול-${route.id}`;

    // Build CSV content
    const headers = [
      'מספר הזמנה',
      'תאריך אספקה',
      'מחלקה',
      'שם משאית',
      'סדר במסלול',
      'שם מתאמת',
      'פריט',
      'תיאור',
      'כמות',
    ];

    const rows: string[] = [headers.join(',')];

    for (const order of route.orders) {
      const department = (order.department && DEPARTMENT_MAP[order.department]) || 'הובלות כללי';
      const deliveryDate = order.deliveryDate.toISOString().split('T')[0];

      for (const line of order.orderLines) {
        const csvEscape = (v: string) => v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
        rows.push([
          order.orderNumber,
          deliveryDate,
          csvEscape(department),
          csvEscape(vehicleName),
          String(order.routeSequence || 0),
          csvEscape(coordinatorName),
          csvEscape(line.product),
          csvEscape(line.description || ''),
          String(line.quantity),
        ].join(','));
      }
    }

    // Mark orders as exported
    for (const order of route.orders) {
      await prisma.order.update({
        where: { id: order.id },
        data: { exportedToCsv: true },
      });
    }

    return {
      csv: rows.join('\n'),
      filename: `wms_${vehicleName}_${route.routeDate.toISOString().split('T')[0]}.csv`,
      exportedCount: route.orders.length,
    };
  }
  async unsendWmsExport(orderId: number) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    await prisma.order.update({
      where: { id: orderId },
      data: { exportedToCsv: false },
    });

    return { orderId, orderNumber: order.orderNumber };
  }

  async sendToChecker(routeId: number) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: { orders: true, truck: true },
    });

    if (!route) throw new AppError(404, 'NOT_FOUND', 'מסלול לא נמצא');

    const count = await prisma.order.updateMany({
      where: { routeId, sentToChecker: false },
      data: { sentToChecker: true },
    });

    return {
      sentCount: count.count,
      truckName: route.truck?.name || `מסלול ${route.id}`,
    };
  }

  async unsendFromChecker(orderId: number) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    await prisma.order.update({
      where: { id: orderId },
      data: { sentToChecker: false },
    });

    return { orderId, orderNumber: order.orderNumber };
  }
}

export const exportService = new ExportService();
