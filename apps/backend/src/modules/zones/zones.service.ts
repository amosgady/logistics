import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';

export class ZonesService {
  async getAll() {
    return prisma.zone.findMany({
      include: { cities: { select: { id: true, city: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async getById(id: number) {
    const zone = await prisma.zone.findUnique({
      where: { id },
      include: { cities: { select: { id: true, city: true } } },
    });
    if (!zone) throw new AppError(404, 'NOT_FOUND', 'אזור לא נמצא');
    return zone;
  }

  async create(data: { name: string; nameHe: string; cities?: string[] }) {
    return prisma.zone.create({
      data: {
        name: data.name,
        nameHe: data.nameHe,
        cities: data.cities
          ? { create: data.cities.map((city) => ({ city })) }
          : undefined,
      },
      include: { cities: { select: { id: true, city: true } } },
    });
  }

  async update(id: number, data: { name?: string; nameHe?: string }) {
    return prisma.zone.update({
      where: { id },
      data,
      include: { cities: { select: { id: true, city: true } } },
    });
  }

  async addCities(zoneId: number, cities: string[]) {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new AppError(404, 'NOT_FOUND', 'אזור לא נמצא');

    const results = { added: 0, skipped: 0 };
    for (const city of cities) {
      try {
        await prisma.zoneCity.create({ data: { zoneId, city } });
        results.added++;
      } catch {
        results.skipped++;
      }
    }
    return results;
  }

  async removeCity(cityId: number) {
    await prisma.zoneCity.delete({ where: { id: cityId } });
  }

  async assignZonesToOrders(orderIds: number[]) {
    const zones = await prisma.zone.findMany({ include: { cities: true } });

    const cityZoneMap = new Map<string, number>();
    for (const zone of zones) {
      for (const zoneCity of zone.cities) {
        cityZoneMap.set(zoneCity.city, zone.id);
      }
    }

    const results = { assigned: 0, unmatched: 0, alreadyAssigned: 0 };

    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, city: true, zoneId: true, zoneOverride: true },
    });

    for (const order of orders) {
      if (order.zoneOverride) {
        results.alreadyAssigned++;
        continue;
      }
      const zoneId = cityZoneMap.get(order.city);
      if (zoneId) {
        await prisma.order.update({
          where: { id: order.id },
          data: { zoneId },
        });
        results.assigned++;
      } else {
        results.unmatched++;
      }
    }

    return results;
  }
}

export const zonesService = new ZonesService();
