import prisma from '../utils/prisma';
import { env } from '../config/env';

interface SmsCredentials {
  username: string;
  password: string;
  apiToken: string | null;
  sender: string;
}

export interface SendResult {
  success: boolean;
  providerRef?: string;
  error?: string;
}

export interface TokenResult {
  success: boolean;
  token?: string;
  expirationDate?: string;
  error?: string;
}

/**
 * 019 SMS service.
 * Uses the new JSON API: POST https://019sms.co.il/api
 * Authentication via Bearer token in Authorization header.
 */
export class SmsService {
  private readonly apiUrl = 'https://019sms.co.il/api';

  /**
   * Get credentials – first try DB settings, then fall back to env vars.
   */
  async getCredentials(): Promise<SmsCredentials | null> {
    const dbSettings = await prisma.smsSettings.findFirst({
      where: { isActive: true },
    });

    if (dbSettings) {
      return {
        username: dbSettings.inforuUsername,
        password: dbSettings.inforuPassword,
        apiToken: dbSettings.apiToken || null,
        sender: dbSettings.senderName,
      };
    }

    if (env.INFORU_USERNAME && env.INFORU_PASSWORD) {
      return {
        username: env.INFORU_USERNAME,
        password: env.INFORU_PASSWORD,
        apiToken: null,
        sender: env.INFORU_SENDER || 'Delivery',
      };
    }

    return null;
  }

  /**
   * Generate an API token using username and password.
   * The token is saved to the database for future use.
   */
  async generateToken(): Promise<TokenResult> {
    const creds = await this.getCredentials();
    if (!creds) {
      return { success: false, error: 'SMS not configured – missing credentials' };
    }

    try {
      const payload = {
        getApiToken: {
          user: {
            username: creds.username,
            password: creds.password,
          },
          username: creds.username,
          action: 'new',
        },
      };

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.status === 0 && data.message) {
        // Save the token to the database
        const dbSettings = await prisma.smsSettings.findFirst({
          where: { isActive: true },
        });

        if (dbSettings) {
          await prisma.smsSettings.update({
            where: { id: dbSettings.id },
            data: { apiToken: data.message },
          });
        }

        return {
          success: true,
          token: data.message,
          expirationDate: data.expiration_date || null,
        };
      }

      return {
        success: false,
        error: `שגיאה ביצירת טוקן: ${JSON.stringify(data)}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  /**
   * Send SMS via 019 JSON API.
   */
  async send(phones: string[], message: string, senderOverride?: string): Promise<SendResult> {
    const creds = await this.getCredentials();
    if (!creds) {
      return { success: false, error: 'SMS not configured – missing credentials' };
    }

    if (!creds.apiToken) {
      return { success: false, error: 'חסר טוקן API. יש ליצור טוקן בהגדרות SMS' };
    }

    // Clean phone numbers: remove dashes, spaces; keep digits
    const cleanPhones = phones
      .map((p) => p.replace(/[^0-9]/g, ''))
      .filter((p) => p.length >= 9);

    if (cleanPhones.length === 0) {
      return { success: false, error: 'No valid phone numbers' };
    }

    const payload = {
      sms: {
        user: {
          username: creds.username,
        },
        source: senderOverride || creds.sender,
        destinations: {
          phone: cleanPhones.map((p) => ({ _: p })),
        },
        message,
      },
    };

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${creds.apiToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      // 019 API returns status 0 for success
      if (data.status === 0) {
        return {
          success: true,
          providerRef: data.message_id || data.id || String(data.status),
        };
      }

      return {
        success: false,
        error: `019 API: ${data.message || JSON.stringify(data)}`,
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  }

  /**
   * Get the default SMS template.
   */
  async getTemplate(): Promise<string> {
    const dbSettings = await prisma.smsSettings.findFirst({
      where: { isActive: true },
    });
    return (
      dbSettings?.messageTemplate ||
      'שלום {customerName}, מסירת הזמנתך מתוכננת לתאריך {deliveryDate} בשעות {timeWindow}. לבירורים: {companyPhone}'
    );
  }

  /**
   * Expand a template with order data.
   */
  expandTemplate(
    template: string,
    data: {
      customerName: string;
      deliveryDate: string;
      timeWindow?: string;
      address?: string;
      city?: string;
      orderNumber?: string;
    }
  ): string {
    const timeLabel = data.timeWindow === 'MORNING' ? '08:00-12:00' : data.timeWindow === 'AFTERNOON' ? '12:00-16:00' : '';

    return template
      .replace(/{customerName}/g, data.customerName || '')
      .replace(/{deliveryDate}/g, data.deliveryDate || '')
      .replace(/{timeWindow}/g, timeLabel)
      .replace(/{address}/g, data.address || '')
      .replace(/{city}/g, data.city || '')
      .replace(/{orderNumber}/g, data.orderNumber || '')
      .replace(/{companyPhone}/g, ''); // Will be filled from settings if needed
  }
}

export const smsService = new SmsService();
