import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";

const PIN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>';

const LOCKER_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/></svg>';

function carrierIcon(color, active, type) {
  const size = active ? 40 : 28;
  const isLocker = type === "locker";
  const shape = isLocker ? "border-radius:6px;" : "border-radius:50%;";
  return L.divIcon({
    className: "",
    html: `<div class="rp-marker" style="width:${size}px;height:${size}px;background:${color};${shape}${
      active ? "transform:scale(1.15);box-shadow:0 0 16px " + color + ";z-index:600;" : ""
    }">${isLocker ? LOCKER_SVG : PIN_SVG}</div>`,
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

function ClusterLayer({ points, selectedId, onSelect }) {
  const map = useMap();
  const groupRef = useRef(null);

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        const size = count < 20 ? 34 : count < 100 ? 42 : 52;
        return L.divIcon({
          className: "",
          html: `<div class="rp-cluster">${count}</div>`,
          iconSize: [size, size],
        });
      },
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers = points.map((p) => {
      const m = L.marker([p.lat, p.lng], {
        icon: carrierIcon(p.color, false, p.type),
      });
      m.on("click", () => onSelect(p));
      return m;
    });
    group.addLayers(markers);
  }, [points, onSelect]);

  return null;
}

export default function MapView({ points, userLocation, flyTarget, onSelect }) {
  return (
    <MapContainer
      center={[46.6, 2.4]}
      zoom={6}
      minZoom={5}
      maxZoom={18}
      maxBounds={[
        [41.0, -5.8],
        [51.5, 9.8],
      ]}
      maxBoundsViscosity={1.0}
      zoomControl={false}
      className="h-full w-full"
      style={{ height: "100%", width: "100%" }}
    >
      <ZoomControl position="topright" />
      <TileLayer
        url="https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png"
        subdomains={["a", "b", "c"]}
        maxZoom={20}
        attribution='&copy; OpenStreetMap France | &copy; contributeurs OpenStreetMap'
      />
      <FlyController target={flyTarget} />
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon} />
      )}
      <ClusterLayer points={points} onSelect={onSelect} />
    </MapContainer>
  );
}
