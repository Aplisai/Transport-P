import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";

const PIN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';

function carrierIcon(color, active) {
  const size = active ? 40 : 30;
  return L.divIcon({
    className: "",
    html: `<div class="rp-marker" style="width:${size}px;height:${size}px;background:${color};${
      active ? "transform:scale(1.15);box-shadow:0 0 16px " + color + ";z-index:600;" : ""
    }">${PIN_SVG}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const userIcon = L.divIcon({
  className: "",
  html: '<div class="rp-marker-user" style="width:16px;height:16px;"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function FlyController({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], target.zoom || 14, { duration: 1.2 });
    }
  }, [target, map]);
  return null;
}

export default function MapView({ points, selectedId, userLocation, flyTarget, onSelect }) {
  const icons = useMemo(() => ({}), []);

  return (
    <MapContainer
      center={[46.6, 2.4]}
      zoom={6}
      zoomControl={true}
      className="h-full w-full"
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <FlyController target={flyTarget} />

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />
      )}

      {points.map((p) => {
        const active = p.id === selectedId;
        return (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={carrierIcon(p.color, active)}
            eventHandlers={{ click: () => onSelect(p) }}
          />
        );
      })}
    </MapContainer>
  );
}
