const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || '';
const TWILIO_WA_TEMPLATE_SID = process.env.TWILIO_WA_TEMPLATE_SID || '';

interface SendResult {
  success: boolean;
  messageSid?: string;
  error?: string;
}

class WhatsappService {
  /**
   * Normalize phone to +972 format for WhatsApp.
   */
  private normalizePhone(phone: string): string {
    let normalized = phone.replace(/[-\s]/g, '');
    if (normalized.startsWith('0')) {
      normalized = '+972' + normalized.slice(1);
    } else if (!normalized.startsWith('+')) {
      normalized = '+972' + normalized;
    }
    return normalized;
  }

  /**
   * Send a WhatsApp template message via Twilio.
   */
  async sendTemplate(phone: string, contentVariables: Record<string, string>): Promise<SendResult> {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_NUMBER) {
      return { success: false, error: 'Twilio WhatsApp not configured' };
    }

    if (!TWILIO_WA_TEMPLATE_SID) {
      return { success: false, error: 'WhatsApp template SID not configured' };
    }

    const normalizedPhone = this.normalizePhone(phone);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

    const body = new URLSearchParams({
      To: `whatsapp:${normalizedPhone}`,
      From: `whatsapp:${this.normalizePhone(TWILIO_WHATSAPP_NUMBER)}`,
      ContentSid: TWILIO_WA_TEMPLATE_SID,
      ContentVariables: JSON.stringify(contentVariables),
    });

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      const data = await response.json();

      if (data.sid) {
        console.log(`[WhatsApp] Message sent to ${normalizedPhone}, SID: ${data.sid}`);
        return { success: true, messageSid: data.sid };
      } else {
        console.error('[WhatsApp] Send failed:', data);
        return { success: false, error: data.message || 'Unknown error' };
      }
    } catch (err: any) {
      console.error('[WhatsApp] Error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

export const whatsappService = new WhatsappService();
