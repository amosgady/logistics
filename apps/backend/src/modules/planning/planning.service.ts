import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

const INSTALLER_DEPARTMENTS = [
  'SHOWER_INSTALLATION',
  'INTERIOR_DOOR_INSTALLATION',
  'KITCHEN_INSTALLATION',
];

export class PlanningService {
  async getPlanningBoard(date: string, userDepartment?: string | null, userZoneIds?: number[]) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const deptFilter = userDepartment ? { department: userDepartment as any } : {};
    const zoneFilter = userZoneIds && userZoneIds.length > 0 ? { zoneId: { in: userZoneIds } } : {};

    // Get all orders in PLANNING/IN_COORDINATION/APPROVED status for this date
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['PLANNING', 'ASSIGNED_TO_TRUCK', 'IN_COORDINATION', 'APPROVED', 'SENT_TO_DRIVER'] },
        deliveryDate: {
          gte: startOfDay,
          lte: endOfDay,
        },
        ...deptFilter,
        ...zoneFilter,
      },
      include: {
        orderLines: true,
        zone: { select: { id: true, name: true, nameHe: true } },
        smsReplySessions: {
          where: { replyBody: { not: null } },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { replyBody: true, repliedAt: true, status: true },
        },
        smsLogs: {
          where: { status: 'SENT' },
          orderBy: { sentAt: 'desc' },
          take: 1,
          select: { deliveryStatus: true, sentAt: true },
        },
      },
      orderBy: [{ zoneId: 'asc' }, { city: 'asc' }],
    });

    // Get all routes for this date with their assigned orders
    const routeWhere: any = {
      routeDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };
    const routeOrderFilter: any = {};
    if (userDepartment) routeOrderFilter.department = userDepartment;
    if (userZoneIds && userZoneIds.length > 0) routeOrderFilter.zoneId = { in: userZoneIds };
    if (Object.keys(routeOrderFilter).length > 0) {
      routeWhere.orders = { some: routeOrderFilter };
    }
    const routes = await prisma.route.findMany({
      where: routeWhere,
      orderBy: { id: 'asc' },
      include: {
        truck: true,
        installerProfile: {
          include: {
            user: { select: { id: true, fullName: true, phone: true, isActive: true } },
          },
        },
        orders: {
          include: {
            orderLines: true,
            zone: { select: { id: true, name: true, nameHe: true } },
            delivery: { include: { photos: true } },
            smsReplySessions: {
              where: { replyBody: { not: null } },
              orderBy: { sentAt: 'desc' },
              take: 1,
              select: { replyBody: true, repliedAt: true, status: true },
            },
            smsLogs: {
              where: { status: 'SENT' },
              orderBy: { sentAt: 'desc' },
              take: 1,
              select: { deliveryStatus: true, sentAt: true },
            },
          },
          orderBy: { routeSequence: 'asc' },
        },
      },
    });

    // Filter orders within routes if user has department/zone scope
    if (userDepartment || (userZoneIds && userZoneIds.length > 0)) {
      for (const route of routes) {
        (route as any).orders = route.orders.filter((o: any) => {
          if (userDepartment && o.department !== userDepartment) return false;
          if (userZoneIds && userZoneIds.length > 0 && !userZoneIds.includes(o.zoneId)) return false;
          return true;
        });
      }
    }

    // Get available trucks (show all - a truck can carry orders from any department)
    const trucks = await prisma.truck.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    // Get available installers
    const installerWhere: any = { user: { isActive: true } };
    if (userDepartment) installerWhere.department = userDepartment;
    const installers = await prisma.installerProfile.findMany({
      where: installerWhere,
      include: {
        user: { select: { id: true, fullName: true, phone: true, isActive: true } },
        zone: { select: { id: true, name: true, nameHe: true } },
      },
      orderBy: { user: { fullName: 'asc' } },
    });

    return { unassignedOrders: orders.filter((o) => !o.routeId), routes, trucks, installers };
  }

  async assignOrderToTruck(orderId: number, truckId: number, routeDate: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderLines: true },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    // Guard: installation orders must be assigned to installer
    if (order.department && INSTALLER_DEPARTMENTS.includes(order.department)) {
      throw new AppError(400, 'WRONG_ASSIGNMENT', 'הזמנת התקנה חייבת להיות משויכת למתקין');
    }

    const truck = await prisma.truck.findUnique({ where: { id: truckId } });
    if (!truck) throw new AppError(404, 'NOT_FOUND', 'משאית לא נמצאה');

    // Guard: department must match between order and truck
    if (order.department && truck.department && order.department !== truck.department) {
      throw new AppError(400, 'DEPARTMENT_MISMATCH',
        `מחלקת ההזמנה (${order.department}) לא תואמת למחלקת המשאית (${truck.department})`,
      );
    }
    if (order.department && !truck.department) {
      throw new AppError(400, 'DEPARTMENT_MISMATCH',
        'לא ניתן לשייך הזמנה עם מחלקה למשאית ללא מחלקה',
      );
    }
    if (!order.department && truck.department) {
      throw new AppError(400, 'DEPARTMENT_MISMATCH',
        'לא ניתן לשייך הזמנה ללא מחלקה למשאית עם מחלקה',
      );
    }

    // Find or create route for this truck + date (use latest round)
    const date = new Date(routeDate);
    date.setHours(0, 0, 0, 0);

    let route = await prisma.route.findFirst({
      where: { truckId, routeDate: date },
      include: { orders: { include: { orderLines: true } } },
      orderBy: { roundNumber: 'desc' },
    });

    if (!route) {
      route = await prisma.route.create({
        data: { truckId, routeDate: date, roundNumber: 1 },
        include: { orders: { include: { orderLines: true } } },
      });
    }

    // Calculate current load
    let currentWeight = 0;
    let currentPallets = 0;
    for (const existingOrder of route.orders) {
      for (const line of existingOrder.orderLines) {
        currentWeight += Number(line.weight);
      }
      currentPallets += existingOrder.palletCount;
    }

    // Calculate new order weight/pallets
    let orderWeight = 0;
    for (const line of order.orderLines) {
      orderWeight += Number(line.weight);
    }
    const orderPallets = order.palletCount;

    const warnings: string[] = [];
    if (currentWeight + orderWeight > Number(truck.maxWeightKg)) {
      warnings.push(`חריגה במשקל: ${(currentWeight + orderWeight).toFixed(0)}/${Number(truck.maxWeightKg)} ק"ג`);
    }
    if (currentPallets + orderPallets > truck.maxPallets) {
      warnings.push(`חריגה במשטחים: ${currentPallets + orderPallets}/${truck.maxPallets}`);
    }

    // Assign order to route
    const nextSequence = route.orders.length + 1;
    const updateData: any = {
      routeId: route.id,
      routeSequence: nextSequence,
    };
    // Auto-set status to ASSIGNED_TO_TRUCK if currently PLANNING
    if (order.status === 'PLANNING') {
      updateData.status = 'ASSIGNED_TO_TRUCK';
    }
    await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    // Reset optimization flag – route composition changed
    if (route.isOptimized) {
      await prisma.route.update({
        where: { id: route.id },
        data: { isOptimized: false },
      });
    }

    return { routeId: route.id, sequence: nextSequence, warnings };
  }

  async assignOrderToInstaller(orderId: number, installerProfileId: number, routeDate: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    // Validate department
    if (!order.department || !INSTALLER_DEPARTMENTS.includes(order.department)) {
      throw new AppError(400, 'WRONG_ASSIGNMENT', 'רק הזמנות התקנה ניתנות לשיוך למתקין');
    }

    const installer = await prisma.installerProfile.findUnique({
      where: { id: installerProfileId },
      include: { user: true },
    });
    if (!installer) throw new AppError(404, 'NOT_FOUND', 'מתקין לא נמצא');

    // Validate installer department matches order department
    if (installer.department !== order.department) {
      throw new AppError(400, 'DEPARTMENT_MISMATCH',
        `המתקין שייך למחלקה אחרת. מחלקת ההזמנה: ${order.department}, מחלקת המתקין: ${installer.department}`,
      );
    }

    // Find or create route for this installer + date (use latest round)
    const date = new Date(routeDate);
    date.setHours(0, 0, 0, 0);

    let route = await prisma.route.findFirst({
      where: { installerProfileId, routeDate: date },
      include: { orders: true },
      orderBy: { roundNumber: 'desc' },
    });

    if (!route) {
      route = await prisma.route.create({
        data: { installerProfileId, routeDate: date, roundNumber: 1 },
        include: { orders: true },
      });
    }

    // No weight/pallet capacity check for installers
    const nextSequence = route.orders.length + 1;
    const updateData: any = {
      routeId: route.id,
      routeSequence: nextSequence,
    };
    // Auto-set status to ASSIGNED_TO_TRUCK if currently PLANNING
    if (order.status === 'PLANNING') {
      updateData.status = 'ASSIGNED_TO_TRUCK';
    }
    await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    return { routeId: route.id, sequence: nextSequence, warnings: [] as string[] };
  }

  async removeOrderFromTruck(orderId: number) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    if (!order.routeId) throw new AppError(400, 'NOT_ASSIGNED', 'הזמנה לא משויכת למסלול');
    if (order.coordinationStatus === 'COORDINATED') {
      throw new AppError(400, 'COORDINATED', 'לא ניתן להסיר הזמנה מתואמת. יש לבטל את התיאום תחילה');
    }

    const routeId = order.routeId!;

    await prisma.order.update({
      where: { id: orderId },
      data: {
        routeId: null,
        routeSequence: null,
        timeWindow: null,
        estimatedArrival: null,
        status: 'PLANNING',
        coordinationStatus: 'NOT_STARTED',
      },
    });

    // Re-sequence remaining orders in route
    const remainingOrders = await prisma.order.findMany({
      where: { routeId },
      orderBy: { routeSequence: 'asc' },
    });

    for (let i = 0; i < remainingOrders.length; i++) {
      await prisma.order.update({
        where: { id: remainingOrders[i].id },
        data: { routeSequence: i + 1 },
      });
    }

    // Reset optimization data – route composition changed
    await prisma.route.update({
      where: { id: routeId },
      data: {
        isOptimized: false,
        totalDistanceKm: null,
        totalTimeMinutes: null,
      },
    });
  }

  async addRound(routeId: number) {
    const existingRoute = await prisma.route.findUnique({ where: { id: routeId } });
    if (!existingRoute) throw new AppError(404, 'NOT_FOUND', 'מסלול לא נמצא');

    // Find the max round number for this truck/installer + date
    const maxRound = await prisma.route.findFirst({
      where: existingRoute.truckId
        ? { truckId: existingRoute.truckId, routeDate: existingRoute.routeDate }
        : { installerProfileId: existingRoute.installerProfileId, routeDate: existingRoute.routeDate },
      orderBy: { roundNumber: 'desc' },
      select: { roundNumber: true },
    });

    const nextRound = (maxRound?.roundNumber || 1) + 1;

    const newRoute = await prisma.route.create({
      data: {
        truckId: existingRoute.truckId,
        installerProfileId: existingRoute.installerProfileId,
        routeDate: existingRoute.routeDate,
        roundNumber: nextRound,
        color: existingRoute.color,
      },
      include: {
        orders: true,
        truck: true,
        installerProfile: { include: { user: { select: { id: true, fullName: true, phone: true } } } },
      },
    });

    return newRoute;
  }

  async reorderRoute(routeId: number, orderIds: number[]) {
    for (let i = 0; i < orderIds.length; i++) {
      await prisma.order.update({
        where: { id: orderIds[i] },
        data: { routeSequence: i + 1 },
      });
    }

    // Reset optimization flag – order sequence changed manually
    await prisma.route.update({
      where: { id: routeId },
      data: { isOptimized: false },
    });
  }

  async assignTimeWindows(routeId: number) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        orders: { orderBy: { routeSequence: 'asc' } },
        truck: true,
      },
    });

    if (!route) throw new AppError(404, 'NOT_FOUND', 'מסלול לא נמצא');

    const totalOrders = route.orders.length;
    const midpoint = Math.ceil(totalOrders / 2);

    for (let i = 0; i < route.orders.length; i++) {
      await prisma.order.update({
        where: { id: route.orders[i].id },
        data: {
          timeWindow: i < midpoint ? 'MORNING' : 'AFTERNOON',
        },
      });
    }

    return { updated: totalOrders };
  }

  async sendToCoordination(routeId: number) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: { orders: true },
    });

    if (!route) throw new AppError(404, 'NOT_FOUND', 'מסלול לא נמצא');
    if (route.orders.length === 0) throw new AppError(400, 'EMPTY_ROUTE', 'אין הזמנות במסלול');

    // For multi-order routes, require optimization first
    if (route.orders.length > 1 && !route.isOptimized) {
      throw new AppError(400, 'NOT_OPTIMIZED', 'יש לבצע אופטימיזציה למסלול לפני העברה לתיאום');
    }

    let movedCount = 0;
    for (const order of route.orders) {
      if (order.status === 'PLANNING' || order.status === 'ASSIGNED_TO_TRUCK') {
        await prisma.order.update({
          where: { id: order.id },
          data: { status: 'IN_COORDINATION' },
        });
        movedCount++;
      }
    }

    return { movedCount, totalOrders: route.orders.length };
  }

  async setRouteColor(routeId: number, color: string | null) {
    await prisma.route.update({
      where: { id: routeId },
      data: { color },
    });
  }

  async setDriverName(routeId: number, driverName: string | null) {
    await prisma.route.update({
      where: { id: routeId },
      data: { driverName },
    });
  }
}

export const planningService = new PlanningService();
