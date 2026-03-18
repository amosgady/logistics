import { useState, useRef, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Checkbox,
  FormControlLabel,
  Divider,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useImportCsv, useAnalyzeCsvImport } from '../../hooks/useOrders';

interface Props {
  open: boolean;
  onClose: () => void;
}

// Same column map as backend to show friendly field names
const COLUMN_MAP: Record<string, string> = {
  'מספר הזמנה': 'orderNumber',
  "מס' הזמנה": 'orderNumber',
  'order_number': 'orderNumber',
  'תאריך אספקה': 'deliveryDate',
  'delivery_date': 'deliveryDate',
  'שם לקוח': 'customerName',
  'שם הלקוח': 'customerName',
  'customer_name': 'customerName',
  'כתובת': 'address',
  'address': 'address',
  'עיר': 'city',
  'city': 'city',
  'טלפון': 'phone',
  'טלפון 1': 'phone',
  'phone': 'phone',
  'פריט': 'product',
  'product': 'product',
  'תיאור': 'description',
  'תאור': 'description',
  'description': 'description',
  'כמות': 'quantity',
  'quantity': 'quantity',
  'משקל': 'weight',
  'weight': 'weight',
  'מחלקה': 'department',
  'department': 'department',
};

function mapRow(row: Record<string, string>) {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const cleanKey = key.trim();
    const mappedKey = COLUMN_MAP[cleanKey] || cleanKey;
    mapped[mappedKey] = value?.trim() || '';
  }
  return mapped;
}

interface PreviewOrder {
  orderNumber: string;
  customerName: string;
  city: string;
  deliveryDate: string;
  lineCount: number;
  products: string[];
}

// ── Types from backend analysis ──
interface FieldChange {
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
}
interface ModifiedLine {
  lineNumber: number;
  existingLineId: number;
  changes: FieldChange[];
}
interface NewLine {
  lineNumber: number;
  product: string;
  description: string | null;
  quantity: number;
}
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'ממתינה',
  PLANNING: 'בתכנון',
  IN_COORDINATION: 'בתיאום',
  APPROVED: 'מתואמת',
  SENT_TO_DRIVER: 'נשלחה לנהג',
  COMPLETED: 'הושלמה',
  CANCELLED: 'בוטלה',
};

interface ConflictOrder {
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
interface AnalysisResult {
  newOrders: { orderNumber: string; department: string | null; customerName: string; lineCount: number }[];
  conflicts: ConflictOrder[];
  summary: {
    totalNewOrders: number;
    totalConflictOrders: number;
    totalModifiedLines: number;
    totalNewLines: number;
    totalIdenticalLines: number;
  };
}

interface DecisionState {
  updateOrderFields: boolean;
  overwriteLineNumbers: Set<number>;
  addNewLines: boolean;
}

type DialogStep = 'FILE_SELECT' | 'PREVIEW' | 'ANALYZING' | 'CONFLICTS' | 'IMPORTING' | 'RESULT';

function conflictKey(c: ConflictOrder): string {
  return `${c.orderNumber}|${c.department ?? 'null'}`;
}

export default function CsvImportDialog({ open, onClose }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [step, setStep] = useState<DialogStep>('FILE_SELECT');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [decisions, setDecisions] = useState<Map<string, DecisionState>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useImportCsv();
  const analyzeMutation = useAnalyzeCsvImport();

  const previewOrders = useMemo<PreviewOrder[]>(() => {
    if (!parsedRows) return [];
    const groups = new Map<string, Record<string, string>[]>();
    for (const row of parsedRows) {
      const num = row.orderNumber;
      if (!num) continue;
      if (!groups.has(num)) groups.set(num, []);
      groups.get(num)!.push(row);
    }
    const orders: PreviewOrder[] = [];
    for (const [orderNumber, lines] of groups) {
      const first = lines[0];
      orders.push({
        orderNumber,
        customerName: first.customerName || '-',
        city: first.city || '-',
        deliveryDate: first.deliveryDate || '-',
        lineCount: lines.length,
        products: lines.map((l) => l.product || '-').filter(Boolean),
      });
    }
    return orders;
  }, [parsedRows]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setFile(selectedFile);
    setParseError(null);
    setParsedRows(null);
    setStep('FILE_SELECT');

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // First try strict parsing; if quoting errors occur, retry with relaxed quoting
      let result = Papa.parse(text, { header: true, skipEmptyLines: true });
      const hasQuoteErrors = result.errors.some((e) => e.type === 'Quotes');
      if (hasQuoteErrors) {
        // Strip problematic inner quotes and re-parse
        const cleanedText = text.replace(/(?<=,)"((?:[^"\n]*"[^",\n]+)+)"(?=,|\r?\n|$)/g, (_match, inner) => {
          return '"' + inner.replace(/"/g, "'") + '"';
        });
        result = Papa.parse(cleanedText, { header: true, skipEmptyLines: true });
      }
      const fatalErrors = result.errors.filter((e) => e.type !== 'Quotes' && e.type !== 'FieldMismatch');
      if (fatalErrors.length > 0) {
        setParseError('שגיאה בפענוח הקובץ: ' + fatalErrors[0].message);
        return;
      }
      if (result.data.length === 0) {
        setParseError('קובץ CSV ריק');
        return;
      }
      const mapped = (result.data as Record<string, string>[]).map(mapRow);
      setParsedRows(mapped);
      setStep('PREVIEW');
    };
    reader.readAsText(selectedFile);
  };

  const handleAnalyzeAndImport = async () => {
    if (!file) return;
    setStep('ANALYZING');

    try {
      const result = await analyzeMutation.mutateAsync(file);
      const data: AnalysisResult = result.data;

      if (data.conflicts.length === 0) {
        // No conflicts — import directly
        setStep('IMPORTING');
        await importMutation.mutateAsync({ file });
        setStep('RESULT');
      } else {
        // Has conflicts — show resolution UI
        setAnalysis(data);
        const newDecisions = new Map<string, DecisionState>();
        for (const conflict of data.conflicts) {
          newDecisions.set(conflictKey(conflict), {
            updateOrderFields: conflict.orderChanges.length > 0,
            overwriteLineNumbers: new Set(conflict.modifiedLines.map((l) => l.lineNumber)),
            addNewLines: conflict.newLines.length > 0,
          });
        }
        setDecisions(newDecisions);
        setStep('CONFLICTS');
      }
    } catch {
      setStep('PREVIEW');
    }
  };

  const handleImportWithDecisions = async () => {
    if (!file) return;
    setStep('IMPORTING');

    const importDecisions = {
      conflicts: Array.from(decisions.entries()).map(([key, state]) => {
        const [orderNumber, dept] = key.split('|');
        return {
          orderNumber,
          department: dept === 'null' ? null : dept,
          updateOrderFields: state.updateOrderFields,
          overwriteLineNumbers: Array.from(state.overwriteLineNumbers),
          addNewLines: state.addNewLines,
        };
      }),
    };

    try {
      await importMutation.mutateAsync({ file, decisions: importDecisions });
      setStep('RESULT');
    } catch {
      setStep('CONFLICTS');
    }
  };

  const toggleLineOverwrite = useCallback((cKey: string, lineNumber: number) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const state = next.get(cKey);
      if (!state) return prev;
      const newSet = new Set(state.overwriteLineNumbers);
      if (newSet.has(lineNumber)) {
        newSet.delete(lineNumber);
      } else {
        newSet.add(lineNumber);
      }
      next.set(cKey, { ...state, overwriteLineNumbers: newSet });
      return next;
    });
  }, []);

  const toggleUpdateOrderFields = useCallback((cKey: string) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const state = next.get(cKey);
      if (!state) return prev;
      next.set(cKey, { ...state, updateOrderFields: !state.updateOrderFields });
      return next;
    });
  }, []);

  const toggleAddNewLines = useCallback((cKey: string) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      const state = next.get(cKey);
      if (!state) return prev;
      next.set(cKey, { ...state, addNewLines: !state.addNewLines });
      return next;
    });
  }, []);

  const selectAll = () => {
    if (!analysis) return;
    const newDecisions = new Map<string, DecisionState>();
    for (const conflict of analysis.conflicts) {
      newDecisions.set(conflictKey(conflict), {
        updateOrderFields: conflict.orderChanges.length > 0,
        overwriteLineNumbers: new Set(conflict.modifiedLines.map((l) => l.lineNumber)),
        addNewLines: conflict.newLines.length > 0,
      });
    }
    setDecisions(newDecisions);
  };

  const clearAll = () => {
    if (!analysis) return;
    const newDecisions = new Map<string, DecisionState>();
    for (const conflict of analysis.conflicts) {
      newDecisions.set(conflictKey(conflict), {
        updateOrderFields: false,
        overwriteLineNumbers: new Set(),
        addNewLines: false,
      });
    }
    setDecisions(newDecisions);
  };

  const handleClose = () => {
    setFile(null);
    setParsedRows(null);
    setParseError(null);
    setAnalysis(null);
    setDecisions(new Map());
    setStep('FILE_SELECT');
    importMutation.reset();
    analyzeMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const result = importMutation.data?.data;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth={step === 'CONFLICTS' ? 'lg' : 'md'} fullWidth>
      <DialogTitle>יבוא הזמנות מ-CSV</DialogTitle>
      <DialogContent>

        {/* ── File upload area ── */}
        {(step === 'FILE_SELECT' || step === 'PREVIEW') && (
          <>
            <Box
              sx={{
                border: '2px dashed',
                borderColor: 'primary.main',
                borderRadius: 2,
                p: 3,
                textAlign: 'center',
                cursor: 'pointer',
                '&:hover': { bgcolor: 'action.hover' },
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon sx={{ fontSize: 40, color: 'primary.main', mb: 0.5 }} />
              <Typography>
                {file ? file.name : 'לחץ לבחירת קובץ CSV'}
              </Typography>
              {file && (
                <Typography variant="body2" color="text.secondary">
                  {(file.size / 1024).toFixed(1)} KB
                </Typography>
              )}
            </Box>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              hidden
              onChange={handleFileSelect}
            />
          </>
        )}

        {parseError && (
          <Alert severity="error" sx={{ mt: 2 }}>{parseError}</Alert>
        )}

        {/* ── Preview table ── */}
        {step === 'PREVIEW' && parsedRows && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Typography variant="subtitle1" fontWeight="bold">תצוגה מקדימה</Typography>
              <Chip label={`${previewOrders.length} הזמנות`} size="small" color="primary" />
              <Chip label={`${parsedRows.length} שורות`} size="small" variant="outlined" />
            </Box>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 350 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>מספר הזמנה</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>לקוח</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>עיר</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>תאריך אספקה</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>שורות</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>פריטים</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewOrders.map((order, idx) => (
                    <TableRow key={order.orderNumber} hover>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>{order.orderNumber}</TableCell>
                      <TableCell>{order.customerName}</TableCell>
                      <TableCell>{order.city}</TableCell>
                      <TableCell>{order.deliveryDate}</TableCell>
                      <TableCell>{order.lineCount}</TableCell>
                      <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {order.products.join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {/* ── Analyzing ── */}
        {step === 'ANALYZING' && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="body2" sx={{ mt: 1 }}>מנתח הזמנות...</Typography>
          </Box>
        )}

        {/* ── Conflicts resolution ── */}
        {step === 'CONFLICTS' && analysis && (
          <Box sx={{ mt: 1 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <Typography variant="subtitle2">
                נמצאו {analysis.summary.totalConflictOrders} הזמנות קיימות עם שינויים
              </Typography>
            </Alert>

            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              {analysis.summary.totalNewOrders > 0 && (
                <Chip label={`${analysis.summary.totalNewOrders} הזמנות חדשות`} color="success" size="small" />
              )}
              <Chip label={`${analysis.summary.totalModifiedLines} שורות שונות`} color="warning" size="small" />
              {analysis.summary.totalNewLines > 0 && (
                <Chip label={`${analysis.summary.totalNewLines} שורות חדשות`} color="info" size="small" />
              )}
              {analysis.summary.totalIdenticalLines > 0 && (
                <Chip label={`${analysis.summary.totalIdenticalLines} שורות זהות`} variant="outlined" size="small" />
              )}
            </Box>

            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button size="small" onClick={selectAll} variant="outlined">סמן הכל</Button>
              <Button size="small" onClick={clearAll} variant="outlined">נקה הכל</Button>
            </Box>

            {analysis.conflicts.map((conflict) => {
              const cKey = conflictKey(conflict);
              const state = decisions.get(cKey);
              const isPending = conflict.status === 'PENDING';

              return (
                <Accordion key={cKey} defaultExpanded={analysis.conflicts.length <= 3}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography fontWeight="bold" sx={{ flex: 1 }}>
                      הזמנה {conflict.orderNumber} — {conflict.customerName}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mr: 1 }}>
                      {!isPending && (
                        <Chip label={STATUS_LABELS[conflict.status] || conflict.status} color="error" size="small" />
                      )}
                      {conflict.orderChanges.length > 0 && (
                        <Chip label={`${conflict.orderChanges.length} שדות הזמנה`} color="secondary" size="small" />
                      )}
                      {conflict.modifiedLines.length > 0 && (
                        <Chip label={`${conflict.modifiedLines.length} שורות שונות`} color="warning" size="small" />
                      )}
                      {conflict.newLines.length > 0 && (
                        <Chip label={`${conflict.newLines.length} חדשות`} color="info" size="small" />
                      )}
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {!isPending && (
                      <Alert severity="error" sx={{ mb: 2 }}>
                        לא ניתן לעדכן הזמנה זו — הסטטוס הנוכחי: {STATUS_LABELS[conflict.status] || conflict.status}. ניתן לעדכן רק הזמנות בסטטוס "ממתינה".
                      </Alert>
                    )}
                    {/* Order-level changes */}
                    {conflict.orderChanges.length > 0 && (
                      <Box sx={{ mb: 2 }}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={isPending && (state?.updateOrderFields ?? false)}
                              onChange={() => toggleUpdateOrderFields(cKey)}
                              disabled={!isPending}
                            />
                          }
                          label={<Typography variant="subtitle2">עדכן פרטי הזמנה</Typography>}
                        />
                        <TableContainer component={Paper} variant="outlined" sx={{ ml: 4 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 'bold', width: 100 }}>שדה</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>ערך קיים</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>ערך חדש</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {conflict.orderChanges.map((change) => (
                                <TableRow key={change.field}>
                                  <TableCell>{change.fieldLabel}</TableCell>
                                  <TableCell sx={{ color: 'error.main', textDecoration: 'line-through' }}>
                                    {change.oldValue}
                                  </TableCell>
                                  <TableCell sx={{ color: 'success.main', fontWeight: 'bold' }}>
                                    {change.newValue}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                        <Divider sx={{ my: 2 }} />
                      </Box>
                    )}

                    {/* Identical lines info */}
                    {conflict.identicalLines.length > 0 && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {conflict.identicalLines.length} שורות זהות (ידולגו אוטומטית)
                      </Typography>
                    )}

                    {/* Modified lines */}
                    {conflict.modifiedLines.map((line) => (
                      <Box key={line.lineNumber} sx={{ mb: 2 }}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={isPending && (state?.overwriteLineNumbers.has(line.lineNumber) ?? false)}
                              onChange={() => toggleLineOverwrite(cKey, line.lineNumber)}
                              disabled={!isPending}
                            />
                          }
                          label={<Typography variant="subtitle2">עדכן שורה {line.lineNumber}</Typography>}
                        />
                        <TableContainer component={Paper} variant="outlined" sx={{ ml: 4 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 'bold', width: 100 }}>שדה</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>ערך קיים</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>ערך חדש</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {line.changes.map((change) => (
                                <TableRow key={change.field}>
                                  <TableCell>{change.fieldLabel}</TableCell>
                                  <TableCell sx={{ color: 'error.main', textDecoration: 'line-through' }}>
                                    {change.oldValue}
                                  </TableCell>
                                  <TableCell sx={{ color: 'success.main', fontWeight: 'bold' }}>
                                    {change.newValue}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    ))}

                    {/* New lines */}
                    {conflict.newLines.length > 0 && (
                      <>
                        <Divider sx={{ my: 1 }} />
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={isPending && (state?.addNewLines ?? false)}
                              onChange={() => toggleAddNewLines(cKey)}
                              disabled={!isPending}
                            />
                          }
                          label={
                            <Typography variant="subtitle2">
                              הוסף {conflict.newLines.length} שורות חדשות
                            </Typography>
                          }
                        />
                        <Box sx={{ ml: 4 }}>
                          {conflict.newLines.map((nl) => (
                            <Typography key={nl.lineNumber} variant="body2" color="text.secondary">
                              שורה {nl.lineNumber}: {nl.product} (כמות: {nl.quantity})
                            </Typography>
                          ))}
                        </Box>
                      </>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        )}

        {/* ── Importing ── */}
        {step === 'IMPORTING' && (
          <Box sx={{ mt: 2 }}>
            <LinearProgress />
            <Typography variant="body2" sx={{ mt: 1 }}>מייבא הזמנות...</Typography>
          </Box>
        )}

        {/* ── Errors ── */}
        {(analyzeMutation.isError || importMutation.isError) && step !== 'RESULT' && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(analyzeMutation.error as any)?.response?.data?.error?.message
              || (importMutation.error as any)?.response?.data?.error?.message
              || 'שגיאה ביבוא'}
          </Alert>
        )}

        {/* ── Result ── */}
        {step === 'RESULT' && result && (
          <Box sx={{ mt: 2 }}>
            <Alert severity="success">היבוא הושלם!</Alert>
            <Typography sx={{ mt: 1 }}>
              יובאו: {result.imported} הזמנות חדשות
            </Typography>
            {result.updated > 0 && (
              <Typography color="info.main">
                עודכנו: {result.updated} הזמנות קיימות
              </Typography>
            )}
            {result.skipped > 0 && (
              <Typography color="text.secondary">
                דולגו (ללא שינויים): {result.skipped}
              </Typography>
            )}
            {result.errors?.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                {result.errors.length} שגיאות:
                {result.errors.slice(0, 5).map((e: any, i: number) => (
                  <Typography key={i} variant="body2">
                    הזמנה {e.orderNumber}: {e.error}
                  </Typography>
                ))}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>
          {step === 'RESULT' ? 'סגור' : 'ביטול'}
        </Button>

        {step === 'CONFLICTS' && (
          <Button onClick={() => setStep('PREVIEW')}>חזרה</Button>
        )}

        {step === 'PREVIEW' && (
          <Button
            variant="contained"
            onClick={handleAnalyzeAndImport}
            disabled={!file || !parsedRows}
          >
            {`יבוא ${previewOrders.length} הזמנות`}
          </Button>
        )}

        {step === 'CONFLICTS' && (
          <Button
            variant="contained"
            onClick={handleImportWithDecisions}
          >
            ביצוע יבוא
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
