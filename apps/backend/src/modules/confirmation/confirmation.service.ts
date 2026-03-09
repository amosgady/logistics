import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

export class ConfirmationService {
  /**
   * Get order details by confirmation token (public – limited fields).
   */
  async getOrderByToken(token: string) {
    const order = await prisma.order.findUnique({
      where: { confirmToken: token },
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        address: true,
        city: true,
        deliveryDate: true,
        timeWindow: true,
        customerResponse: true,
        respondedAt: true,
      },
    });

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'קישור לא תקין או שפג תוקפו');
    }

    return order;
  }

  /**
   * Submit customer response (confirm / decline) via token.
   */
  async submitResponse(
    token: string,
    response: 'CONFIRMED' | 'DECLINED',
    notes?: string
  ) {
    const order = await prisma.order.findUnique({
      where: { confirmToken: token },
      select: { id: true, customerResponse: true, status: true },
    });

    if (!order) {
      throw new AppError(404, 'NOT_FOUND', 'קישור לא תקין או שפג תוקפו');
    }

    // Allow re-submission (customer changed their mind)
    const updateData: any = {
      customerResponse: response,
      customerNotes: notes || null,
      respondedAt: new Date(),
    };

    // If customer confirmed → auto-set coordination to COORDINATED
    if (response === 'CONFIRMED') {
      updateData.coordinationStatus = 'COORDINATED';

      // Auto-approve if in PLANNING status
      if (order.status === 'PLANNING') {
        updateData.status = 'APPROVED';

        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'APPROVED',
            changedBy: 0, // system
            reason: 'אישור אוטומטי לאחר אישור לקוח',
          },
        });
      }
    }

    return prisma.order.update({
      where: { confirmToken: token },
      data: updateData,
      select: {
        customerResponse: true,
        customerNotes: true,
        respondedAt: true,
      },
    });
  }
}

export const confirmationService = new ConfirmationService();
