import { Client, GeocodeResult } from '@googlemaps/google-maps-services-js';
import { env } from '../config/env';
import prisma from '../utils/prisma';

const mapsClient = new Client({});

export interface GeocodeOutput {
  valid: boolean;
  lat: number | null;
  lng: number | null;
  formattedAddress: string | null;
  locationType: string | null;
}

export class GeocodingService {
  async geocodeAddress(address: string, city: string): Promise<GeocodeOutput> {
    if (!env.GOOGLE_MAPS_API_KEY) {
      console.warn('GOOGLE_MAPS_API_KEY is not configured – skipping geocoding');
      return { valid: false, lat: null, lng: null, formattedAddress: null, locationType: null };
    }

    try {
      const fullAddress = `${address}, ${city}, ישראל`;
      const response = await mapsClient.geocode({
        params: {
          address: fullAddress,
          region: 'il',
          language: 'he',
          key: env.GOOGLE_MAPS_API_KEY,
        },
      });

      if (response.data.results.length === 0) {
        return { valid: false, lat: null, lng: null, formattedAddress: null, locationType: null };
      }

      const result = response.data.results[0];
      const { lat, lng } = result.geometry.location;
      const locationType = String(result.geometry.location_type || '');

      // ROOFTOP = exact building, RANGE_INTERPOLATED = interpolated on street,
      // GEOMETRIC_CENTER = center of street/area – all acceptable for delivery routing.
      // Only APPROXIMATE (city/region level) is too imprecise.
      const isAcceptable = ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER'].includes(locationType);

      return {
        valid: isAcceptable,
        lat,
        lng,
        formattedAddress: result.formatted_address,
        locationType: locationType || null,
      };
    } catch (err) {
      console.error('Geocoding error:', err);
      return { valid: false, lat: null, lng: null, formattedAddress: null, locationType: null };
    }
  }

  async batchGeocodeOrders(orderIds: number[]) {
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds }, latitude: null },
      select: { id: true, address: true, city: true },
    });

    const results = { geocoded: 0, failed: 0, suspicious: [] as { orderId: number; orderNumber?: string; address: string }[] };

    for (const order of orders) {
      const geo = await this.geocodeAddress(order.address, order.city);

      await prisma.order.update({
        where: { id: order.id },
        data: {
          latitude: geo.lat,
          longitude: geo.lng,
          geocodeValid: geo.valid,
        },
      });

      if (geo.valid) {
        results.geocoded++;
      } else {
        results.failed++;
        results.suspicious.push({ orderId: order.id, address: `${order.address}, ${order.city}` });
      }

      // Rate limit: 50ms between requests
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return results;
  }
}

export const geocodingService = new GeocodingService();
