import path from 'path';
import dotenv from 'dotenv';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const env = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  // InforU (019) SMS settings – can also be configured via DB settings
  INFORU_USERNAME: process.env.INFORU_USERNAME || '',
  INFORU_PASSWORD: process.env.INFORU_PASSWORD || '',
  INFORU_SENDER: process.env.INFORU_SENDER || '',
  // Base URL for customer-facing links (confirmation page)
  BASE_URL: process.env.BASE_URL || 'http://localhost:5173',
  // SMTP settings for email (2FA)
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'מערכת ניהול הובלות <noreply@example.com>',
  // Twilio WhatsApp
  TWILIO_WHATSAPP_NUMBER: process.env.TWILIO_WHATSAPP_NUMBER || '',
  TWILIO_WA_TEMPLATE_SID: process.env.TWILIO_WA_TEMPLATE_SID || '',
};
