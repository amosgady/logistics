import api from './api';

export interface SmsSettings {
  id?: number;
  inforuUsername: string;
  inforuPassword: string;
  apiToken?: string;
  senderName: string;
  replySenderPhone?: string;
  messageTemplate: string;
  isActive: boolean;
  confirmationMethod?: 'LINK' | 'REPLY';
  replyTemplate?: string;
}

export interface SmsLogEntry {
  id: number;
  orderId: number | null;
  phone: string;
  message: string;
  status: 'SENT' | 'FAILED' | 'PENDING';
  providerRef: string | null;
  errorMsg: string | null;
  sentBy: number;
  sentAt: string;
  order: { orderNumber: string; customerName: string } | null;
}

export interface SmsReminderConfig {
  id?: number;
  preDeliveryEnabled: boolean;
  preDeliveryDays: number;
  preDeliveryTime: string;
  preDeliveryTemplate: string;
  sameDayEnabled: boolean;
  sameDayHoursBefore: number;
  sameDayTemplate: string;
  nextCustomerEnabled: boolean;
  nextCustomerTemplate: string;
}

export const smsApi = {
  // Send SMS for single order (optionally to a specific phone, optionally with method override)
  sendOrderSms: (orderId: number, phone?: string, method?: 'LINK' | 'REPLY') =>
    api.post(`/sms/send/order/${orderId}`, { ...(phone && { phone }), ...(method && { method }) }).then((r) => r.data),

  // Send SMS for all orders in a route (optionally with method override)
  sendRouteSms: (routeId: number, method?: 'LINK' | 'REPLY') =>
    api.post(`/sms/send/route/${routeId}`, method ? { method } : {}).then((r) => r.data),

  // Send test SMS
  sendTest: (phone: string) =>
    api.post('/sms/test', { phone }).then((r) => r.data),

  // Get SMS logs
  getLogs: (params?: { orderId?: number; limit?: number; offset?: number }) =>
    api.get('/sms/logs', { params }).then((r) => r.data),

  // Get SMS settings
  getSettings: () =>
    api.get('/sms/settings').then((r) => r.data),

  // Update SMS settings
  updateSettings: (settings: SmsSettings) =>
    api.put('/sms/settings', settings).then((r) => r.data),

  // Generate API token from 019
  generateToken: () =>
    api.post('/sms/generate-token').then((r) => r.data),

  // Get reminder config
  getReminderConfig: () =>
    api.get('/sms/reminders').then((r) => r.data),

  // Update reminder config
  updateReminderConfig: (config: SmsReminderConfig) =>
    api.put('/sms/reminders', config).then((r) => r.data),
};
