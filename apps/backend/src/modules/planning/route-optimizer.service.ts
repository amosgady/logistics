import { Client } from '@googlemaps/google-maps-services-js';
import { env } from '../../config/env';
import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';
import { geocodingService } from '../../services/geocoding.service';
import { settingsService } from '../settings/settings.service';

const mapsClient = new Client({});

// Warehouse origin: Perfect Line logistics, Ashdod
const WAREHOUSE_ADDRESS = 'מבוא הספנים 2, אשדוד, ישראל';
const WAREHOUSE_COORDINATES = { lat: 31.8244, lng: 34.6540 };

function parseTimeString(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

interface OptimizedStop {
  orderId: number;
  orderNumber: string;
  customerName: string;
  address: string;
  city: string;
  geocodedAddress: string | null;
  sequence: number;
  latitude: number | null;
  longitude: number | null;
  geocodeValid: boolean;
  estimatedArrivalMinutes: number;
  cumulativeTravelMinutes: number;
  legDistanceKm: number;
  legDurationMinutes: number;
  timeWindow: 'MORNING' | 'AFTERNOON';
}

export class RouteOptimizerService {
  async optimizeRoute(routeId: number) {
    const route = await prisma.route.findUnique({
      where: { id: routeId },
      include: {
        truck: true,
        installerProfile: {
          include: { user: { select: { fullName: true } } },
        },
        orders: {
          include: { orderLines: true },
          orderBy: { routeSequence: 'asc' },
        },
      },
    });

    if (!route) throw new AppError(404, 'NOT_FOUND', 'מסלול לא נמצא');
    if (route.orders.length === 0) throw new AppError(400, 'EMPTY_ROUTE', 'אין הזמנות במסלול');

    // Extract timing params polymorphically (truck or installer)
    let waitTimePerStop: number;
    let maxWorkMinutes: number;

    if (route.truck) {
      waitTimePerStop = route.truck.waitTimePerStop;
      const truckStartMinutes = parseTimeString(route.truck.startTime || '08:00');
      const truckEndMinutes = parseTimeString(route.truck.endTime || '17:00');
      maxWorkMinutes = truckEndMinutes - truckStartMinutes;
    } else if (route.installerProfile) {
      const dept = route.installerProfile.department || 'SHOWER_INSTALLATION';
      waitTimePerStop = await settingsService.getWaitTimeForDepartment(dept);
      const startMinutes = parseTimeString(route.installerProfile.startTime || '08:00');
      const endMinutes = parseTimeString(route.installerProfile.endTime || '17:00');
      maxWorkMinutes = endMinutes - startMinutes;
    } else {
      throw new AppError(400, 'INVALID_ROUTE', 'מסלול חייב להיות משויך למשאית או למתקין');
    }

    // Determine final address (end point) for this route
    const finalAddress = route.truck?.finalAddress || route.installerProfile?.finalAddress || null;
    const hasFinalAddress = !!finalAddress;

    // Check if Google Maps API key is available
    if (!env.GOOGLE_MAPS_API_KEY) {
      // Fallback: keep current order, estimate times
      return this.fallbackOptimize(route, waitTimePerStop, maxWorkMinutes);
    }

    // Build waypoints from orders that have coordinates (geocoding is done separately via Orders page)
    const ordersWithCoords = route.orders.filter((o) => o.latitude && o.longitude);
    const ordersWithoutCoords = route.orders.filter((o) => !o.latitude || !o.longitude);

    const suspiciousAddresses = [
      ...ordersWithoutCoords.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        address: `${o.address}, ${o.city}`,
        reason: 'לא נמצאו קואורדינטות',
      })),
    ];

    if (ordersWithCoords.length < 2) {
      return this.fallbackOptimize(route, waitTimePerStop, maxWorkMinutes, suspiciousAddresses);
    }

    try {
      const waypoints = ordersWithCoords.map((o) => `${o.latitude},${o.longitude}`);
      const destination = hasFinalAddress ? finalAddress! : WAREHOUSE_ADDRESS;

      const response = await mapsClient.directions({
        params: {
          origin: WAREHOUSE_ADDRESS,
          destination: destination,
          waypoints: waypoints,
          optimize: true,
          region: 'il',
          language: 'iw' as any,
          key: env.GOOGLE_MAPS_API_KEY,
        },
      });

      const routeData = response.data.routes[0];
      if (!routeData) {
        return this.fallbackOptimize(route, waitTimePerStop, maxWorkMinutes, suspiciousAddresses);
      }

      const optimizedOrder = routeData.waypoint_order;
      const legs = routeData.legs;

      let elapsedMinutes = 0; // total elapsed including waits
      let cumulativeTravelMinutes = 0; // travel time only
      const optimizedStops: OptimizedStop[] = [];

      for (let seqIdx = 0; seqIdx < optimizedOrder.length; seqIdx++) {
        const originalIdx = optimizedOrder[seqIdx];
        const order = ordersWithCoords[originalIdx];
        const leg = legs[seqIdx];
        const travelMinutes = leg.duration.value / 60;
        const legDistanceKm = parseFloat((leg.distance.value / 1000).toFixed(1));

        elapsedMinutes += travelMinutes; // arrive at stop
        cumulativeTravelMinutes += travelMinutes;

        optimizedStops.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          address: order.address || '',
          city: order.city,
          geocodedAddress: (order as any).geocodedAddress || null,
          sequence: seqIdx + 1,
          latitude: order.latitude ? Number(order.latitude) : null,
          longitude: order.longitude ? Number(order.longitude) : null,
          geocodeValid: order.geocodeValid !== false,
          estimatedArrivalMinutes: Math.round(elapsedMinutes),
          cumulativeTravelMinutes: Math.round(cumulativeTravelMinutes),
          legDistanceKm,
          legDurationMinutes: Math.round(travelMinutes),
          timeWindow: elapsedMinutes <= 240 ? 'MORNING' : 'AFTERNOON', // 4 hours from 8:00 = noon (12:00)
        });

        elapsedMinutes += waitTimePerStop; // wait at stop
      }

      // If finalAddress is set, include the last leg (to final destination)
      // If no finalAddress, exclude the last leg (return to warehouse)
      const countedLegs = hasFinalAddress ? legs : legs.slice(0, -1);
      const totalDistanceKm = countedLegs.reduce((sum: number, leg: any) => sum + leg.distance.value / 1000, 0);
      if (hasFinalAddress) {
        const finalLeg = legs[legs.length - 1];
        elapsedMinutes += finalLeg.duration.value / 60;
      }
      const exceedsWorkHours = elapsedMinutes > maxWorkMinutes;

      // Update database
      for (const stop of optimizedStops) {
        // Store arrival time as Israel time: route date at 8:00 Israel time (UTC+2 = 06:00 UTC)
        const arrivalDate = new Date(route.routeDate);
        arrivalDate.setUTCHours(6, 0, 0, 0); // 8:00 Israel time = 06:00 UTC
        arrivalDate.setUTCMinutes(arrivalDate.getUTCMinutes() + stop.estimatedArrivalMinutes);

        await prisma.order.update({
          where: { id: stop.orderId },
          data: {
            routeSequence: stop.sequence,
            timeWindow: stop.timeWindow,
            estimatedArrival: arrivalDate,
            waitTimeMinutes: waitTimePerStop,
          },
        });
      }

      // Update route totals + mark as optimized
      await prisma.route.update({
        where: { id: routeId },
        data: {
          totalDistanceKm: parseFloat(totalDistanceKm.toFixed(1)),
          totalTimeMinutes: Math.round(elapsedMinutes),
          isOptimized: true,
        },
      });

      const lastStop = optimizedStops[optimizedStops.length - 1];
      return {
        optimizedStops,
        warehouseAddress: WAREHOUSE_ADDRESS,
        warehouse: { address: WAREHOUSE_ADDRESS, ...WAREHOUSE_COORDINATES },
        endAddress: hasFinalAddress ? finalAddress! : (lastStop ? `${lastStop.customerName}, ${lastStop.city}` : WAREHOUSE_ADDRESS),
        totalDistanceKm: parseFloat(totalDistanceKm.toFixed(1)),
        totalTimeMinutes: Math.round(elapsedMinutes),
        exceedsWorkHours,
        overtimeMinutes: exceedsWorkHours ? Math.round(elapsedMinutes - maxWorkMinutes) : 0,
        maxWorkMinutes,
        suspiciousAddresses,
      };
    } catch (err: any) {
      const apiError = err?.response?.data || err?.message || err;
      console.error('[RouteOptimizer] Google Maps Directions error:', apiError);
      const fallbackResult = await this.fallbackOptimize(route, waitTimePerStop, maxWorkMinutes, suspiciousAddresses);
      fallbackResult.apiError = typeof apiError === 'object' ? apiError?.error_message || apiError?.status || JSON.stringify(apiError) : String(apiError);
      return fallbackResult;
    }
  }

  private async fallbackOptimize(
    route: any,
    waitTimePerStop: number,
    maxWorkMinutes: number,
    suspiciousAddresses: any[] = []
  ) {
    // Simple fallback: keep current order, estimate 15 min travel between stops
    const estimatedTravelPerStop = 15;
    let elapsedMinutes = 0;
    let cumulativeTravelMinutes = 0;
    const stops: OptimizedStop[] = [];

    for (let i = 0; i < route.orders.length; i++) {
      elapsedMinutes += estimatedTravelPerStop; // arrive
      cumulativeTravelMinutes += estimatedTravelPerStop;
      const order = route.orders[i];

      stops.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        address: order.address || '',
        city: order.city,
        geocodedAddress: (order as any).geocodedAddress || null,
        sequence: i + 1,
        latitude: order.latitude ? Number(order.latitude) : null,
        longitude: order.longitude ? Number(order.longitude) : null,
        geocodeValid: order.geocodeValid !== false,
        estimatedArrivalMinutes: Math.round(elapsedMinutes),
        cumulativeTravelMinutes: Math.round(cumulativeTravelMinutes),
        legDistanceKm: 0,
        legDurationMinutes: estimatedTravelPerStop,
        timeWindow: elapsedMinutes <= 240 ? 'MORNING' : 'AFTERNOON', // 4 hours from 8:00 = noon (12:00)
      });

      elapsedMinutes += waitTimePerStop; // wait at stop

      const arrivalDate = new Date(route.routeDate);
      arrivalDate.setUTCHours(6, 0, 0, 0); // 8:00 Israel time = 06:00 UTC
      arrivalDate.setUTCMinutes(arrivalDate.getUTCMinutes() + Math.round(elapsedMinutes));

      await prisma.order.update({
        where: { id: order.id },
        data: {
          routeSequence: i + 1,
          timeWindow: stops[i].timeWindow,
          estimatedArrival: arrivalDate,
          waitTimeMinutes: waitTimePerStop,
        },
      });
    }

    const totalMinutes = elapsedMinutes; // route ends at last stop, no return trip
    const exceedsWorkHours = totalMinutes > maxWorkMinutes;

    await prisma.route.update({
      where: { id: route.id },
      data: {
        totalTimeMinutes: Math.round(totalMinutes),
        isOptimized: true,
      },
    });

    return {
      optimizedStops: stops,
      warehouseAddress: WAREHOUSE_ADDRESS,
      warehouse: { address: WAREHOUSE_ADDRESS, ...WAREHOUSE_COORDINATES },
      totalDistanceKm: 0,
      totalTimeMinutes: Math.round(totalMinutes),
      exceedsWorkHours,
      overtimeMinutes: exceedsWorkHours ? Math.round(totalMinutes - maxWorkMinutes) : 0,
      maxWorkMinutes,
      suspiciousAddresses,
      fallback: true,
      apiError: null as string | null,
    };
  }

  async approveOvertime(routeId: number) {
    return prisma.route.update({
      where: { id: routeId },
      data: { overtimeApproved: true },
    });
  }
}

export const routeOptimizerService = new RouteOptimizerService();
