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

  async delete(id: number) {
    const zone = await prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new AppError(404, 'NOT_FOUND', 'אזור לא נמצא');

    // Unlink orders from this zone
    await prisma.order.updateMany({
      where: { zoneId: id },
      data: { zoneId: null },
    });

    // Unlink installer profiles from this zone
    await prisma.installerProfile.updateMany({
      where: { zoneId: id },
      data: { zoneId: null },
    });

    // Delete all cities, then the zone
    await prisma.zoneCity.deleteMany({ where: { zoneId: id } });
    await prisma.zone.delete({ where: { id } });
  }

  async replaceCities(zoneId: number, cities: string[]) {
    const zone = await prisma.zone.findUnique({ where: { id: zoneId } });
    if (!zone) throw new AppError(404, 'NOT_FOUND', 'אזור לא נמצא');

    // Delete all existing cities
    await prisma.zoneCity.deleteMany({ where: { zoneId } });

    // Add new cities (skip duplicates within the list)
    const unique = [...new Set(cities.map((c) => c.trim()).filter(Boolean))];
    let added = 0;
    for (const city of unique) {
      try {
        await prisma.zoneCity.create({ data: { zoneId, city } });
        added++;
      } catch {
        // skip duplicates
      }
    }
    return { added, total: unique.length };
  }

  async importCityZones(rows: { city: string; zone: string }[]) {
    // Group cities by zone name
    const zoneMap = new Map<string, string[]>();
    for (const row of rows) {
      const zoneName = row.zone.trim();
      const city = row.city.trim();
      if (!zoneName || !city) continue;
      if (!zoneMap.has(zoneName)) zoneMap.set(zoneName, []);
      zoneMap.get(zoneName)!.push(city);
    }

    const results = { zonesCreated: 0, zonesUpdated: 0, citiesAdded: 0 };

    for (const [zoneName, cities] of zoneMap) {
      // Find zone by nameHe or name
      let zone = await prisma.zone.findFirst({
        where: { OR: [{ nameHe: zoneName }, { name: zoneName }] },
      });

      if (!zone) {
        // Create new zone
        zone = await prisma.zone.create({
          data: { name: zoneName, nameHe: zoneName },
        });
        results.zonesCreated++;
      } else {
        results.zonesUpdated++;
      }

      // Delete existing cities for this zone and replace
      await prisma.zoneCity.deleteMany({ where: { zoneId: zone.id } });

      const unique = [...new Set(cities)];
      for (const city of unique) {
        try {
          await prisma.zoneCity.create({ data: { zoneId: zone.id, city } });
          results.citiesAdded++;
        } catch {
          // skip duplicates
        }
      }
    }

    return results;
  }

  async reassignZonesPending() {
    const pendingOrders = await prisma.order.findMany({
      where: { status: 'PENDING', zoneOverride: { not: true } },
      select: { id: true },
    });
    if (pendingOrders.length === 0) return { assigned: 0, unmatched: 0, alreadyAssigned: 0 };
    return this.assignZonesToOrders(pendingOrders.map((o) => o.id));
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
