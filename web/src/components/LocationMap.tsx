import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const ZOOM = 13;
// A dark basemap to match the dashboard's own theme, rather than
// Leaflet's default bright OSM tiles. Public, no API key.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap contributors';

interface Props {
  latitude: number | null;
  longitude: number | null;
  label: string | null;
  loading: boolean;
}

// A small on-demand map showing where the focused photo was taken
// (PROJECT.md §12, revisited for the dashboard — GPS EXIF was previously
// "never surfaced anywhere"; still never sent to the TV, see
// api/src/playlist/presentation.ts). Coordinates come from the parent,
// which fetches them per-asset via GET /assets/:id/location — this
// component only ever renders a map, it never fetches.
export function LocationMap({ latitude, longitude, label, loading }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  // Created once, destroyed on unmount — Leaflet owns this DOM node
  // directly and must never be re-initialized on top of itself.
  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([0, 0], 1);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Moves the view/marker without recreating the map — this is what
  // actually responds to "click a next photo" / "click the current
  // photo to reset" (TvDetailPane.tsx owns which asset is focused).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (latitude === null || longitude === null) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }

    const position: L.LatLngExpression = [latitude, longitude];
    if (markerRef.current) {
      markerRef.current.setLatLng(position);
    } else {
      markerRef.current = L.circleMarker(position, {
        radius: 7,
        color: '#c9a876',
        weight: 2,
        fillColor: '#c9a876',
        fillOpacity: 0.85,
      }).addTo(map);
    }
    map.setView(position, ZOOM);
  }, [latitude, longitude]);

  const hasLocation = latitude !== null && longitude !== null;

  return (
    <div className="location-map">
      <div ref={containerRef} className="location-map-canvas" />
      {!loading && !hasLocation && <div className="location-map-empty">No location data</div>}
      {label && <div className="location-map-label">{label}</div>}
    </div>
  );
}
