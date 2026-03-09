import { useState } from 'react';
import {
  Box, Typography, Card, CardContent, Chip,
  TextField, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, Snackbar, Divider,
} from '@mui/material';
import Grid from '@mui/material/Grid2';
import { Add as AddIcon } from '@mui/icons-material';
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
  const { data, isLoading } = useQuery({
    queryKey: ['zones'],
    queryFn: zoneApi.getAll,
  });
  const zones: Zone[] = data?.data || [];

  const [addCityDialog, setAddCityDialog] = useState<{ zoneId: number; zoneName: string } | null>(null);
  const [newCities, setNewCities] = useState('');
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

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

  const handleAddCities = () => {
    if (!addCityDialog || !newCities.trim()) return;
    const cities = newCities.split(',').map((c) => c.trim()).filter(Boolean);
    addCitiesMutation.mutate({ zoneId: addCityDialog.zoneId, cities });
  };

  if (isLoading) return <Typography>טוען...</Typography>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">ניהול אזורים</Typography>
        <Typography variant="body2" color="text.secondary">
          {zones.length} אזורים | {zones.reduce((sum, z) => sum + z.cities.length, 0)} ערים
        </Typography>
      </Box>

      <Grid container spacing={2}>
        {zones.map((zone) => (
          <Grid size={{ xs: 12, md: 6, lg: 4 }} key={zone.id}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6">{zone.nameHe}</Typography>
                  <Chip label={`${zone.cities.length} ערים`} size="small" color="primary" variant="outlined" />
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

      <Snackbar open={!!snackbar} autoHideDuration={3000} onClose={() => setSnackbar(null)}>
        {snackbar ? <Alert severity={snackbar.severity}>{snackbar.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}
