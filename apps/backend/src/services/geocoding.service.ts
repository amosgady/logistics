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
      const formatted = result.formatted_address || '';

      // Check that Google actually found the city — if the formatted address
      // is just "ישראל" or doesn't contain the city name, the result is too vague.
      const cityNormalized = city.trim().replace(/[-–]/g, ' ');
      const formattedNormalized = formatted.replace(/[-–]/g, ' ');
      const cityFound = formattedNormalized.includes(cityNormalized)
        || formattedNormalized.includes(city.trim());

      const isAcceptable = cityFound
        && ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE'].includes(locationType);

      return {
        valid: isAcceptable,
        lat: isAcceptable ? lat : null,
        lng: isAcceptable ? lng : null,
        formattedAddress: formatted,
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
          geocodedAddress: geo.formattedAddress,
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
