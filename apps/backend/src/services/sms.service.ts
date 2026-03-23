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
      console.log('[SMS 019] Response:', JSON.stringify(data));

      // 019 API returns status 0 for success
      if (data.status === 0) {
        // Extract reference ID from response - 019 returns shipment_id
        const ref = data.shipment_id || data.message_id || data.id || data.data?.shipment_id ||
                    data.data?.message_id || data.data?.id ||
                    (data.data && Array.isArray(data.data) && data.data[0]?.message_id) ||
                    String(data.status);
        return {
          success: true,
          providerRef: String(ref),
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
  /**
   * Map 019 DLR status code to our delivery status.
   */
  private mapDlrStatus(code: number): string {
    if (code === 0 || code === 102) return 'DELIVERED';
    if (code === 15) return 'KOSHER_PHONE';
    if (code === 103) return 'EXPIRED';
    if (code === -1) return 'PENDING'; // Sent without confirmation
    // All other codes = undelivered
    return 'UNDELIVERED';
  }

  /**
   * Format date for 019 DLR API: "dd/mm/yy hh:mm"
   * Note: server timezone is UTC, 019 expects Israel time (UTC+2/3)
   */
  private formatDlrDate(date: Date): string {
    // Convert to Israel time
    const ilDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
    const d = String(ilDate.getDate()).padStart(2, '0');
    const m = String(ilDate.getMonth() + 1).padStart(2, '0');
    const y = String(ilDate.getFullYear());
    const h = String(ilDate.getHours()).padStart(2, '0');
    const min = String(ilDate.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${h}:${min}`;
  }

  /**
   * Check delivery report for a specific message via 019 DLR API.
   */
  async checkDeliveryReport(providerRef: string, sentAt: Date): Promise<{ status: string; rawCode?: number }> {
    const creds = await this.getCredentials();
    if (!creds || !creds.apiToken) {
      return { status: 'PENDING' };
    }

    const fromDate = new Date(sentAt.getTime() - 5 * 60 * 1000); // 5 min before sent
    const toDate = new Date(); // now

    const payload = {
      dlr: {
        user: { username: creds.username },
        transactions: {
          external_id: [{ _: providerRef }],
        },
        date_range: {
          from: this.formatDlrDate(fromDate),
          to: this.formatDlrDate(toDate),
        },
      },
    };

    console.log('[DLR] Request payload:', JSON.stringify(payload));

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

      // Parse response - look for status in the response
      if (data.status === 0 && data.data && Array.isArray(data.data) && data.data.length > 0) {
        const report = data.data[0];
        const dlrCode = typeof report.status !== 'undefined' ? Number(report.status) : -1;
        return { status: this.mapDlrStatus(dlrCode), rawCode: dlrCode };
      }

      // If no data returned yet, still pending
      if (data.status === 0 && (!data.data || data.data.length === 0)) {
        return { status: 'PENDING' };
      }

      console.log('[DLR] Unexpected response:', JSON.stringify(data));
      return { status: 'PENDING' };
    } catch (err: any) {
      console.error('[DLR] Error checking delivery report:', err.message);
      return { status: 'PENDING' };
    }
  }

  /**
   * Check delivery reports for all pending SMS logs.
   */
  async checkPendingDeliveryReports(): Promise<{ checked: number; updated: number }> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

    const pendingLogs = await prisma.smsLog.findMany({
      where: {
        status: 'SENT',
        deliveryStatus: 'PENDING',
        providerRef: { not: null, notIn: ['0', ''] },
        sentAt: { gte: cutoff },
      },
      take: 50,
      orderBy: { sentAt: 'asc' },
    });

    let updated = 0;

    for (const log of pendingLogs) {
      const result = await this.checkDeliveryReport(log.providerRef!, log.sentAt);

      if (result.status !== 'PENDING') {
        await prisma.smsLog.update({
          where: { id: log.id },
          data: {
            deliveryStatus: result.status,
            deliveryCheckedAt: new Date(),
          },
        });
        updated++;
        console.log(`[DLR] SMS ${log.id} to ${log.phone}: ${result.status} (code: ${result.rawCode})`);
      } else {
        // Update checked time even if still pending
        await prisma.smsLog.update({
          where: { id: log.id },
          data: { deliveryCheckedAt: new Date() },
        });
      }

      // Small delay between API calls to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200));
    }

    return { checked: pendingLogs.length, updated };
  }
}

export const smsService = new SmsService();
