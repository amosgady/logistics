import prisma from '../../utils/prisma';
import { Department } from '@prisma/client';
import { AppError } from '../../middleware/errorHandler';

export class TrucksService {
  async getAll() {
    return prisma.truck.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: number) {
    const truck = await prisma.truck.findUnique({ where: { id } });
    if (!truck) throw new AppError(404, 'NOT_FOUND', 'משאית לא נמצאה');
    return truck;
  }

  async create(data: {
    name: string;
    licensePlate: string;
    size: 'SMALL' | 'LARGE';
    hasCrane?: boolean;
    maxWeightKg: number;
    maxPallets: number;
    startTime: string;
    endTime: string;
    waitTimePerStop: number;
    department?: Department;
  }) {
    return prisma.truck.create({ data });
  }

  async update(id: number, data: Partial<{
    name: string;
    licensePlate: string;
    size: 'SMALL' | 'LARGE';
    hasCrane: boolean;
    maxWeightKg: number;
    maxPallets: number;
    startTime: string;
    endTime: string;
    waitTimePerStop: number;
    isActive: boolean;
    department: Department | null;
  }>) {
    return prisma.truck.update({ where: { id }, data });
  }

  async delete(id: number) {
    return prisma.truck.update({ where: { id }, data: { isActive: false } });
  }

  async getTruckLoad(truckId: number, routeDate: string) {
    const route = await prisma.route.findFirst({
      where: { truckId, routeDate: new Date(routeDate) },
      include: {
        orders: {
          include: { orderLines: true },
        },
        truck: true,
      },
      orderBy: { roundNumber: 'desc' },
    });

    if (!route) return { totalWeight: 0, totalPallets: 0, orderCount: 0, maxWeight: 0, maxPallets: 0 };

    let totalWeight = 0;
    let totalPallets = 0;

    for (const order of route.orders) {
      for (const line of order.orderLines) {
        totalWeight += Number(line.weight);
      }
      totalPallets += order.palletCount;
    }

    return {
      totalWeight,
      totalPallets,
      orderCount: route.orders.length,
      maxWeight: Number(route.truck!.maxWeightKg),
      maxPallets: route.truck!.maxPallets,
      weightExceeded: totalWeight > Number(route.truck!.maxWeightKg),
      palletsExceeded: totalPallets > route.truck!.maxPallets,
    };
  }
}

export const trucksService = new TrucksService();
