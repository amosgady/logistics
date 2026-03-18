import { Client, FindPlaceFromTextResponseData, PlaceInputType } from '@googlemaps/google-maps-services-js';
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

      // 1. Try Geocoding API first (most precise)
      const geoResult = await this.tryGeocode(fullAddress, city);
      if (geoResult.valid) return geoResult;

      // 2. Fallback: Places API findPlaceFromText (works like Google Maps search bar)
      const placesResult = await this.tryFindPlace(fullAddress, city);
      if (placesResult.valid) return placesResult;

      // 3. Return whatever geocoding gave us (with formattedAddress for display)
      return geoResult;
    } catch (err) {
      console.error('Geocoding error:', err);
      return { valid: false, lat: null, lng: null, formattedAddress: null, locationType: null };
    }
  }

  private async tryGeocode(fullAddress: string, city: string): Promise<GeocodeOutput> {
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

    const isAcceptable = this.isAddressInCity(formatted, city)
      && ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE'].includes(locationType);

    return {
      valid: isAcceptable,
      lat: isAcceptable ? lat : null,
      lng: isAcceptable ? lng : null,
      formattedAddress: formatted,
      locationType: locationType || null,
    };
  }

  private async tryFindPlace(fullAddress: string, city: string): Promise<GeocodeOutput> {
    try {
      const response = await mapsClient.findPlaceFromText({
        params: {
          input: fullAddress,
          inputtype: PlaceInputType.textQuery,
          fields: ['formatted_address', 'geometry', 'name'],
          language: 'he' as any,
          key: env.GOOGLE_MAPS_API_KEY,
        },
      });

      const candidates = response.data.candidates || [];
      if (candidates.length === 0) {
        return { valid: false, lat: null, lng: null, formattedAddress: null, locationType: 'PLACES_NOT_FOUND' };
      }

      const place = candidates[0];
      const lat = place.geometry?.location?.lat;
      const lng = place.geometry?.location?.lng;
      const formatted = place.formatted_address || place.name || '';

      if (lat == null || lng == null) {
        return { valid: false, lat: null, lng: null, formattedAddress: formatted, locationType: 'PLACES_NO_COORDS' };
      }

      const isAcceptable = this.isAddressInCity(formatted, city);

      return {
        valid: isAcceptable,
        lat: isAcceptable ? lat : null,
        lng: isAcceptable ? lng : null,
        formattedAddress: formatted,
        locationType: 'PLACES_API',
      };
    } catch (err) {
      console.error('Places API fallback error:', err);
      return { valid: false, lat: null, lng: null, formattedAddress: null, locationType: null };
    }
  }

  /** Check that the formatted address actually contains the expected city name */
  private isAddressInCity(formatted: string, city: string): boolean {
    const cityNormalized = city.trim().replace(/[-–]/g, ' ');
    const formattedNormalized = formatted.replace(/[-–]/g, ' ');
    return formattedNormalized.includes(cityNormalized)
      || formattedNormalized.includes(city.trim());
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
