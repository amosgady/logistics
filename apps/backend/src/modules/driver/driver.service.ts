import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';
import { smsScheduler } from '../../services/smsScheduler.service';
import { PDFDocument } from 'pdf-lib';
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

    // 3. Find ALL Routes for this truck on this date (multiple rounds)
    const routes = await prisma.route.findMany({
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
      orderBy: { roundNumber: 'asc' },
    });

    if (routes.length === 0) {
      return { truck: assignment.truck, route: null, routes: [], orders: [] };
    }

    // Combine all orders from all rounds
    const allOrders = routes.flatMap((r) => r.orders);

    return {
      truck: assignment.truck,
      route: {
        id: routes[0].id,
        routeDate: routes[0].routeDate,
        totalDistanceKm: routes.reduce((sum, r) => sum + (r.totalDistanceKm ? Number(r.totalDistanceKm) : 0), 0),
        totalTimeMinutes: routes.reduce((sum, r) => sum + (r.totalTimeMinutes ? Number(r.totalTimeMinutes) : 0), 0),
      },
      routes: routes.map((r) => ({
        id: r.id,
        roundNumber: r.roundNumber,
        totalDistanceKm: r.totalDistanceKm,
        totalTimeMinutes: r.totalTimeMinutes,
        orderCount: r.orders.length,
      })),
      orders: allOrders,
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

  async signDeliveryNote(userId: number, orderId: number, signatureBase64: string) {
    const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!driverProfile) throw new AppError(403, 'FORBIDDEN', 'אין לך הרשאה לפעולה זו');

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');
    if (!order.deliveryNoteUrl) throw new AppError(400, 'NO_PDF', 'אין תעודת משלוח להזמנה זו');

    // Read original PDF
    const pdfPath = path.join(__dirname, '..', '..', '..', order.deliveryNoteUrl);
    if (!fs.existsSync(pdfPath)) throw new AppError(404, 'FILE_NOT_FOUND', 'קובץ PDF לא נמצא');
    const pdfBytes = fs.readFileSync(pdfPath);

    // Decode signature from base64
    const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
    const sigBuffer = Buffer.from(base64Data, 'base64');

    // Embed signature on PDF using pdf-lib
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const sigImage = await pdfDoc.embedPng(sigBuffer);

    // Place signature at the bottom of the last page
    const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
    const { width: pageWidth, height: _pageHeight } = lastPage.getSize();
    const sigWidth = 200;
    const sigHeight = (sigImage.height / sigImage.width) * sigWidth;

    lastPage.drawImage(sigImage, {
      x: pageWidth - sigWidth - 40,
      y: 30,
      width: sigWidth,
      height: sigHeight,
    });

    // Save signed PDF
    const signedBytes = await pdfDoc.save();
    const signedDir = path.join(__dirname, '..', '..', '..', 'uploads', 'delivery-notes', 'signed');
    fs.mkdirSync(signedDir, { recursive: true });
    const signedFilename = `signed_${orderId}_${Date.now()}.pdf`;
    fs.writeFileSync(path.join(signedDir, signedFilename), signedBytes);

    // Delete old signed PDF if exists
    if (order.signedDeliveryNoteUrl) {
      const oldSignedPath = path.join(__dirname, '..', '..', '..', order.signedDeliveryNoteUrl);
      if (fs.existsSync(oldSignedPath)) fs.unlinkSync(oldSignedPath);
    }

    const signedDeliveryNoteUrl = `/uploads/delivery-notes/signed/${signedFilename}`;
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { signedDeliveryNoteUrl },
    });

    return { signedDeliveryNoteUrl: updated.signedDeliveryNoteUrl };
  }

  private calcTotalPallets(order: any): number {
    return (order.palletCount || 0) + (order.faucetCount || 0) + (order.bathtubCount || 0) +
      (order.panelCount || 0) + (order.showerCount || 0) + (order.rodCount || 0) + (order.cabinetCount || 0);
  }

  async scanPallet(userId: number, barcode: string, scanType: 'LOAD' | 'UNLOAD') {
    // Parse barcode format: orderNumber-palletIndex
    const parts = barcode.split('-');
    if (parts.length < 2) throw new AppError(400, 'INVALID_BARCODE', 'ברקוד לא תקין');
    const palletIndex = parseInt(parts[parts.length - 1]);
    const orderNumber = parts.slice(0, -1).join('-');
    if (isNaN(palletIndex)) throw new AppError(400, 'INVALID_BARCODE', 'ברקוד לא תקין');

    // Find order by order number
    const order = await prisma.order.findFirst({
      where: { orderNumber },
      include: { route: { include: { truck: true } } },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', `הזמנה ${orderNumber} לא נמצאה`);

    const totalPallets = this.calcTotalPallets(order);
    if (palletIndex < 1 || palletIndex > totalPallets) {
      throw new AppError(400, 'INVALID_PALLET', `מספר משטח ${palletIndex} לא תקין. להזמנה ${totalPallets} משטחים`);
    }

    // For LOAD: verify order belongs to driver's truck
    if (scanType === 'LOAD') {
      const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });
      if (!driverProfile) throw new AppError(403, 'NOT_DRIVER', 'משתמש אינו נהג');

      const assignment = await prisma.truckAssignment.findFirst({
        where: { driverProfileId: driverProfile.id, isActive: true },
        include: { truck: true },
      });
      if (!assignment) throw new AppError(403, 'NO_TRUCK', 'אין משאית משויכת');

      if (!order.route || order.route.truckId !== assignment.truckId) {
        // Find which truck this order belongs to
        const otherTruckName = order.route?.truck?.name || 'לא ידוע';
        throw new AppError(400, 'WRONG_TRUCK', `משטח זה לא שייך למשאית שלך. המשטח שייך למשאית ${otherTruckName}`);
      }
    }

    // Check if already scanned
    const existing = await prisma.palletScan.findUnique({
      where: { orderId_palletIndex_scanType: { orderId: order.id, palletIndex, scanType } },
    });
    if (existing) {
      return { status: 'ALREADY_SCANNED', orderNumber, palletIndex, totalPallets, message: `משטח ${palletIndex}/${totalPallets} כבר נסרק` };
    }

    // Save scan
    await prisma.palletScan.create({
      data: { orderId: order.id, palletIndex, scanType, scannedBy: userId },
    });

    return { status: 'OK', orderNumber, palletIndex, totalPallets, message: `נסרק: הזמנה ${orderNumber} משטח ${palletIndex}/${totalPallets}` };
  }

  async getLoadingStatus(userId: number, date?: string) {
    const driverProfile = await prisma.driverProfile.findUnique({ where: { userId } });
    if (!driverProfile) throw new AppError(403, 'NOT_DRIVER', 'משתמש אינו נהג');

    const assignment = await prisma.truckAssignment.findFirst({
      where: { driverProfileId: driverProfile.id, isActive: true },
      include: { truck: true },
    });
    if (!assignment) return { orders: [], totalPallets: 0, scannedPallets: 0 };

    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate); endOfDay.setHours(23, 59, 59, 999);

    const routes = await prisma.route.findMany({
      where: { truckId: assignment.truckId, routeDate: { gte: startOfDay, lte: endOfDay } },
      include: {
        orders: {
          where: { status: { in: ['APPROVED', 'SENT_TO_DRIVER', 'COMPLETED'] } },
          include: { palletScans: { where: { scanType: 'LOAD' } } },
        },
      },
    });

    const orders = routes.flatMap(r => r.orders);
    let totalPallets = 0;
    let scannedPallets = 0;
    const orderStatus = orders.map(o => {
      const total = this.calcTotalPallets(o);
      const scanned = o.palletScans.length;
      totalPallets += total;
      scannedPallets += scanned;
      return { orderId: o.id, orderNumber: o.orderNumber, customerName: o.customerName, totalPallets: total, scannedPallets: scanned };
    });

    return { orders: orderStatus, totalPallets, scannedPallets };
  }

  async getUnloadingStatus(orderId: number) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { palletScans: { where: { scanType: 'UNLOAD' } } },
    });
    if (!order) throw new AppError(404, 'NOT_FOUND', 'הזמנה לא נמצאה');

    const totalPallets = this.calcTotalPallets(order);
    const scannedPallets = order.palletScans.length;

    return { orderId, orderNumber: order.orderNumber, totalPallets, scannedPallets, complete: scannedPallets >= totalPallets };
  }
}

export const driverService = new DriverService();
