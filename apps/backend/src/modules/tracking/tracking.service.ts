import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

export class TrackingService {
  async getTrackingBoard(date: string, userDepartment?: string | null, userZoneIds?: number[]) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const routeWhere: any = {
      routeDate: { gte: startOfDay, lte: endOfDay },
    };
    const routeOrderFilter: any = {};
    if (userDepartment) routeOrderFilter.department = userDepartment;
    if (userZoneIds && userZoneIds.length > 0) routeOrderFilter.zoneId = { in: userZoneIds };
    if (Object.keys(routeOrderFilter).length > 0) {
      routeWhere.orders = { some: routeOrderFilter };
    }

    // Get all routes for this date with orders and worker info
    const routes = await prisma.route.findMany({
      where: routeWhere,
      include: {
        truck: {
          include: {
            assignments: {
              where: { isActive: true },
              include: {
                driver: {
                  include: {
                    user: { select: { id: true, fullName: true, phone: true } },
                  },
                },
              },
              take: 1,
            },
          },
        },
        installerProfile: {
          include: {
            user: { select: { id: true, fullName: true, phone: true } },
          },
        },
        orders: {
          include: {
            orderLines: { orderBy: { lineNumber: 'asc' } },
            delivery: { include: { photos: true } },
            zone: { select: { nameHe: true } },
          },
          orderBy: { routeSequence: 'asc' },
        },
      },
    });

    // Build workers array
    const workers = [];

    for (const route of routes) {
      // Filter orders by department/zone if user has scope
      if (userDepartment || (userZoneIds && userZoneIds.length > 0)) {
        (route as any).orders = route.orders.filter((o: any) => {
          if (userDepartment && o.department !== userDepartment) return false;
          if (userZoneIds && userZoneIds.length > 0 && !userZoneIds.includes(o.zoneId)) return false;
          return true;
        });
      }
      if (route.orders.length === 0) continue;

      // Determine worker
      let workerType: 'DRIVER' | 'INSTALLER';
      let userId: number;
      let fullName: string;
      let phone: string | null;
      let truckName: string | null = null;
      let department: string | null = null;

      if (route.truck && route.truck.assignments.length > 0) {
        workerType = 'DRIVER';
        const assignment = route.truck.assignments[0];
        userId = assignment.driver.user.id;
        fullName = assignment.driver.user.fullName;
        phone = assignment.driver.user.phone;
        const DEPT_LABELS: Record<string, string> = {
          GENERAL_TRANSPORT: 'הובלה כללית',
          KITCHEN_TRANSPORT: 'הובלת מטבחים',
          INTERIOR_DOOR_TRANSPORT: 'הובלת דלתות פנים',
          SHOWER_INSTALLATION: 'התקנת מקלחונים',
          INTERIOR_DOOR_INSTALLATION: 'התקנת דלתות פנים',
          KITCHEN_INSTALLATION: 'התקנת מטבחים',
        };
        const firstOrder = route.orders[0];
        const deptLabel = firstOrder?.department ? DEPT_LABELS[firstOrder.department] || firstOrder.department : null;
        const zoneName = (firstOrder as any)?.zone?.nameHe || null;
        truckName = [route.truck.name, deptLabel, zoneName].filter(Boolean).join(' - ');
      } else if (route.installerProfile) {
        workerType = 'INSTALLER';
        userId = route.installerProfile.user.id;
        fullName = route.installerProfile.user.fullName;
        phone = route.installerProfile.user.phone;
        department = route.installerProfile.department;
      } else {
        // Route with no worker assigned – skip
        continue;
      }

      // Get last known location
      const lastLoc = await prisma.workerLocation.findFirst({
        where: { userId },
        orderBy: { timestamp: 'desc' },
      });

      const completedCount = route.orders.filter(
        (o) => o.status === 'COMPLETED'
      ).length;

      // Build location: GPS if available, otherwise fallback to current order's geocoded address
      let location: { lat: number; lng: number; timestamp: string; isGps: boolean } | null = null;
      if (lastLoc) {
        location = { lat: lastLoc.latitude, lng: lastLoc.longitude, timestamp: lastLoc.timestamp.toISOString(), isGps: true };
      } else {
        // Fallback: use the first non-completed order's coordinates (or last completed)
        const currentOrder = route.orders.find((o) => o.status !== 'COMPLETED')
          || route.orders[route.orders.length - 1];
        if (currentOrder && currentOrder.latitude && currentOrder.longitude) {
          location = { lat: currentOrder.latitude, lng: currentOrder.longitude, timestamp: new Date().toISOString(), isGps: false };
        }
      }

      // Check if route has been sent to driver
      const sentToDriver = route.orders.some((o) =>
        ['SENT_TO_DRIVER', 'COMPLETED'].includes(o.status)
      );

      workers.push({
        type: workerType,
        userId,
        fullName,
        phone,
        truckName,
        department,
        routeId: route.id,
        routeColor: route.color || null,
        driverName: route.driverName || null,
        roundNumber: route.roundNumber || 1,
        sentToDriver,
        lastLocation: location,
        orders: route.orders,
        completedCount,
        totalCount: route.orders.length,
      });
    }

    return workers;
  }

  async reportLocation(userId: number, latitude: number, longitude: number) {
    await prisma.workerLocation.create({
      data: { userId, latitude, longitude },
    });

    // Prune old locations (>24h) for this user
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.workerLocation.deleteMany({
      where: { userId, timestamp: { lt: cutoff } },
    });
  }

  async sendMessage(senderId: number, recipientId: number, text: string) {
    // Validate recipient exists and is a field worker
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, role: true },
    });
    if (!recipient || !['DRIVER', 'INSTALLER'].includes(recipient.role)) {
      throw new AppError(400, 'INVALID_RECIPIENT', 'נמען לא תקין');
    }

    const message = await prisma.message.create({
      data: { senderId, recipientId, text },
      include: {
        sender: { select: { fullName: true } },
      },
    });

    return message;
  }

  async getMyMessages(userId: number) {
    const messages = await prisma.message.findMany({
      where: { recipientId: userId },
      include: {
        sender: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return messages;
  }

  async markMessageRead(userId: number, messageId: number) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message || message.recipientId !== userId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'הודעה לא נמצאה');
    }

    await prisma.message.update({
      where: { id: messageId },
      data: { isRead: true },
    });
  }

  async getUnreadCount(userId: number) {
    return prisma.message.count({
      where: { recipientId: userId, isRead: false },
    });
  }
}

export const trackingService = new TrackingService();
