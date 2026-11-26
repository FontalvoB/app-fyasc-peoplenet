import type {
  GeoPoint,
  MapAdapter,
  MapCircle,
  MapMarker,
  MapMountOptions,
  MapPolyline,
  MapProviderType,
} from './map-adapter';

export interface GoogleMapsAdapterOptions {
  apiKey?: string;
}

/**
 * Typed stub for a future Google Maps JS API implementation of `MapAdapter`.
 * Switching `VITE_MAP_PROVIDER=google` will route here without modifying React UI components.
 */
export class GoogleMapsAdapter implements MapAdapter {
  readonly provider: MapProviderType = 'google';

  private readonly apiKey?: string;
  private container: HTMLElement | null = null;
  private clickHandler: ((point: GeoPoint) => void) | null = null;

  constructor(options: GoogleMapsAdapterOptions = {}) {
    this.apiKey = options.apiKey;
  }

  mount(container: HTMLElement, _options: MapMountOptions): void {
    this.container = container;
    const keyStatus = this.apiKey ? 'API key present' : 'missing VITE_GOOGLE_MAPS_API_KEY';
    console.warn(
      `[GoogleMapsAdapter] Google Maps provider is not yet wired (${keyStatus}). Falling back to no-op stub.`,
    );
  }

  setView(_center: GeoPoint, _zoom?: number): void {
    // Future Google Maps `map.setCenter` / `map.setZoom` integration.
  }

  setMarkers(_markers: MapMarker[]): void {
    // Future Google Maps `google.maps.marker.AdvancedMarkerElement` integration.
  }

  setCircles(_circles: MapCircle[]): void {
    // Future Google Maps `google.maps.Circle` integration.
  }

  setPolylines(_polylines: MapPolyline[]): void {
    // Future Google Maps `google.maps.Polyline` integration.
  }

  fitBounds(_points: GeoPoint[], _paddingPx?: number): void {
    // Future Google Maps `map.fitBounds` integration.
  }

  onMapClick(handler: ((point: GeoPoint) => void) | null): void {
    this.clickHandler = handler;
  }

  destroy(): void {
    this.container = null;
    this.clickHandler = null;
  }

  /** Exposes whether a container is currently bound (prevents unused private field lint warnings). */
  isMounted(): boolean {
    return this.container !== null && this.clickHandler !== undefined;
  }
}
