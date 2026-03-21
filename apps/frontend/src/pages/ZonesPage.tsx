import { useState, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Paper,
  TextField, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, Snackbar, Divider, IconButton, Tooltip,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Upload as UploadIcon,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zoneApi } from '../services/zoneApi';

interface ZoneCity {
  id: number;
  city: string;
}

interface Zone {
  id: number;
  name: string;
  nameHe: string;
  cities: ZoneCity[];
}

export default function ZonesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn: zoneApi.getAll,
  });
  const zones: Zone[] = data?.data || [];

  // Dialog states
  const [addCityDialog, setAddCityDialog] = useState<{ zoneId: number; zoneName: string } | null>(null);
  const [newCities, setNewCities] = useState('');
  const [createDialog, setCreateDialog] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createNameHe, setCreateNameHe] = useState('');
  const [renameDialog, setRenameDialog] = useState<Zone | null>(null);
  const [renameName, setRenameName] = useState('');
  const [renameNameHe, setRenameNameHe] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<Zone | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' | 'warning' } | null>(null);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { name: string; nameHe: string }) => zoneApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      setSnackbar({ message: 'אזור נוצר בהצלחה', severity: 'success' });
      setCreateDialog(false);
      setCreateName('');
      setCreateNameHe('');
    },
    onError: () => setSnackbar({ message: 'שגיאה ביצירת אזור', severity: 'error' }),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { name: string; nameHe: string } }) =>
      zoneApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      setSnackbar({ message: 'שם אזור עודכן', severity: 'success' });
      setRenameDialog(null);
    },
    onError: () => setSnackbar({ message: 'שגיאה בעדכון שם אזור', severity: 'error' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => zoneApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      setSnackbar({ message: 'אזור נמחק', severity: 'success' });
      setDeleteDialog(null);
    },
    onError: () => setSnackbar({ message: 'שגיאה במחיקת אזור', severity: 'error' }),
  });

  const addCitiesMutation = useMutation({
    mutationFn: ({ zoneId, cities }: { zoneId: number; cities: string[] }) =>
      zoneApi.addCities(zoneId, cities),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      setSnackbar({ message: `נוספו ${result.data.added} ערים`, severity: 'success' });
      setAddCityDialog(null);
      setNewCities('');
    },
  });

  const removeCityMutation = useMutation({
    mutationFn: ({ zoneId, cityId }: { zoneId: number; cityId: number }) =>
      zoneApi.removeCity(zoneId, cityId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
    },
  });

  const importCsvMutation = useMutation({
    mutationFn: (rows: { city: string; zone: string }[]) => zoneApi.importCityZones(rows),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['zones'] });
      const { zonesCreated, zonesUpdated, citiesAdded } = result.data;
      const parts: string[] = [];
      if (citiesAdded > 0) parts.push(`${citiesAdded} ערים יובאו`);
      if (zonesCreated > 0) parts.push(`${zonesCreated} אזורים חדשים נוצרו`);
      if (zonesUpdated > 0) parts.push(`${zonesUpdated} אזורים עודכנו`);
      setSnackbar({ message: parts.join(', ') || 'לא נמצאו נתונים', severity: 'success' });
    },
    onError: () => setSnackbar({ message: 'שגיאה בייבוא קובץ', severity: 'error' }),
  });

  const handleAddCities = () => {
    if (!addCityDialog || !newCities.trim()) return;
    const cities = newCities.split(',').map((c) => c.trim()).filter(Boolean);
    addCitiesMutation.mutate({ zoneId: addCityDialog.zoneId, cities });
  };

  const handleCreate = () => {
    if (!createNameHe.trim()) return;
    const name = createName.trim() || createNameHe.trim();
    createMutation.mutate({ name, nameHe: createNameHe.trim() });
  };

  const handleRename = () => {
    if (!renameDialog || !renameNameHe.trim()) return;
    const name = renameName.trim() || renameNameHe.trim();
    renameMutation.mutate({ id: renameDialog.id, data: { name, nameHe: renameNameHe.trim() } });
  };

  const handleCsvImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/);
      const rows: { city: string; zone: string }[] = [];

      // Detect separator (comma or tab)
      const firstLine = lines[0] || '';
      const sep = firstLine.includes('\t') ? '\t' : ',';

      // Try to detect header row
      let startIdx = 0;
      const firstParts = firstLine.split(sep).map((p) => p.trim().replace(/^["']|["']$/g, '').toLowerCase());
      // Check if first row looks like a header
      const headerKeywords = ['עיר', 'אזור', 'city', 'zone', 'area', 'region'];
      if (firstParts.some((p) => headerKeywords.includes(p))) {
        startIdx = 1;
      }

      // Detect column order: find city and zone columns
      let cityCol = 0;
      let zoneCol = 1;
      if (startIdx === 1) {
        const cityKeywords = ['עיר', 'city', 'יישוב', 'ישוב'];
        const zoneKeywords = ['אזור', 'zone', 'area', 'region'];
        for (let i = 0; i < firstParts.length; i++) {
          if (cityKeywords.includes(firstParts[i])) cityCol = i;
          if (zoneKeywords.includes(firstParts[i])) zoneCol = i;
        }
      }

      for (let i = startIdx; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        const parts = trimmed.split(sep).map((p) => p.trim().replace(/^["']|["']$/g, ''));
        const city = parts[cityCol]?.trim();
        const zone = parts[zoneCol]?.trim();
        if (city && zone) {
          rows.push({ city, zone });
        }
      }

      if (rows.length === 0) {
        setSnackbar({ message: 'לא נמצאו נתונים בקובץ. וודא שיש עמודות עיר ואזור', severity: 'error' });
        return;
      }

      importCsvMutation.mutate(rows);
    };
    reader.readAsText(file, 'UTF-8');

    // Reset file input
    e.target.value = '';
  };

  if (isLoading) return <Typography>טוען...</Typography>;

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          bgcolor: '#1e3a5f',
          color: 'white',
          px: 2,
          py: 1,
          mb: 2,
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 700, color: 'white' }}>
          ניהול אזורים
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mr: 1 }}>
          ({zones.length} אזורים | {zones.reduce((sum: number, z: any) => sum + z.cities.length, 0)} ערים)
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          size="small"
          startIcon={<UploadIcon />}
          onClick={handleCsvImport}
          disabled={importCsvMutation.isPending}
          sx={{
            bgcolor: 'rgba(255,255,255,0.15)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          ייבוא CSV
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialog(true)}
          sx={{
            bgcolor: 'rgba(255,255,255,0.15)',
            color: 'white',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
            textTransform: 'none',
            borderRadius: 2,
          }}
        >
          אזור חדש
        </Button>
      </Paper>

      <Alert severity="info" sx={{ mb: 2 }}>
        ייבוא CSV: קובץ עם עמודות "עיר" ו"אזור". הייבוא ידרוס את רשימת הערים הקיימת בכל אזור שמופיע בקובץ. אזורים שלא קיימים ייווצרו אוטומטית.
      </Alert>

      <Grid container spacing={2}>
        {zones.map((zone) => (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={zone.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6">{zone.nameHe}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Chip label={`${zone.cities.length} ערים`} size="small" color="primary" variant="outlined" />
                    <Tooltip title="שנה שם">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setRenameDialog(zone);
                          setRenameName(zone.name);
                          setRenameNameHe(zone.nameHe);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="מחק אזור">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => setDeleteDialog(zone)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <Divider sx={{ mb: 1.5 }} />
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5, minHeight: 60 }}>
                  {zone.cities.map((city) => (
                    <Chip
                      key={city.id}
                      label={city.city}
                      size="small"
                      onDelete={() => removeCityMutation.mutate({ zoneId: zone.id, cityId: city.id })}
                    />
                  ))}
                </Box>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setAddCityDialog({ zoneId: zone.id, zoneName: zone.nameHe })}
                >
                  הוסף ערים
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Hidden file input for CSV */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv,.txt"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Create Zone Dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>יצירת אזור חדש</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="שם אזור (עברית)"
            value={createNameHe}
            onChange={(e) => setCreateNameHe(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
            autoFocus
          />
          <TextField
            fullWidth
            label="שם אזור (אנגלית - אופציונלי)"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)}>ביטול</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!createNameHe.trim() || createMutation.isPending}
          >
            צור
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Zone Dialog */}
      <Dialog open={!!renameDialog} onClose={() => setRenameDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>שינוי שם אזור</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="שם אזור (עברית)"
            value={renameNameHe}
            onChange={(e) => setRenameNameHe(e.target.value)}
            sx={{ mt: 1, mb: 2 }}
            autoFocus
          />
          <TextField
            fullWidth
            label="שם אזור (אנגלית - אופציונלי)"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialog(null)}>ביטול</Button>
          <Button
            variant="contained"
            onClick={handleRename}
            disabled={!renameNameHe.trim() || renameMutation.isPending}
          >
            עדכן
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Zone Confirmation */}
      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>מחיקת אזור</DialogTitle>
        <DialogContent>
          <Typography>
            האם למחוק את האזור "{deleteDialog?.nameHe}"?
          </Typography>
          {deleteDialog && deleteDialog.cities.length > 0 && (
            <Alert severity="warning" sx={{ mt: 1 }}>
              באזור זה {deleteDialog.cities.length} ערים. הזמנות שמשויכות לאזור זה ישוחררו.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>ביטול</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog.id)}
            disabled={deleteMutation.isPending}
          >
            מחק
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Cities Dialog */}
      <Dialog open={!!addCityDialog} onClose={() => setAddCityDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>הוספת ערים ל{addCityDialog?.zoneName}</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            multiline
            rows={3}
            label="ערים (מופרדות בפסיקים)"
            placeholder="למשל: רמת גן, גבעתיים, בני ברק"
            value={newCities}
            onChange={(e) => setNewCities(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddCityDialog(null)}>ביטול</Button>
          <Button variant="contained" onClick={handleAddCities} disabled={addCitiesMutation.isPending}>
            הוסף
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={!!snackbar} autoHideDuration={4000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
