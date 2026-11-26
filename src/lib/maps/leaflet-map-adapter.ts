import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type {
  GeoPoint,
  MapAdapter,
  MapCircle,
  MapMarker,
  MapMarkerColor,
  MapMountOptions,
  MapPolyline,
  MapProviderType,
} from './map-adapter';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';
const DEFAULT_ZOOM = 15;
const MAX_FIT_ZOOM = 16;

interface ColorPaletteEntry {
  fill: string;
  stroke: string;
}

const COLOR_PALETTE: Record<MapMarkerColor, ColorPaletteEntry> = {
  ok: { fill: '#176649', stroke: '#0f4732' },
  warn: { fill: '#d97706', stroke: '#92400e' },
  bad: { fill: '#b91c1c', stroke: '#7f1d1d' },
  brand: { fill: '#2e7fe8', stroke: '#14284b' },
};

/** Builds an inline SVG pin via L.divIcon so Vite/PWA builds never rely on broken PNG asset URLs. */
function createPinIcon(color: MapMarkerColor = 'brand'): L.DivIcon {
  const { fill, stroke } = COLOR_PALETTE[color];
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36" aria-hidden="true">',
    `<path d="M14 1.5C7.1 1.5 1.5 7.1 1.5 14c0 9.1 11.1 19.6 11.6 20 .5.5 1.3.5 1.8 0 .5-.4 11.6-10.9 11.6-20 0-6.9-5.6-12.5-12.5-12.5Z" fill="${fill}" stroke="#ffffff" stroke-width="2.2"/>`,
    `<circle cx="14" cy="13.5" r="5" fill="#ffffff" stroke="${stroke}" stroke-width="1.2"/>`,
    '</svg>',
  ].join('');

  return L.divIcon({
    className: 'pn-leaflet-pin',
    html: `<div style="width:28px;height:36px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(20,40,75,0.28));">${svg}</div>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
  });
}

function createSafeTextNode(tag: 'span' | 'div', text: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

/**
 * Leaflet implementation of `MapAdapter` backed by OpenStreetMap tiles.
 */
export class LeafletMapAdapter implements MapAdapter {
  readonly provider: MapProviderType = 'leaflet';

  private map: L.Map | null = null;
  private markersLayer: L.LayerGroup | null = null;
  private circlesLayer: L.LayerGroup | null = null;
  private polylinesLayer: L.LayerGroup | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private clickHandler: ((point: GeoPoint) => void) | null = null;

  private readonly handleLeafletClick = (event: L.LeafletMouseEvent): void => {
    this.clickHandler?.({
      lat: event.latlng.lat,
      lng: event.latlng.lng,
    });
  };

  mount(container: HTMLElement, options: MapMountOptions): void {
    if (this.map) {
      this.destroy();
    }

    const interactive = options.interactive ?? true;
    const zoom = options.zoom ?? DEFAULT_ZOOM;

    const map = L.map(container, {
      center: [options.center.lat, options.center.lng],
      zoom,
      zoomControl: interactive,
      dragging: interactive,
      touchZoom: interactive,
      doubleClickZoom: interactive,
      scrollWheelZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      attributionControl: true,
    });

    L.tileLayer(OSM_TILE_URL, {
      maxZoom: 19,
      attribution: OSM_ATTRIBUTION,
    }).addTo(map);

    this.polylinesLayer = L.layerGroup().addTo(map);
    this.circlesLayer = L.layerGroup().addTo(map);
    this.markersLayer = L.layerGroup().addTo(map);

    map.on('click', this.handleLeafletClick);
    this.map = map;

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize();
      });
      this.resizeObserver.observe(container);
    }

    requestAnimationFrame(() => {
      this.map?.invalidateSize();
    });
  }

  setView(center: GeoPoint, zoom?: number): void {
    if (!this.map) return;
    const targetZoom = zoom ?? this.map.getZoom();
    this.map.setView([center.lat, center.lng], targetZoom);
  }

  setMarkers(markers: MapMarker[]): void {
    if (!this.markersLayer) return;
    this.markersLayer.clearLayers();

    for (const marker of markers) {
      const leafletMarker = L.marker([marker.position.lat, marker.position.lng], {
        icon: createPinIcon(marker.color ?? 'brand'),
      });

      if (marker.label) {
        leafletMarker.bindTooltip(createSafeTextNode('span', marker.label), {
          direction: 'top',
          offset: [0, -32],
        });
      }

      if (marker.popup) {
        leafletMarker.bindPopup(createSafeTextNode('div', marker.popup));
      }

      leafletMarker.addTo(this.markersLayer);
    }
  }

  setCircles(circles: MapCircle[]): void {
    if (!this.circlesLayer) return;
    this.circlesLayer.clearLayers();

    for (const circle of circles) {
      const palette = COLOR_PALETTE[circle.color ?? 'brand'];
      L.circle([circle.center.lat, circle.center.lng], {
        radius: circle.radiusMeters,
        color: palette.stroke,
        fillColor: palette.fill,
        fillOpacity: circle.fillOpacity ?? 0.18,
        weight: 2,
      }).addTo(this.circlesLayer);
    }
  }

  setPolylines(polylines: MapPolyline[]): void {
    if (!this.polylinesLayer) return;
    this.polylinesLayer.clearLayers();

    for (const polyline of polylines) {
      if (polyline.points.length < 2) continue;
      const palette = COLOR_PALETTE[polyline.color ?? 'brand'];
      const latLngs: L.LatLngTuple[] = polyline.points.map((point) => [point.lat, point.lng]);

      L.polyline(latLngs, {
        color: palette.fill,
        weight: polyline.weight ?? 4,
        dashArray: polyline.dashed ? '6 6' : undefined,
      }).addTo(this.polylinesLayer);
    }
  }

  fitBounds(points: GeoPoint[], paddingPx = 24): void {
    if (!this.map || points.length === 0) return;

    if (points.length === 1) {
      const single = points[0];
      this.map.setView([single.lat, single.lng], Math.max(this.map.getZoom(), DEFAULT_ZOOM));
      return;
    }

    const latLngs: L.LatLngTuple[] = points.map((point) => [point.lat, point.lng]);
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, {
        padding: [paddingPx, paddingPx],
        maxZoom: MAX_FIT_ZOOM,
      });
    }
  }

  onMapClick(handler: ((point: GeoPoint) => void) | null): void {
    this.clickHandler = handler;
  }

  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.markersLayer?.clearLayers();
    this.circlesLayer?.clearLayers();
    this.polylinesLayer?.clearLayers();

    this.markersLayer = null;
    this.circlesLayer = null;
    this.polylinesLayer = null;
    this.clickHandler = null;

    if (this.map) {
      this.map.off('click', this.handleLeafletClick);
      this.map.remove();
      this.map = null;
    }
  }
}
