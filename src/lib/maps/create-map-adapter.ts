import { GoogleMapsAdapter } from './google-maps-adapter';
import { LeafletMapAdapter } from './leaflet-map-adapter';
import type { MapAdapter, MapProviderType } from './map-adapter';

export interface CreateMapAdapterOptions {
  provider?: MapProviderType;
  googleMapsApiKey?: string;
}

function resolveProvider(raw?: string): MapProviderType {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'google') {
    return 'google';
  }
  return 'leaflet';
}

/**
 * Factory that resolves the active `MapAdapter` implementation from Vite env config.
 * Defaults to OpenStreetMap via `LeafletMapAdapter`.
 */
export function createMapAdapter(options: CreateMapAdapterOptions = {}): MapAdapter {
  const provider = options.provider ?? resolveProvider(import.meta.env.VITE_MAP_PROVIDER);

  if (provider === 'google') {
    const apiKey = options.googleMapsApiKey ?? import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    return new GoogleMapsAdapter({ apiKey });
  }

  return new LeafletMapAdapter();
}
