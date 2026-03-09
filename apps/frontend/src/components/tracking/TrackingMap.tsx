import { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Box, Typography } from '@mui/material';

// Fix Leaflet default marker icon paths for Vite bundler
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface WorkerMarker {
  userId: number;
  fullName: string;
  type: 'DRIVER' | 'INSTALLER';
  truckName: string | null;
  lastLocation: { lat: number; lng: number; timestamp: string; isGps?: boolean } | null;
  completedCount: number;
  totalCount: number;
}

interface TrackingMapProps {
  workers: WorkerMarker[];
  selectedWorkerId: number | null;
  onWorkerClick: (userId: number) => void;
  height?: number | string;
}

function createWorkerIcon(type: 'DRIVER' | 'INSTALLER', isSelected: boolean, isGps: boolean): L.DivIcon {
  const bg = type === 'DRIVER' ? '#1976d2' : '#f57c00';
  const size = isSelected ? 38 : 30;
  const border = isSelected ? '3px solid #fff' : '2px solid #fff';
  const shadow = isSelected ? '0 2px 10px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.3)';
  const emoji = type === 'DRIVER' ? '\u{1F69A}' : '\u{1F527}';
  const opacity = isGps ? '1' : '0.7';

  return L.divIcon({
    html: `<div style="
      background: ${bg}; color: #fff; border-radius: 50%;
      width: ${size}px; height: ${size}px; display: flex;
      align-items: center; justify-content: center;
      font-weight: bold; font-size: ${isSelected ? 16 : 13}px;
      border: ${border}; box-shadow: ${shadow};
      cursor: pointer; opacity: ${opacity};
    ">${emoji}</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 4)],
  });
}

function FitBoundsAndInvalidate({ positions, selectedPosition }: { positions: L.LatLngExpression[]; selectedPosition: L.LatLngExpression | null }) {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (selectedPosition) {
        map.setView(selectedPosition, 14, { animate: true });
      } else if (positions.length > 0) {
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [map, positions, selectedPosition]);

  return null;
}

function formatTimestamp(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function TrackingMap({ workers, selectedWorkerId, onWorkerClick, height = 'calc(100vh - 200px)' }: TrackingMapProps) {
  const workersWithLocation = useMemo(
    () => workers.filter((w) => w.lastLocation != null),
    [workers]
  );

  const allPositions = useMemo<L.LatLngExpression[]>(
    () => workersWithLocation.map((w) => [w.lastLocation!.lat, w.lastLocation!.lng]),
    [workersWithLocation]
  );

  const selectedPosition = useMemo<L.LatLngExpression | null>(() => {
    if (!selectedWorkerId) return null;
    const w = workersWithLocation.find((w) => w.userId === selectedWorkerId);
    if (!w) return null;
    return [w.lastLocation!.lat, w.lastLocation!.lng];
  }, [workersWithLocation, selectedWorkerId]);

  // Default center: Israel
  const center: L.LatLngExpression = [31.7683, 35.2137];

  if (workersWithLocation.length === 0) {
    return (
      <Box sx={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#e0e0e0', borderRadius: 2 }}>
        <Typography color="text.secondary">אין נתוני מיקום זמינים - ודאו שהזמנות כוללות קואורדינטות</Typography>
      </Box>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={8}
      style={{ height, width: '100%', borderRadius: 8 }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBoundsAndInvalidate positions={allPositions} selectedPosition={selectedPosition} />

      {workersWithLocation.map((worker) => {
        const isGps = worker.lastLocation?.isGps !== false;
        return (
          <Marker
            key={worker.userId}
            position={[worker.lastLocation!.lat, worker.lastLocation!.lng]}
            icon={createWorkerIcon(worker.type, selectedWorkerId === worker.userId, isGps)}
            eventHandlers={{
              click: () => onWorkerClick(worker.userId),
            }}
          >
            <Popup>
              <strong>{worker.fullName}</strong>
              <br />
              {worker.type === 'DRIVER' ? `\u{1F69A} ${worker.truckName || 'נהג'}` : '\u{1F527} מתקין'}
              <br />
              {worker.completedCount}/{worker.totalCount} הזמנות הושלמו
              <br />
              <small>
                {isGps
                  ? `עדכון GPS: ${formatTimestamp(worker.lastLocation!.timestamp)}`
                  : '\u{1F4CD} מיקום לפי כתובת הזמנה'}
              </small>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
