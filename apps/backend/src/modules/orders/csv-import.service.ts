import Papa from 'papaparse';
import { Prisma } from '@prisma/client';
import prisma from '../../utils/prisma';
import { AppError } from '../../middleware/errorHandler';
import { geocodingService } from '../../services/geocoding.service';

interface CsvRow {
  [key: string]: string;
}

// Map Hebrew/English CSV column headers to our fields
const COLUMN_MAP: Record<string, string> = {
  'מספר הזמנה': 'orderNumber',
  "מס' הזמנה": 'orderNumber',
  'order_number': 'orderNumber',
  'תאריך הזמנה': 'orderDate',
  'order_date': 'orderDate',
  'תאריך אספקה': 'deliveryDate',
  'delivery_date': 'deliveryDate',
  'שם לקוח': 'customerName',
  'שם הלקוח': 'customerName',
  'customer_name': 'customerName',
  'כתובת': 'address',
  'address': 'address',
  'עיר': 'city',
  'city': 'city',
  'קומה': 'floor',
  'floor': 'floor',
  'מעלית': 'elevator',
  'elevator': 'elevator',
  'טלפון': 'phone',
  'טלפון 1': 'phone',
  'phone': 'phone',
  'טלפון 2': 'phone2',
  'phone2': 'phone2',
  'איש קשר': 'contactPerson',
  'contact_person': 'contactPerson',
  'פריט': 'product',
  'product': 'product',
  'תיאור': 'description',
  'תאור': 'description',
  'description': 'description',
  "מס' שורה": 'lineNumber',
  'line_number': 'lineNumber',
  'כמות': 'quantity',
  'quantity': 'quantity',
  'מחיר': 'price',
  'מחיר יחידה': 'price',
  'price': 'price',
  'אחוז הנחה': 'discount',
  'discount': 'discount',
  'סה"כ': 'totalPrice',
  'total_price': 'totalPrice',
  'משקל': 'weight',
  'weight': 'weight',
  'מלאי': 'currentStock',
  'current_stock': 'currentStock',
  'מחלקה': 'department',
  'department': 'department',
  'יחידת מידה': 'unitMeasure',
  'unit_measure': 'unitMeasure',
};

const DEPARTMENT_MAP: Record<string, string> = {
  'הובלה כללית': 'GENERAL_TRANSPORT',
  'הובלת מטבחים': 'KITCHEN_TRANSPORT',
  'הובלת דלתות פנים': 'INTERIOR_DOOR_TRANSPORT',
  'התקנת מקלחונים': 'SHOWER_INSTALLATION',
  'התקנת דלתות פנים': 'INTERIOR_DOOR_INSTALLATION',
  'התקנת מטבחים': 'KITCHEN_INSTALLATION',
  'GENERAL_TRANSPORT': 'GENERAL_TRANSPORT',
  'KITCHEN_TRANSPORT': 'KITCHEN_TRANSPORT',
  'INTERIOR_DOOR_TRANSPORT': 'INTERIOR_DOOR_TRANSPORT',
  'SHOWER_INSTALLATION': 'SHOWER_INSTALLATION',
  'INTERIOR_DOOR_INSTALLATION': 'INTERIOR_DOOR_INSTALLATION',
  'KITCHEN_INSTALLATION': 'KITCHEN_INSTALLATION',
};

const FIELD_LABELS: Record<string, string> = {
  product: 'פריט',
  description: 'תיאור',
  quantity: 'כמות',
  price: 'מחיר',
  discount: 'הנחה',
  totalPrice: 'סה"כ',
  weight: 'משקל',
  currentStock: 'מלאי',
};

const ORDER_FIELD_LABELS: Record<string, string> = {
  customerName: 'שם לקוח',
  address: 'כתובת',
  city: 'עיר',
  phone: 'טלפון',
  phone2: 'טלפון 2',
  contactPerson: 'איש קשר',
  floor: 'קומה',
  elevator: 'מעלית',
  deliveryDate: 'תאריך אספקה',
  orderDate: 'תאריך הזמנה',
};

/** Compare order-level fields between existing DB order and CSV row */
function compareOrderFields(existingOrder: any, csvLine: Record<string, string>): FieldChange[] {
  const changes: FieldChange[] = [];

  const stringFields = ['customerName', 'address', 'city', 'phone', 'phone2', 'contactPerson'];
  for (const field of stringFields) {
    const csvVal = csvLine[field];
    if (csvVal === undefined || csvVal === '') continue; // skip if not in CSV
    const oldVal = (existingOrder[field] || '').toString().trim();
    const newVal = csvVal.trim();
    if (oldVal !== newVal) {
      changes.push({
        field,
        fieldLabel: ORDER_FIELD_LABELS[field] || field,
        oldValue: oldVal || '(ריק)',
        newValue: newVal || '(ריק)',
      });
    }
  }

  // Floor (integer)
  if (csvLine.floor !== undefined && csvLine.floor !== '') {
    const oldFloor = existingOrder.floor;
    const newFloor = parseIntOrNull(csvLine.floor);
    const oldStr = oldFloor !== null && oldFloor !== undefined ? oldFloor.toString() : '';
    const newStr = newFloor !== null ? newFloor.toString() : '';
    if (oldStr !== newStr) {
      changes.push({
        field: 'floor',
        fieldLabel: ORDER_FIELD_LABELS.floor,
        oldValue: oldStr || '(ריק)',
        newValue: newStr || '(ריק)',
      });
    }
  }

  // Elevator (boolean)
  if (csvLine.elevator !== undefined && csvLine.elevator !== '') {
    const oldElevator = existingOrder.elevator;
    const newElevator = parseBoolean(csvLine.elevator);
    if (newElevator !== null && oldElevator !== newElevator) {
      changes.push({
        field: 'elevator',
        fieldLabel: ORDER_FIELD_LABELS.elevator,
        oldValue: oldElevator === true ? 'כן' : oldElevator === false ? 'לא' : '(ריק)',
        newValue: newElevator ? 'כן' : 'לא',
      });
    }
  }

  // Dates
  for (const dateField of ['deliveryDate', 'orderDate']) {
    if (csvLine[dateField] !== undefined && csvLine[dateField] !== '') {
      const oldDate = existingOrder[dateField];
      const newDate = parseDate(csvLine[dateField]);
      if (newDate) {
        const oldStr = oldDate ? new Date(oldDate).toLocaleDateString('he-IL') : '';
        const newStr = newDate.toLocaleDateString('he-IL');
        if (oldStr !== newStr) {
          changes.push({
            field: dateField,
            fieldLabel: ORDER_FIELD_LABELS[dateField] || dateField,
            oldValue: oldStr || '(ריק)',
            newValue: newStr,
          });
        }
      }
    }
  }

  return changes;
}

// ────────── Interfaces ──────────

export interface FieldChange {
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
}

export interface ModifiedLine {
  lineNumber: number;
  existingLineId: number;
  changes: FieldChange[];
}

export interface NewLine {
  lineNumber: number;
  product: string;
  description: string | null;
  quantity: number;
}

export interface ConflictOrder {
  orderNumber: string;
  department: string | null;
  existingOrderId: number;
  customerName: string;
  status: string;
  orderChanges: FieldChange[];
  modifiedLines: ModifiedLine[];
  newLines: NewLine[];
  identicalLines: number[];
}

export interface AnalysisSummary {
  totalNewOrders: number;
  totalConflictOrders: number;
  totalModifiedLines: number;
  totalNewLines: number;
  totalIdenticalLines: number;
}

export interface ImportAnalysisResult {
  newOrders: { orderNumber: string; department: string | null; customerName: string; lineCount: number }[];
  conflicts: ConflictOrder[];
  summary: AnalysisSummary;
}

export interface ImportDecision {
  orderNumber: string;
  department: string | null;
  overwriteLineNumbers: number[];
  addNewLines: boolean;
  updateOrderFields: boolean;
}

export interface ImportDecisions {
  conflicts: ImportDecision[];
}

export interface ImportResult {
  imported: number;
  skipped: number;
  updated: number;
  errors: { orderNumber: string; error: string }[];
}

// ────────── Helpers ──────────

function parseDate(value: string): Date | null {
  if (!value) return null;
  const trimmed = value.trim();

  const match = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

function parseBoolean(value: string): boolean | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === 'כן' || trimmed === 'yes' || trimmed === '1' || trimmed === 'true') return true;
  if (trimmed === 'לא' || trimmed === 'no' || trimmed === '0' || trimmed === 'false') return false;
  return null;
}

function parseIntOrNull(value: string): number | null {
  if (!value) return null;
  const num = parseInt(value.trim(), 10);
  return isNaN(num) ? null : num;
}

function parseDecimalOrNull(value: string): Prisma.Decimal | null {
  if (!value) return null;
  const num = parseFloat(value.trim());
  return isNaN(num) ? null : new Prisma.Decimal(num);
}

function mapColumns(row: CsvRow): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const cleanKey = key.trim();
    const mappedKey = COLUMN_MAP[cleanKey] || cleanKey;
    mapped[mappedKey] = value?.trim() || '';
  }
  return mapped;
}

/** Normalize a value to string for comparison */
function normalizeForCompare(value: any): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object' && value.toFixed) {
    return parseFloat(value.toString()).toFixed(2);
  }
  if (typeof value === 'number') return value.toString();
  return String(value).trim();
}

const DECIMAL_FIELDS = new Set(['price', 'discount', 'totalPrice', 'weight']);

/** Normalize a CSV value for comparison */
function normalizeCsvValue(value: string, isDecimal: boolean): string {
  if (!value || value.trim() === '') return '';
  if (isDecimal) {
    const num = parseFloat(value.trim());
    return isNaN(num) ? '' : num.toFixed(2);
  }
  return value.trim();
}

/** Compare existing DB line with CSV line, return list of changed fields */
function compareLineFields(existingLine: any, csvLine: Record<string, string>): FieldChange[] {
  const changes: FieldChange[] = [];
  const fieldsToCompare = ['product', 'description', 'quantity', 'price', 'discount', 'totalPrice', 'weight', 'currentStock'];

  for (const field of fieldsToCompare) {
    const isDecimal = DECIMAL_FIELDS.has(field);
    const oldVal = normalizeForCompare(existingLine[field]);
    const newVal = normalizeCsvValue(csvLine[field] || '', isDecimal);

    if (oldVal === '' && newVal === '') continue;

    if (field === 'quantity' || field === 'currentStock') {
      const oldNum = parseInt(oldVal) || 0;
      const newNum = parseInt(newVal) || 0;
      if (oldNum === newNum) continue;
    } else if (oldVal === newVal) {
      continue;
    }

    changes.push({
      field,
      fieldLabel: FIELD_LABELS[field] || field,
      oldValue: oldVal || '(ריק)',
      newValue: newVal || '(ריק)',
    });
  }

  return changes;
}

// ────────── Service ──────────

export class CsvImportService {

  /** Parse CSV content into mapped rows grouped by orderNumber */
  private parseCsv(csvContent: string) {
    let parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    }) as Papa.ParseResult<CsvRow>;

    // If quoting errors, clean inner quotes and retry
    const hasQuoteErrors = parsed.errors.some((e) => e.type === 'Quotes');
    if (hasQuoteErrors) {
      const cleanedCsv = csvContent.replace(/(?<=,)"((?:[^"\n]*"[^",\n]+)+)"(?=,|\r?\n|$)/g, (_match, inner) => {
        return '"' + inner.replace(/"/g, "'") + '"';
      });
      parsed = Papa.parse(cleanedCsv, {
        header: true,
        skipEmptyLines: true,
      }) as Papa.ParseResult<CsvRow>;
    }

    const fatalErrors = parsed.errors.filter((e) => e.type !== 'Quotes' && e.type !== 'FieldMismatch');
    if (fatalErrors.length > 0) {
      throw new AppError(400, 'CSV_PARSE_ERROR', 'שגיאה בפענוח קובץ CSV', fatalErrors);
    }

    if (parsed.data.length === 0) {
      throw new AppError(400, 'CSV_EMPTY', 'קובץ CSV ריק');
    }

    const rows = parsed.data.map(mapColumns);

    const orderGroups = new Map<string, Record<string, string>[]>();
    for (const row of rows) {
      const orderNumber = row.orderNumber;
      if (!orderNumber) continue;
      if (!orderGroups.has(orderNumber)) {
        orderGroups.set(orderNumber, []);
      }
      orderGroups.get(orderNumber)!.push(row);
    }

    return { rows, orderGroups };
  }

  /** Sub-group lines by department */
  private groupByDepartment(lines: Record<string, string>[]) {
    const deptGroups = new Map<string | null, Record<string, string>[]>();
    for (const line of lines) {
      const dept = line.department ? (DEPARTMENT_MAP[line.department] || null) : null;
      if (!deptGroups.has(dept)) {
        deptGroups.set(dept, []);
      }
      deptGroups.get(dept)!.push(line);
    }
    return deptGroups;
  }

  // ────────── ANALYZE ──────────

  async analyzeCsv(csvContent: string): Promise<ImportAnalysisResult> {
    const { orderGroups } = this.parseCsv(csvContent);

    const newOrders: ImportAnalysisResult['newOrders'] = [];
    const conflicts: ConflictOrder[] = [];

    for (const [orderNumber, lines] of orderGroups) {
      const firstLine = lines[0];
      const deptGroups = this.groupByDepartment(lines);

      for (const [department, deptLines] of deptGroups) {
        const existing = await prisma.order.findFirst({
          where: { orderNumber, department: department as any },
          include: { orderLines: { orderBy: { lineNumber: 'asc' } } },
        });

        if (!existing) {
          newOrders.push({
            orderNumber,
            department,
            customerName: firstLine.customerName || 'לא צוין',
            lineCount: deptLines.length,
          });
          continue;
        }

        // Compare order-level fields
        const orderChanges = compareOrderFields(existing, deptLines[0]);

        // Build map of existing lines by lineNumber
        const existingLinesMap = new Map<number, any>();
        for (const el of existing.orderLines) {
          existingLinesMap.set(el.lineNumber, el);
        }

        const modifiedLines: ModifiedLine[] = [];
        const newLines: NewLine[] = [];
        const identicalLines: number[] = [];

        for (let idx = 0; idx < deptLines.length; idx++) {
          const csvLine = deptLines[idx];
          const lineNum = parseIntOrNull(csvLine.lineNumber) || (idx + 1);
          const existingLine = existingLinesMap.get(lineNum);

          if (!existingLine) {
            newLines.push({
              lineNumber: lineNum,
              product: csvLine.product || 'לא צוין',
              description: csvLine.description || null,
              quantity: parseInt(csvLine.quantity) || 1,
            });
            continue;
          }

          const changes = compareLineFields(existingLine, csvLine);
          if (changes.length === 0) {
            identicalLines.push(lineNum);
          } else {
            modifiedLines.push({
              lineNumber: lineNum,
              existingLineId: existingLine.id,
              changes,
            });
          }
        }

        // Only add as conflict if there's something to decide on
        if (orderChanges.length > 0 || modifiedLines.length > 0 || newLines.length > 0) {
          conflicts.push({
            orderNumber,
            department,
            existingOrderId: existing.id,
            customerName: existing.customerName,
            status: existing.status,
            orderChanges,
            modifiedLines,
            newLines,
            identicalLines,
          });
        }
      }
    }

    return {
      newOrders,
      conflicts,
      summary: {
        totalNewOrders: newOrders.length,
        totalConflictOrders: conflicts.length,
        totalModifiedLines: conflicts.reduce((sum, c) => sum + c.modifiedLines.length, 0),
        totalNewLines: conflicts.reduce((sum, c) => sum + c.newLines.length, 0),
        totalIdenticalLines: conflicts.reduce((sum, c) => sum + c.identicalLines.length, 0),
      },
    };
  }

  // ────────── IMPORT ──────────

  async importCsv(csvContent: string, decisions?: ImportDecisions): Promise<ImportResult> {
    const { orderGroups } = this.parseCsv(csvContent);

    const results: ImportResult = {
      imported: 0,
      skipped: 0,
      updated: 0,
      errors: [],
    };

    const defaultDeliveryDate = new Date();
    defaultDeliveryDate.setDate(defaultDeliveryDate.getDate() + 2);

    for (const [orderNumber, lines] of orderGroups) {
      try {
        const firstLine = lines[0];
        const deliveryDate = parseDate(firstLine.deliveryDate) || defaultDeliveryDate;
        const orderDate = parseDate(firstLine.orderDate) || new Date();

        const deptGroups = this.groupByDepartment(lines);

        for (const [department, deptLines] of deptGroups) {
          const existing = await prisma.order.findFirst({
            where: { orderNumber, department: department as any },
            include: { orderLines: true },
          });

          if (existing) {
            // ── Handle existing order ──
            if (existing.status !== 'PENDING') {
              results.skipped++;
              continue;
            }

            if (!decisions) {
              results.skipped++;
              continue;
            }

            const decision = decisions.conflicts.find(
              (c) => c.orderNumber === orderNumber && c.department === department
            );

            if (!decision) {
              results.skipped++;
              continue;
            }

            let didUpdate = false;

            await prisma.$transaction(async (tx) => {
              // Update order-level fields
              if (decision.updateOrderFields) {
                const csvLine = deptLines[0];
                const updateData: any = {};

                const stringFields = ['customerName', 'address', 'city', 'phone', 'phone2', 'contactPerson'];
                for (const field of stringFields) {
                  if (csvLine[field] !== undefined && csvLine[field] !== '') {
                    updateData[field] = csvLine[field].trim();
                  }
                }
                if (csvLine.floor !== undefined && csvLine.floor !== '') {
                  updateData.floor = parseIntOrNull(csvLine.floor);
                }
                if (csvLine.elevator !== undefined && csvLine.elevator !== '') {
                  const val = parseBoolean(csvLine.elevator);
                  if (val !== null) updateData.elevator = val;
                }
                if (csvLine.deliveryDate !== undefined && csvLine.deliveryDate !== '') {
                  const val = parseDate(csvLine.deliveryDate);
                  if (val) updateData.deliveryDate = val;
                }
                if (csvLine.orderDate !== undefined && csvLine.orderDate !== '') {
                  const val = parseDate(csvLine.orderDate);
                  if (val) updateData.orderDate = val;
                }

                if (Object.keys(updateData).length > 0) {
                  await tx.order.update({
                    where: { id: existing.id },
                    data: updateData,
                  });
                  didUpdate = true;
                }
              }

              // Overwrite modified lines
              if (decision.overwriteLineNumbers.length > 0) {
                for (const lineNum of decision.overwriteLineNumbers) {
                  const existingLine = existing.orderLines.find((l) => l.lineNumber === lineNum);
                  const csvLine = deptLines.find((l, idx) =>
                    (parseIntOrNull(l.lineNumber) || (idx + 1)) === lineNum
                  );

                  if (existingLine && csvLine) {
                    await tx.orderLine.update({
                      where: { id: existingLine.id },
                      data: {
                        product: csvLine.product || existingLine.product,
                        description: csvLine.description || null,
                        quantity: parseInt(csvLine.quantity) || existingLine.quantity,
                        price: new Prisma.Decimal(parseFloat(csvLine.price) || 0),
                        discount: parseDecimalOrNull(csvLine.discount),
                        totalPrice: parseDecimalOrNull(csvLine.totalPrice),
                        weight: new Prisma.Decimal(parseFloat(csvLine.weight) || 0),
                        currentStock: parseInt(csvLine.currentStock) || 0,
                      },
                    });
                    didUpdate = true;
                  }
                }
              }

              // Add new lines
              if (decision.addNewLines) {
                const existingLineNums = new Set(existing.orderLines.map((l) => l.lineNumber));
                for (let idx = 0; idx < deptLines.length; idx++) {
                  const csvLine = deptLines[idx];
                  const lineNum = parseIntOrNull(csvLine.lineNumber) || (idx + 1);

                  if (!existingLineNums.has(lineNum)) {
                    await tx.orderLine.create({
                      data: {
                        orderId: existing.id,
                        lineNumber: lineNum,
                        product: csvLine.product || 'לא צוין',
                        description: csvLine.description || null,
                        quantity: parseInt(csvLine.quantity) || 1,
                        price: new Prisma.Decimal(parseFloat(csvLine.price) || 0),
                        discount: parseDecimalOrNull(csvLine.discount),
                        totalPrice: parseDecimalOrNull(csvLine.totalPrice),
                        weight: new Prisma.Decimal(parseFloat(csvLine.weight) || 0),
                        currentStock: parseInt(csvLine.currentStock) || 0,
                        unitMeasure: parseIntOrNull(csvLine.unitMeasure),
                        department: department as any,
                      },
                    });
                    didUpdate = true;
                  }
                }
              }
            });

            if (didUpdate) {
              results.updated++;
            } else {
              results.skipped++;
            }
            continue;
          }

          // ── Create new order ──
          await prisma.order.create({
            data: {
              orderNumber,
              orderDate,
              deliveryDate,
              customerName: firstLine.customerName || 'לא צוין',
              address: firstLine.address || '',
              city: firstLine.city || '',
              phone: firstLine.phone || '',
              phone2: firstLine.phone2 || null,
              contactPerson: firstLine.contactPerson || null,
              floor: parseIntOrNull(firstLine.floor),
              elevator: parseBoolean(firstLine.elevator),
              department: department as any,
              status: 'PENDING',
              orderLines: {
                create: deptLines.map((line, idx) => ({
                  lineNumber: parseIntOrNull(line.lineNumber) || (idx + 1),
                  product: line.product || 'לא צוין',
                  description: line.description || null,
                  quantity: parseInt(line.quantity) || 1,
                  price: new Prisma.Decimal(parseFloat(line.price) || 0),
                  discount: parseDecimalOrNull(line.discount),
                  totalPrice: parseDecimalOrNull(line.totalPrice),
                  weight: new Prisma.Decimal(parseFloat(line.weight) || 0),
                  currentStock: parseInt(line.currentStock) || 0,
                  unitMeasure: parseDecimalOrNull(line.unitMeasure),
                  department: department as any,
                })),
              },
            },
          });

          results.imported++;
        }
      } catch (err) {
        results.errors.push({
          orderNumber,
          error: err instanceof Error ? err.message : 'שגיאה לא ידועה',
        });
      }
    }

    // Auto-assign zones to newly imported orders
    if (results.imported > 0) {
      const zones = await prisma.zone.findMany({ include: { cities: true } });
      const cityZoneMap = new Map<string, number>();
      for (const zone of zones) {
        for (const zoneCity of zone.cities) {
          cityZoneMap.set(zoneCity.city, zone.id);
        }
      }

      const newOrders = await prisma.order.findMany({
        where: { zoneId: null, status: 'PENDING' },
        select: { id: true, city: true },
      });

      for (const order of newOrders) {
        const zoneId = cityZoneMap.get(order.city);
        if (zoneId) {
          await prisma.order.update({
            where: { id: order.id },
            data: { zoneId },
          });
        }
      }
    }

    // Geocode new orders in background
    if (results.imported > 0) {
      const newOrderIds = await prisma.order.findMany({
        where: { latitude: null, status: 'PENDING' },
        select: { id: true },
      });
      if (newOrderIds.length > 0) {
        geocodingService.batchGeocodeOrders(newOrderIds.map((o) => o.id)).catch((err) => {
          console.error('Background geocoding error:', err);
        });
      }
    }

    return results;
  }
}

export const csvImportService = new CsvImportService();
