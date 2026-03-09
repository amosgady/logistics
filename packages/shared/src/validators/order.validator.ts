import { z } from 'zod';

export const csvImportRowSchema = z.object({
  orderNumber: z.string().min(1, 'מספר הזמנה חובה'),
  orderDate: z.string().min(1, 'תאריך הזמנה חובה'),
  customerName: z.string().min(1, 'שם לקוח חובה'),
  address: z.string().min(1, 'כתובת חובה'),
  city: z.string().min(1, 'עיר חובה'),
  phone: z.string().min(1, 'טלפון חובה'),
  contactPerson: z.string().optional(),
  product: z.string().min(1, 'פריט חובה'),
  description: z.string().optional(),
  quantity: z.number().int().positive('כמות חייבת להיות חיובית'),
  price: z.number().nonnegative('מחיר לא יכול להיות שלילי'),
  weight: z.number().nonnegative('משקל לא יכול להיות שלילי'),
  currentStock: z.number().int().nonnegative('מלאי לא יכול להיות שלילי'),
});

export type CsvImportRow = z.infer<typeof csvImportRowSchema>;

export const updateDeliveryDateSchema = z.object({
  deliveryDate: z.string().datetime(),
});

export const updateCoordinationSchema = z.object({
  coordinationStatus: z.enum(['NOT_STARTED', 'COORDINATED']),
  coordinationNotes: z.string().optional(),
});

export const updateZoneSchema = z.object({
  zoneId: z.number().int().positive(),
});

export const bulkStatusSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1),
  targetStatus: z.enum([
    'PENDING', 'PLANNING', 'APPROVED', 'SENT_TO_DRIVER', 'COMPLETED', 'CANCELLED',
  ]),
});
