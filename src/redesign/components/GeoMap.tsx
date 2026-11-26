import { useEffect, useRef } from 'react';
import { createMapAdapter } from '../../lib/maps/create-map-adapter';
import type {
  GeoPoint,
  MapAdapter,
  MapCircle,
  MapMarker,
  MapPolyline,
} from '../../lib/maps/map-adapter';

export interface GeoMapProps {
  center: GeoPoint;
  zoom?: number;
  markers?: MapMarker[];
  circles?: MapCircle[];
  polylines?: MapPolyline[];
  height?: string;
  interactive?: boolean;
  pickMode?: boolean;
  autoFit?: boolean;
  onPointSelected?: (point: GeoPoint) => void;
  className?: string;
}

const DEFAULT_ZOOM = 15;
const DEFAULT_HEIGHT = '220px';
const EMPTY_MARKERS: MapMarker[] = [];
const EMPTY_CIRCLES: MapCircle[] = [];
const EMPTY_POLYLINES: MapPolyline[] = [];

/**
 * Reusable map component decoupled from the underlying map provider via `MapAdapter`.
 */
export function GeoMap({
  center,
  zoom = DEFAULT_ZOOM,
  markers = EMPTY_MARKERS,
  circles = EMPTY_CIRCLES,
  polylines = EMPTY_POLYLINES,
  height = DEFAULT_HEIGHT,
  interactive = true,
  pickMode = false,
  autoFit = false,
  onPointSelected,
  className,
}: GeoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const onPointSelectedRef = useRef(onPointSelected);

  useEffect(() => {
    onPointSelectedRef.current = onPointSelected;
  }, [onPointSelected]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const adapter = createMapAdapter();
    adapterRef.current = adapter;
    adapter.mount(container, { center, zoom, interactive });

    return () => {
      adapter.destroy();
      if (adapterRef.current === adapter) {
        adapterRef.current = null;
      }
    };
    // Remount only when container interactivity mode changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter) return;

    adapter.setMarkers(markers);
    adapter.setCircles(circles);
    adapter.setPolylines(polylines);

    if (autoFit) {
      const points: GeoPoint[] = [
        ...markers.map((marker) => marker.position),
        ...circles.map((circle) => circle.center),
        ...polylines.flatMap((polyline) => polyline.points),
      ];
      if (points.length > 0) {
        adapter.fitBounds(points);
      }
    }
  }, [markers, circles, polylines, autoFit, interactive]);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || autoFit) return;

    adapter.setView(center, zoom);
  }, [center.lat, center.lng, zoom, autoFit, interactive]);

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter) return;

    if (!pickMode) {
      adapter.onMapClick(null);
      return;
    }

    adapter.onMapClick((point) => {
      onPointSelectedRef.current?.(point);
    });

    return () => {
      adapter.onMapClick(null);
    };
  }, [pickMode, interactive]);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={pickMode ? 'Mapa interactivo para seleccionar ubicación' : 'Mapa de ubicación'}
      data-pick-mode={pickMode ? 'true' : undefined}
      className={className}
      style={{
        width: '100%',
        height,
        position: 'relative',
        isolation: 'isolate',
        overflow: 'hidden',
        borderRadius: 'var(--pn-radius-sm, 14px)',
        border: '1px solid var(--pn-line, #e1eaf6)',
        background: 'var(--pn-blue-soft, #eaf3ff)',
        cursor: pickMode ? 'crosshair' : undefined,
      }}
    />
  );
}
