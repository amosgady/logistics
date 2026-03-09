import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';
import { smsScheduler } from '../../services/smsScheduler.service';
import fs from 'fs';
import path from 'path';

export class DriverService {
  async getMyRoute(userId: number, date?: string) {
    // 1. Find DriverProfile by userId
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!driverProfile) {
      throw new AppError(404, 'NO_DRIVER_PROFILE', 'לא נמצא פרופיל נהג');
    }

    // 2. Find the driver's most recent active truck assignment
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const assignment = await prisma.truckAssignment.findFirst({
      where: {
        driverProfileId: driverProfile.id,
        isActive: true,
      },
      orderBy: { assignmentDate: 'desc' },
      include: { truck: true },
    });

    if (!assignment) {
      return { truck: null, route: null, orders: [] };
    }

    // 3. Find the Route for this truck on this date (range query to avoid timezone mismatch)
    const route = await prisma.route.findFirst({
      where: {
        truckId: assignment.truckId,
        routeDate: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        orders: {
          where: { status: { in: ['APPROVED', 'SENT_TO_DRIVER', 'COMPLETED'] } },
          include: {
            orderLines: { orderBy: { lineNumber: 'asc' } },
            delivery: { include: { photos: true } },
          },
          orderBy: { routeSequence: 'asc' },
        },
      },
    });

    if (!route) {
      return { truck: assignment.truck, route: null, orders: [] };
    }

    return {
      truck: assignment.truck,
      route: {
        id: route.id,
        routeDate: route.routeDate,
        totalDistanceKm: route.totalDistanceKm,
        totalTimeMinutes: route.totalTimeMinutes,
      },
      orders: route.orders,
    };
  }

  async recordDelivery(
    userId: number,
    orderId: number,
    data: { result: 'COMPLETE' | 'PARTIAL' | 'NOT_DELIVERED'; notes?: string }
  ) {
    // Verify driver profile exists
    const driverProfile = await prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!driverProfile) {
      throw new AppError(403, 'FORBIDDEN', 'אין לך הרשאה לפעולה זו');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { route: true },
    });

    if (!order || !order.route) {
      throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    }

    if (!['APPROVED', 'SENT_TO_DRIVER'].includes(order.status)) {
      throw new AppError(400, 'INVALID_STATUS', 'ההזמנה לא בסטטוס מתאים לדיווח');
    }

    // Verify driver is assigned to this truck
    const assignment = await prisma.truckAssignment.findFirst({
      where: {
        driverProfileId: driverProfile.id,
        truckId: order.route.truckId!,
        isActive: true,
      },
    });

    if (!assignment) {
      throw new AppError(403, 'FORBIDDEN', 'ההזמנה לא שייכת למסלול שלך');
    }

    const delivery = await prisma.$transaction(async (tx) => {
      // Create or update delivery record
      const dlv = await tx.delivery.upsert({
        where: { orderId },
        create: {
          orderId,
          result: data.result,
          notes: data.notes,
          deliveredAt: new Date(),
        },
        update: {
          result: data.result,
          notes: data.notes,
          deliveredAt: new Date(),
        },
      });

      // Move to COMPLETED only if fully delivered
      if (data.result === 'COMPLETE') {
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: 'COMPLETED',
            changedBy: userId,
            reason: 'דיווח נהג - הושלם',
          },
        });

        await tx.order.update({
          where: { id: orderId },
          data: { status: 'COMPLETED' },
        });
      }

      return dlv;
    });

    // Fire-and-forget: notify next customer in route
    if (data.result === 'COMPLETE') {
      smsScheduler.notifyNextCustomer(orderId).catch((err) =>
        console.error('[SMS] Next-customer notification error:', err)
      );
    }

    return delivery;
  }

  async uploadSignature(userId: number, orderId: number, signatureBase64: string) {
    const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!driverProfile) throw new AppError(403, 'FORBIDDEN', 'אין לך הרשאה לפעולה זו');

    const delivery = await prisma.delivery.findUnique({ where: { orderId } });
    if (!delivery) throw new AppError(404, 'NOT_FOUND', 'לא נמצא דיווח אספקה להזמנה זו');

    // Decode base64 and save to disk
    const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `sig_${orderId}_${Date.now()}.png`;
    const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads', 'signatures');
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, filename), buffer);

    const signatureUrl = `/uploads/signatures/${filename}`;
    return prisma.delivery.update({
      where: { id: delivery.id },
      data: { signatureUrl },
    });
  }

  async uploadPhotos(userId: number, orderId: number, files: Express.Multer.File[]) {
    const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!driverProfile) throw new AppError(403, 'FORBIDDEN', 'אין לך הרשאה לפעולה זו');

    const delivery = await prisma.delivery.findUnique({ where: { orderId } });
    if (!delivery) throw new AppError(404, 'NOT_FOUND', 'לא נמצא דיווח אספקה להזמנה זו');

    const photos = await prisma.$transaction(
      files.map((file) =>
        prisma.deliveryPhoto.create({
          data: {
            deliveryId: delivery.id,
            photoUrl: `/uploads/photos/${file.filename}`,
          },
        })
      )
    );

    return photos;
  }
}

export const driverService = new DriverService();
