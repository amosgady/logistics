import nodemailer from 'nodemailer';
import { env } from '../config/env';

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  private getTransporter(): nodemailer.Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
    return this.transporter;
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    const transporter = this.getTransporter();

    const htmlContent = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #1976d2; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
          <h2 style="margin: 0;">אימות דו-שלבי</h2>
        </div>
        <div style="background-color: #f5f5f5; padding: 30px; border-radius: 0 0 8px 8px;">
          <p style="font-size: 16px; color: #333;">הקוד שלך להתחברות:</p>
          <div style="background-color: white; border: 2px solid #1976d2; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1976d2;">${code}</span>
          </div>
          <p style="font-size: 14px; color: #666;">הקוד תקף ל-10 דקות.</p>
          <p style="font-size: 14px; color: #666;">אם לא ביקשת קוד זה, התעלם מהודעה זו.</p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'קוד אימות - מערכת ניהול הובלות',
      html: htmlContent,
    });

    console.log(`[EmailService] Verification code sent to ${to}`);
  }
}

export const emailService = new EmailService();
