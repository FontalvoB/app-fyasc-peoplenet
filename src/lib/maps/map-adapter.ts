/**
 * Strict map abstraction contract (symmetric with the PeopleNet ERP frontend).
 *
 * UI components must depend exclusively on `MapAdapter` and `createMapAdapter()`.
 * Never import provider-specific libraries (e.g. `leaflet`) outside their adapter.
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export type MapMarkerColor = 'ok' | 'warn' | 'bad' | 'brand';

export interface MapMarker {
  id?: string;
  position: GeoPoint;
  label?: string;
  popup?: string;
  color?: MapMarkerColor;
}

export interface MapCircle {
  id?: string;
  center: GeoPoint;
  radiusMeters: number;
  color?: MapMarkerColor;
  fillOpacity?: number;
}

export interface MapPolyline {
  id?: string;
  points: GeoPoint[];
  color?: MapMarkerColor;
  weight?: number;
  dashed?: boolean;
}

export interface MapMountOptions {
  center: GeoPoint;
  zoom?: number;
  interactive?: boolean;
}

export type MapProviderType = 'leaflet' | 'google';

export interface MapAdapter {
  readonly provider: MapProviderType;
  mount(container: HTMLElement, options: MapMountOptions): void;
  setView(center: GeoPoint, zoom?: number): void;
  setMarkers(markers: MapMarker[]): void;
  setCircles(circles: MapCircle[]): void;
  setPolylines(polylines: MapPolyline[]): void;
  fitBounds(points: GeoPoint[], paddingPx?: number): void;
  onMapClick(handler: ((point: GeoPoint) => void) | null): void;
  destroy(): void;
}
