import { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

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

interface Stop {
  orderId: number;
  orderNumber: string;
  customerName: string;
  city: string;
  sequence: number;
  latitude: number | null;
  longitude: number | null;
  legDistanceKm: number;
  legDurationMinutes: number;
}

interface Warehouse {
  address: string;
  lat: number;
  lng: number;
}

interface RouteMapProps {
  stops: Stop[];
  warehouse: Warehouse;
  height?: number | string;
}

function createNumberedIcon(num: number): L.DivIcon {
  return L.divIcon({
    html: `<div style="
      background: #1976d2; color: #fff; border-radius: 50%;
      width: 28px; height: 28px; display: flex;
      align-items: center; justify-content: center;
      font-weight: bold; font-size: 13px;
      border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    ">${num}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

const warehouseIcon = L.divIcon({
  html: `<div style="
    background: #d32f2f; color: #fff; border-radius: 50%;
    width: 34px; height: 34px; display: flex;
    align-items: center; justify-content: center;
    font-size: 18px;
    border: 3px solid #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  ">\u{1F3ED}</div>`,
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -20],
});

function FitBoundsAndInvalidate({ positions }: { positions: L.LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    // Delay to ensure MUI Dialog animation is complete
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (positions.length > 0) {
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [map, positions]);
  return null;
}

export default function RouteMap({ stops, warehouse, height = 350 }: RouteMapProps) {
  const stopsWithCoords = useMemo(
    () => stops.filter((s) => s.latitude != null && s.longitude != null).sort((a, b) => a.sequence - b.sequence),
    [stops]
  );

  const allPositions = useMemo(() => {
    const positions: L.LatLngExpression[] = [[warehouse.lat, warehouse.lng]];
    stopsWithCoords.forEach((s) => positions.push([s.latitude!, s.longitude!]));
    return positions;
  }, [stopsWithCoords, warehouse]);

  const routeLine = useMemo(() => {
    const path: L.LatLngExpression[] = [[warehouse.lat, warehouse.lng]];
    stopsWithCoords.forEach((s) => path.push([s.latitude!, s.longitude!]));
    path.push([warehouse.lat, warehouse.lng]); // return to warehouse
    return path;
  }, [stopsWithCoords, warehouse]);

  const center: L.LatLngExpression = [warehouse.lat, warehouse.lng];

  return (
    <MapContainer
      center={center}
      zoom={10}
      style={{ height, width: '100%', borderRadius: 8 }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBoundsAndInvalidate positions={allPositions} />

      {/* Warehouse marker */}
      <Marker position={[warehouse.lat, warehouse.lng]} icon={warehouseIcon}>
        <Popup>
          <strong>{'\u{1F3ED}'} מחסן</strong>
          <br />
          {warehouse.address}
        </Popup>
      </Marker>

      {/* Stop markers */}
      {stopsWithCoords.map((stop) => (
        <Marker
          key={stop.orderId}
          position={[stop.latitude!, stop.longitude!]}
          icon={createNumberedIcon(stop.sequence)}
        >
          <Popup>
            <strong>עצירה {stop.sequence}</strong>
            <br />
            {stop.customerName}
            <br />
            {stop.city}
            <br />
            הזמנה: {stop.orderNumber}
          </Popup>
        </Marker>
      ))}

      {/* Route polyline */}
      <Polyline
        positions={routeLine}
        pathOptions={{
          color: '#1976d2',
          weight: 4,
          opacity: 0.8,
          dashArray: '10, 6',
        }}
      />
    </MapContainer>
  );
}
