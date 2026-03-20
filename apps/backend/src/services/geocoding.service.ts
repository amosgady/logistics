import { Client } from '@googlemaps/google-maps-services-js';
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
      // Build multiple address format variations to try
      const addressVariations = this.buildAddressVariations(address, city);

      let lastResult: GeocodeOutput = { valid: false, lat: null, lng: null, formattedAddress: null, locationType: null };

      for (const variation of addressVariations) {
        const geoResult = await this.tryGeocode(variation, city, address);
        if (geoResult.valid) {
          console.log(`[Geocoding] Found via variation: "${variation}"`);
          return geoResult;
        }
        // Keep the first result for fallback display
        if (!lastResult.formattedAddress && geoResult.formattedAddress) {
          lastResult = geoResult;
        }
      }

      return lastResult;
    } catch (err) {
      console.error('Geocoding error:', err);
      return { valid: false, lat: null, lng: null, formattedAddress: null, locationType: null };
    }
  }

  /**
   * Build multiple address format variations for the Geocoding API.
   * Google's Geocoding API sometimes fails with certain Hebrew address formats
   * but succeeds with slightly different phrasing.
   */
  private buildAddressVariations(address: string, city: string): string[] {
    const variations: string[] = [];
    let trimmedAddress = address.trim();
    const trimmedCity = city.trim();

    // Expand common Hebrew abbreviations
    const abbreviations: [RegExp, string][] = [
      [/^שח"ל\b/,  'שדרות חיילי הנח"ל'],
      [/^שח״ל\b/,  'שדרות חיילי הנח"ל'],
      [/^רמב"ם\b/, 'רבי משה בן מימון'],
      [/^רמב״ם\b/, 'רבי משה בן מימון'],
      [/^רש"י\b/,  'רבי שלמה יצחקי'],
      [/^רש״י\b/,  'רבי שלמה יצחקי'],
      [/^רמח"ל\b/, 'רבי משה חיים לוצאטו'],
      [/^רמח״ל\b/, 'רבי משה חיים לוצאטו'],
      [/^צה"ל\b/,  'צבא הגנה לישראל'],
      [/^צה״ל\b/,  'צבא הגנה לישראל'],
      [/^אצ"ל\b/,  'ארגון צבאי לאומי'],
      [/^אצ״ל\b/,  'ארגון צבאי לאומי'],
      [/^לח"י\b/,  'לוחמי חרות ישראל'],
      [/^לח״י\b/,  'לוחמי חרות ישראל'],
    ];
    for (const [pattern, replacement] of abbreviations) {
      if (pattern.test(trimmedAddress)) {
        trimmedAddress = trimmedAddress.replace(pattern, replacement);
        break;
      }
    }

    // 1. Original: "address, city, ישראל"
    variations.push(`${trimmedAddress}, ${trimmedCity}, ישראל`);

    // 2. With "רחוב" prefix if not already present
    if (!trimmedAddress.startsWith('רחוב ') && !trimmedAddress.startsWith('רח׳ ') && !trimmedAddress.startsWith("רח' ")) {
      variations.push(`רחוב ${trimmedAddress}, ${trimmedCity}, ישראל`);
    }

    // 3. Without "ישראל" suffix (sometimes helps)
    variations.push(`${trimmedAddress}, ${trimmedCity}`);

    // 4. Street name only without house number (for streets Google doesn't have numbers for)
    const streetOnly = trimmedAddress.replace(/\s+\d+.*$/, '').trim();
    if (streetOnly !== trimmedAddress) {
      variations.push(`${streetOnly}, ${trimmedCity}, ישראל`);
      // Also try with "רחוב" prefix + no number
      if (!streetOnly.startsWith('רחוב ') && !streetOnly.startsWith('רח׳ ') && !streetOnly.startsWith("רח' ")) {
        variations.push(`רחוב ${streetOnly}, ${trimmedCity}, ישראל`);
      }
    }

    // 5. With "שד'" prefix for boulevards (שדרות) if address looks like a named road
    if (!trimmedAddress.startsWith('שד׳ ') && !trimmedAddress.startsWith("שד' ") && !trimmedAddress.startsWith('שדרות ')) {
      // Only add this if it doesn't already have a street prefix
      if (!trimmedAddress.startsWith('רחוב ') && !trimmedAddress.startsWith('רח׳ ') && !trimmedAddress.startsWith("רח' ")) {
        variations.push(`שדרות ${trimmedAddress}, ${trimmedCity}, ישראל`);
      }
    }

    return variations;
  }

  private async tryGeocode(fullAddress: string, city: string, originalAddress?: string): Promise<GeocodeOutput> {
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

    const inCity = this.isAddressInCity(formatted, city);
    const validType = ['ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER'].includes(locationType);
    const streetMatch = originalAddress ? this.isStreetMatching(originalAddress, formatted) : true;

    const isAcceptable = inCity && validType && streetMatch;

    return {
      valid: isAcceptable,
      lat: (inCity && validType) ? lat : null,
      lng: (inCity && validType) ? lng : null,
      formattedAddress: formatted + ((!streetMatch && inCity && validType) ? ' ⚠️' : ''),
      locationType: locationType || null,
    };
  }

  /** Check that the formatted address actually contains the expected city name */
  private isAddressInCity(formatted: string, city: string): boolean {
    const cityNormalized = city.trim().replace(/[-–]/g, ' ');
    const formattedNormalized = formatted.replace(/[-–]/g, ' ');
    return formattedNormalized.includes(cityNormalized)
      || formattedNormalized.includes(city.trim());
  }

  /** Check that the street in the returned address somewhat matches the original */
  private isStreetMatching(originalAddress: string, formattedAddress: string): boolean {
    // Extract the street name from original (remove house number)
    const origStreet = originalAddress.trim().replace(/\s+\d+.*$/, '').trim();
    // Remove common prefixes for comparison
    const cleanOrig = origStreet
      .replace(/^(רחוב|רח'|רח׳|שדרות|שד'|שד׳)\s+/i, '')
      .replace(/["״׳']/g, '')
      .trim();

    if (cleanOrig.length < 2) return true; // Too short to compare

    const cleanFormatted = formattedAddress
      .replace(/["״׳']/g, '')
      .replace(/\d+/g, '')
      .trim();

    // Check if any significant part of the original street appears in the result
    // Split into words and check if at least one meaningful word matches
    const origWords = cleanOrig.split(/\s+/).filter(w => w.length >= 2);
    return origWords.some(word => cleanFormatted.includes(word));
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
