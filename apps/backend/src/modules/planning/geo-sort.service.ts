import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';
import { geocodingService } from '../../services/geocoding.service';

// Warehouse origin: Perfect Line logistics, Ashdod
const WAREHOUSE_COORDINATES = { lat: 31.8244, lng: 34.6540 };

/**
 * Calculate distance between two lat/lng points in km (Haversine formula)
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface GeoSortInput {
  orderIds: number[];
}

interface GeoSortResult {
  sorted: { orderId: number; geoSortOrder: number }[];
  noCoordinates: number[];
}

class GeoSortService {
  /**
   * Sort orders by geographic proximity using nearest-neighbor algorithm.
   * Starts from the warehouse and picks the closest unvisited order each time.
   */
  async geoSortOrders(input: GeoSortInput): Promise<GeoSortResult> {
    const { orderIds } = input;

    if (orderIds.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'לא נבחרו הזמנות');
    }

    // Fetch orders with coordinates
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: {
        id: true,
        address: true,
        city: true,
        latitude: true,
        longitude: true,
        geocodeValid: true,
      },
    });

    // Auto-geocode orders missing coordinates
    const needsGeocoding = orders.filter(
      (o) => o.latitude == null || o.longitude == null || o.geocodeValid == null
    );
    if (needsGeocoding.length > 0) {
      await geocodingService.batchGeocodeOrders(needsGeocoding.map((o) => o.id));
      // Re-fetch after geocoding
      const refreshed = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, latitude: true, longitude: true, geocodeValid: true },
      });
      for (const r of refreshed) {
        const orig = orders.find((o) => o.id === r.id);
        if (orig) {
          orig.latitude = r.latitude;
          orig.longitude = r.longitude;
          orig.geocodeValid = r.geocodeValid;
        }
      }
    }

    // Split into orders with and without valid coordinates
    const withCoords = orders.filter(
      (o) => o.latitude != null && o.longitude != null && o.geocodeValid !== false
    );
    const noCoordinates = orders
      .filter((o) => o.latitude == null || o.longitude == null || o.geocodeValid === false)
      .map((o) => o.id);

    if (withCoords.length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'אין הזמנות עם קואורדינטות תקינות');
    }

    // Nearest-neighbor algorithm starting from warehouse
    const sorted: { orderId: number; geoSortOrder: number }[] = [];
    const remaining = new Set(withCoords.map((o) => o.id));
    let currentLat = WAREHOUSE_COORDINATES.lat;
    let currentLng = WAREHOUSE_COORDINATES.lng;
    let sortOrder = 1;

    while (remaining.size > 0) {
      let nearestId = -1;
      let nearestDist = Infinity;

      for (const id of remaining) {
        const order = withCoords.find((o) => o.id === id)!;
        const dist = haversineDistance(
          currentLat,
          currentLng,
          order.latitude!,
          order.longitude!
        );
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestId = id;
        }
      }

      const nearestOrder = withCoords.find((o) => o.id === nearestId)!;
      sorted.push({ orderId: nearestId, geoSortOrder: sortOrder });
      currentLat = nearestOrder.latitude!;
      currentLng = nearestOrder.longitude!;
      remaining.delete(nearestId);
      sortOrder++;
    }

    // Add orders without coordinates at the end
    for (const id of noCoordinates) {
      sorted.push({ orderId: id, geoSortOrder: sortOrder });
      sortOrder++;
    }

    // Update geoSortOrder in database
    await prisma.$transaction(
      sorted.map((s) =>
        prisma.order.update({
          where: { id: s.orderId },
          data: { geoSortOrder: s.geoSortOrder },
        })
      )
    );

    return { sorted, noCoordinates };
  }

  /**
   * Clear geo sort order for given orders (e.g., when removing from truck)
   */
  async clearGeoSort(orderIds: number[]): Promise<void> {
    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
      data: { geoSortOrder: null },
    });
  }
}

export const geoSortService = new GeoSortService();
