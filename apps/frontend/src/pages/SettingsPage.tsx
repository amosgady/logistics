import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Button,
  Alert, Snackbar, Switch, FormControlLabel, Divider,
  CircularProgress, Chip,
} from '@mui/material';
import {
  Save as SaveIcon,
  Sms as SmsIcon,
  Send as SendIcon,
  NotificationsActive as ReminderIcon,
  VpnKey as TokenIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi, DepartmentSetting } from '../services/settingsApi';
import { smsApi, SmsSettings, SmsReminderConfig } from '../services/smsApi';
import { DEPARTMENT_LABELS } from '../constants/departments';
import api from '../services/api';

const DEFAULT_SMS_TEMPLATE =
  'שלום {customerName}, מסירת הזמנתך מתוכננת לתאריך {deliveryDate} בשעות {timeWindow}. לבירורים: {companyPhone}';

const DEFAULT_REPLY_TEMPLATE =
  'שלום {customerName}, האם אתה מאשר הובלה ליום {deliveryDate}? לאישור הקש 1, לסירוב הקש 2';

const TEMPLATE_HELPER =
  'משתנים זמינים: {customerName}, {deliveryDate}, {timeWindow}, {address}, {city}, {orderNumber}, {companyPhone}';

const DEFAULT_REMINDER_CONFIG: SmsReminderConfig = {
  preDeliveryEnabled: false,
  preDeliveryDays: 1,
  preDeliveryTime: '09:00',
  preDeliveryTemplate: 'שלום {customerName}, תזכורת: האספקה שלך מתוכננת ליום {deliveryDate}. לבירורים: {companyPhone}',
  sameDayEnabled: false,
  sameDayHoursBefore: 2,
  sameDayTemplate: 'שלום {customerName}, האספקה שלך צפויה להגיע היום בין השעות {timeWindow}. אנא וודאו שמישהו זמין בכתובת. לבירורים: {companyPhone}',
  nextCustomerEnabled: false,
  nextCustomerTemplate: 'שלום {customerName}, המשלוח שלך בדרך! צפי הגעה בקרוב. לבירורים: {companyPhone}',
};

export default function SettingsPage() {
  const queryClient = useQueryClient();

  // ─── Department settings ───
  const { data, isLoading } = useQuery({
    queryKey: ['department-settings'],
    queryFn: settingsApi.getDepartmentSettings,
  });
  const settings: DepartmentSetting[] = data?.data || [];

  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (settings.length > 0) {
      const map: Record<string, number> = {};
      settings.forEach((s) => { map[s.department] = s.waitTimeMinutes; });
      setEditValues(map);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: (updated: DepartmentSetting[]) => settingsApi.updateDepartmentSettings(updated),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['department-settings'] });
      setSnackbar({ message: 'הגדרות נשמרו', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בשמירת הגדרות', severity: 'error' }),
  });

  const handleSave = () => {
    const updated = Object.entries(editValues).map(([department, waitTimeMinutes]) => ({
      department,
      waitTimeMinutes,
    }));
    saveMutation.mutate(updated);
  };

  const hasChanges = settings.some(
    (s) => editValues[s.department] !== undefined && editValues[s.department] !== s.waitTimeMinutes,
  );

  // ─── SMS settings ───
  const { data: smsData, isLoading: smsLoading } = useQuery({
    queryKey: ['sms-settings'],
    queryFn: smsApi.getSettings,
  });

  const [smsForm, setSmsForm] = useState<SmsSettings>({
    inforuUsername: '',
    inforuPassword: '',
    apiToken: '',
    senderName: 'Delivery',
    replySenderPhone: '',
    messageTemplate: DEFAULT_SMS_TEMPLATE,
    isActive: true,
    confirmationMethod: 'LINK',
    replyTemplate: DEFAULT_REPLY_TEMPLATE,
  });
  const [smsFormDirty, setSmsFormDirty] = useState(false);
  const [testPhone, setTestPhone] = useState('');

  useEffect(() => {
    if (smsData?.data) {
      setSmsForm({
        inforuUsername: smsData.data.inforuUsername || '',
        inforuPassword: smsData.data.inforuPassword || '',
        apiToken: smsData.data.apiToken || '',
        senderName: smsData.data.senderName || 'Delivery',
        replySenderPhone: smsData.data.replySenderPhone || '',
        messageTemplate: smsData.data.messageTemplate || DEFAULT_SMS_TEMPLATE,
        isActive: smsData.data.isActive !== false,
        confirmationMethod: smsData.data.confirmationMethod || 'LINK',
        replyTemplate: smsData.data.replyTemplate || DEFAULT_REPLY_TEMPLATE,
      });
    }
  }, [smsData]);

  const updateSmsField = (field: keyof SmsSettings, value: any) => {
    setSmsForm((prev) => ({ ...prev, [field]: value }));
    setSmsFormDirty(true);
  };

  const smsSaveMutation = useMutation({
    mutationFn: () => smsApi.updateSettings(smsForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-settings'] });
      setSmsFormDirty(false);
      setSnackbar({ message: 'הגדרות SMS נשמרו', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בשמירת הגדרות SMS', severity: 'error' }),
  });

  const smsTestMutation = useMutation({
    mutationFn: () => smsApi.sendTest(testPhone),
    onSuccess: (result) => {
      if (result.data?.success) {
        setSnackbar({ message: 'הודעת בדיקה נשלחה בהצלחה', severity: 'success' });
      } else {
        setSnackbar({ message: `שליחה נכשלה: ${result.data?.error || 'שגיאה'}`, severity: 'error' });
      }
    },
    onError: () => setSnackbar({ message: 'שגיאה בשליחת SMS בדיקה', severity: 'error' }),
  });

  const generateTokenMutation = useMutation({
    mutationFn: () => smsApi.generateToken(),
    onSuccess: (result) => {
      if (result.data?.success) {
        setSmsForm((prev) => ({ ...prev, apiToken: result.data.token }));
        setSmsFormDirty(false);
        queryClient.invalidateQueries({ queryKey: ['sms-settings'] });
        setSnackbar({ message: 'טוקן נוצר ונשמר בהצלחה', severity: 'success' });
      } else {
        setSnackbar({ message: `שגיאה ביצירת טוקן: ${result.data?.error || 'שגיאה'}`, severity: 'error' });
      }
    },
    onError: () => setSnackbar({ message: 'שגיאה ביצירת טוקן API', severity: 'error' }),
  });

  // ─── SMS Reminder config ───
  const { data: reminderData, isLoading: reminderLoading } = useQuery({
    queryKey: ['sms-reminder-config'],
    queryFn: smsApi.getReminderConfig,
  });

  const [reminderForm, setReminderForm] = useState<SmsReminderConfig>(DEFAULT_REMINDER_CONFIG);
  const [reminderDirty, setReminderDirty] = useState(false);

  useEffect(() => {
    if (reminderData?.data) {
      setReminderForm({
        preDeliveryEnabled: reminderData.data.preDeliveryEnabled ?? false,
        preDeliveryDays: reminderData.data.preDeliveryDays ?? 1,
        preDeliveryTime: reminderData.data.preDeliveryTime ?? '09:00',
        preDeliveryTemplate: reminderData.data.preDeliveryTemplate ?? DEFAULT_REMINDER_CONFIG.preDeliveryTemplate,
        sameDayEnabled: reminderData.data.sameDayEnabled ?? false,
        sameDayHoursBefore: reminderData.data.sameDayHoursBefore ?? 2,
        sameDayTemplate: reminderData.data.sameDayTemplate ?? DEFAULT_REMINDER_CONFIG.sameDayTemplate,
        nextCustomerEnabled: reminderData.data.nextCustomerEnabled ?? false,
        nextCustomerTemplate: reminderData.data.nextCustomerTemplate ?? DEFAULT_REMINDER_CONFIG.nextCustomerTemplate,
      });
    }
  }, [reminderData]);

  const updateReminderField = (field: keyof SmsReminderConfig, value: any) => {
    setReminderForm((prev) => ({ ...prev, [field]: value }));
    setReminderDirty(true);
  };

  const reminderSaveMutation = useMutation({
    mutationFn: () => smsApi.updateReminderConfig(reminderForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms-reminder-config'] });
      setReminderDirty(false);
      setSnackbar({ message: 'הגדרות תזכורות נשמרו', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בשמירת הגדרות תזכורות', severity: 'error' }),
  });

  // ─── 2FA settings ───
  const { data: twoFactorData, isLoading: twoFactorLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: async () => {
      const res = await api.get('/auth/2fa-status');
      return res.data;
    },
  });

  const twoFactorToggleMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/auth/toggle-2fa');
      return res.data;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['2fa-status'] });
      const enabled = result.data?.twoFactorEnabled;
      setSnackbar({
        message: enabled ? 'אימות דו-שלבי הופעל' : 'אימות דו-שלבי כובה',
        severity: 'success',
      });
    },
    onError: () => setSnackbar({ message: 'שגיאה בשינוי הגדרת אימות דו-שלבי', severity: 'error' }),
  });

  if (isLoading) return <Typography>טוען...</Typography>;

  return (
    <Box>
      <Typography variant="h5" sx={{ mb: 3 }}>הגדרות</Typography>

      {/* Two-Factor Authentication */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <SecurityIcon color="primary" />
          <Typography variant="h6">אימות דו-שלבי (2FA)</Typography>
          {!twoFactorLoading && (
            twoFactorData?.data?.twoFactorEnabled ? (
              <Chip label="מופעל" size="small" color="success" />
            ) : (
              <Chip label="כבוי" size="small" color="default" />
            )
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          כשמופעל, בכל התחברות יישלח קוד אימות בן 6 ספרות לאימייל שלך. יש להזין את הקוד כדי לסיים את ההתחברות.
        </Typography>
        {twoFactorLoading ? (
          <CircularProgress size={24} />
        ) : (
          <FormControlLabel
            control={
              <Switch
                checked={twoFactorData?.data?.twoFactorEnabled ?? false}
                onChange={() => twoFactorToggleMutation.mutate()}
                disabled={twoFactorToggleMutation.isPending}
              />
            }
            label="הפעל אימות דו-שלבי באימייל"
          />
        )}
      </Paper>

      {/* Department wait times */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">זמן המתנה לפי מחלקה</Typography>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={!hasChanges || saveMutation.isPending}
          >
            שמור שינויים
          </Button>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          זמן ההמתנה (בדקות) בכל עצירה, משמש לחישוב זמן המסלול באופטימיזציה.
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>מחלקה</TableCell>
                <TableCell sx={{ width: 150 }}>זמן המתנה (דקות)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.keys(editValues).map((dept) => {
                return (
                  <TableRow key={dept} hover>
                    <TableCell>{DEPARTMENT_LABELS[dept] || dept}</TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        value={editValues[dept] ?? ''}
                        onChange={(e) => setEditValues((prev) => ({
                          ...prev,
                          [dept]: parseInt(e.target.value) || 0,
                        }))}
                        inputProps={{ min: 1, max: 240 }}
                        sx={{ width: 100 }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* SMS Settings */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SmsIcon color="primary" />
            <Typography variant="h6">הגדרות SMS</Typography>
            {smsForm.isActive ? (
              <Chip label="פעיל" size="small" color="success" />
            ) : (
              <Chip label="לא פעיל" size="small" color="default" />
            )}
          </Box>
          <Button
            variant="contained"
            startIcon={smsSaveMutation.isPending ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={() => smsSaveMutation.mutate()}
            disabled={!smsFormDirty || smsSaveMutation.isPending}
          >
            שמור הגדרות SMS
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          חיבור לספק SMS (019) לשליחת הודעות תזכורת ללקוחות. יש להזין שם משתמש וסיסמה וליצור טוקן API.
        </Typography>

        {smsLoading ? (
          <CircularProgress size={24} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={smsForm.isActive}
                  onChange={(e) => updateSmsField('isActive', e.target.checked)}
                />
              }
              label="הפעל שליחת SMS"
            />

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="שם משתמש 019"
                size="small"
                value={smsForm.inforuUsername}
                onChange={(e) => updateSmsField('inforuUsername', e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                label="סיסמה 019"
                size="small"
                type="password"
                value={smsForm.inforuPassword}
                onChange={(e) => updateSmsField('inforuPassword', e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                label="שם שולח (קישור)"
                size="small"
                value={smsForm.senderName}
                onChange={(e) => updateSmsField('senderName', e.target.value)}
                helperText="עד 11 תווים באנגלית, למשל perfectline"
                sx={{ flex: 1 }}
              />
              <TextField
                label="מספר שולח (SMS 1/2)"
                size="small"
                value={smsForm.replySenderPhone || ''}
                onChange={(e) => updateSmsField('replySenderPhone', e.target.value)}
                helperText="מספר טלפון לשליחת SMS עם תשובה"
                sx={{ flex: 1 }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                label="טוקן API"
                size="small"
                value={smsForm.apiToken || ''}
                onChange={(e) => updateSmsField('apiToken', e.target.value)}
                sx={{ flex: 1 }}
                helperText={smsForm.apiToken ? 'טוקן פעיל' : 'חסר טוקן – יש ליצור או להזין ידנית'}
                InputProps={{
                  sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
                }}
              />
              <Button
                variant="outlined"
                startIcon={generateTokenMutation.isPending ? <CircularProgress size={16} /> : <TokenIcon />}
                onClick={() => generateTokenMutation.mutate()}
                disabled={!smsForm.inforuUsername || !smsForm.inforuPassword || generateTokenMutation.isPending}
                sx={{ mt: 0.5, whiteSpace: 'nowrap' }}
              >
                צור טוקן
              </Button>
            </Box>
            {!smsForm.apiToken && (
              <Alert severity="warning" sx={{ mt: -1 }}>
                חסר טוקן API. לחץ על &quot;צור טוקן&quot; או הזן טוקן ידנית מממשק ניהול 019.
              </Alert>
            )}

            <Divider />

            <Typography variant="subtitle2">תבנית הודעה (שליחה ידנית)</Typography>
            <TextField
              multiline
              rows={3}
              fullWidth
              value={smsForm.messageTemplate}
              onChange={(e) => updateSmsField('messageTemplate', e.target.value)}
              helperText={TEMPLATE_HELPER}
            />

            <Divider />

            <Typography variant="subtitle2">שיטת אישור לקוח</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={smsForm.confirmationMethod === 'REPLY'}
                  onChange={(e) => updateSmsField('confirmationMethod', e.target.checked ? 'REPLY' : 'LINK')}
                />
              }
              label="אישור באמצעות תגובת SMS (הקש 1/2) במקום קישור"
            />
            {smsForm.confirmationMethod === 'REPLY' && (
              <TextField
                label="תבנית הודעת אישור (תגובת SMS)"
                multiline
                rows={2}
                fullWidth
                value={smsForm.replyTemplate || DEFAULT_REPLY_TEMPLATE}
                onChange={(e) => updateSmsField('replyTemplate', e.target.value)}
                helperText="משתנים: {customerName}, {deliveryDate}, {orderNumber}. הלקוח ישיב 1 לאישור, 2 לסירוב."
              />
            )}

            <Divider />

            {/* Test SMS */}
            <Typography variant="subtitle2">שליחת SMS בדיקה</Typography>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
              <TextField
                label="מספר טלפון לבדיקה"
                size="small"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="050-1234567"
                sx={{ width: 200 }}
              />
              <Button
                variant="outlined"
                startIcon={smsTestMutation.isPending ? <CircularProgress size={16} /> : <SendIcon />}
                onClick={() => smsTestMutation.mutate()}
                disabled={!testPhone || smsTestMutation.isPending}
              >
                שלח בדיקה
              </Button>
            </Box>
          </Box>
        )}
      </Paper>

      {/* SMS Reminders */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ReminderIcon color="primary" />
            <Typography variant="h6">תזכורות אוטומטיות</Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={reminderSaveMutation.isPending ? <CircularProgress size={16} /> : <SaveIcon />}
            onClick={() => reminderSaveMutation.mutate()}
            disabled={!reminderDirty || reminderSaveMutation.isPending}
          >
            שמור תזכורות
          </Button>
        </Box>

        {reminderLoading ? (
          <CircularProgress size={24} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Reminder 1: Pre-delivery */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={reminderForm.preDeliveryEnabled}
                    onChange={(e) => updateReminderField('preDeliveryEnabled', e.target.checked)}
                  />
                }
                label={
                  <Typography variant="subtitle1" fontWeight="bold">
                    תזכורת לפני יום האספקה
                  </Typography>
                }
              />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mr: 4 }}>
                שליחת SMS מספר ימים לפני תאריך האספקה, בשעה קבועה.
              </Typography>

              <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <TextField
                  label="מספר ימים לפני"
                  type="number"
                  size="small"
                  value={reminderForm.preDeliveryDays}
                  onChange={(e) => updateReminderField('preDeliveryDays', Math.max(1, parseInt(e.target.value) || 1))}
                  inputProps={{ min: 1, max: 14 }}
                  sx={{ width: 140 }}
                  disabled={!reminderForm.preDeliveryEnabled}
                />
                <TextField
                  label="שעת שליחה"
                  type="time"
                  size="small"
                  value={reminderForm.preDeliveryTime}
                  onChange={(e) => updateReminderField('preDeliveryTime', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: 140 }}
                  disabled={!reminderForm.preDeliveryEnabled}
                />
              </Box>

              <TextField
                label="נוסח הודעה"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={reminderForm.preDeliveryTemplate}
                onChange={(e) => updateReminderField('preDeliveryTemplate', e.target.value)}
                helperText={TEMPLATE_HELPER}
                disabled={!reminderForm.preDeliveryEnabled}
              />
            </Paper>

            {/* Reminder 2: Same-day */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={reminderForm.sameDayEnabled}
                    onChange={(e) => updateReminderField('sameDayEnabled', e.target.checked)}
                  />
                }
                label={
                  <Typography variant="subtitle1" fontWeight="bold">
                    תזכורת ביום האספקה
                  </Typography>
                }
              />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mr: 4 }}>
                שליחת SMS ביום האספקה, מספר שעות לפני תחילת חלון הזמן של הלקוח.
              </Typography>

              <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <TextField
                  label="שעות לפני חלון הזמן"
                  type="number"
                  size="small"
                  value={reminderForm.sameDayHoursBefore}
                  onChange={(e) => updateReminderField('sameDayHoursBefore', Math.max(1, parseInt(e.target.value) || 1))}
                  inputProps={{ min: 1, max: 8 }}
                  sx={{ width: 180 }}
                  disabled={!reminderForm.sameDayEnabled}
                />
                <Typography variant="body2" color="text.secondary">
                  (בוקר 08:00-12:00, צהריים 12:00-16:00)
                </Typography>
              </Box>

              <TextField
                label="נוסח הודעה"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={reminderForm.sameDayTemplate}
                onChange={(e) => updateReminderField('sameDayTemplate', e.target.value)}
                helperText={TEMPLATE_HELPER}
                disabled={!reminderForm.sameDayEnabled}
              />
            </Paper>

            {/* Reminder 3: Next customer */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={reminderForm.nextCustomerEnabled}
                    onChange={(e) => updateReminderField('nextCustomerEnabled', e.target.checked)}
                  />
                }
                label={
                  <Typography variant="subtitle1" fontWeight="bold">
                    הודעה ללקוח הבא במסלול
                  </Typography>
                }
              />
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2, mr: 4 }}>
                כאשר אספקה הושלמה, תישלח הודעת SMS אוטומטית ללקוח הבא בתור במסלול.
              </Typography>

              <TextField
                label="נוסח הודעה"
                multiline
                rows={2}
                fullWidth
                size="small"
                value={reminderForm.nextCustomerTemplate}
                onChange={(e) => updateReminderField('nextCustomerTemplate', e.target.value)}
                helperText={TEMPLATE_HELPER}
                disabled={!reminderForm.nextCustomerEnabled}
              />
            </Paper>

          </Box>
        )}
      </Paper>

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
