import type { Vehicle } from './types';
import type { InventoryFilters } from './inventory';

/**
 * The single seam for inventory data: the .NET API (api/) serves the dataset
 * as JSON with image URLs pointing at its own /api/images endpoint, and does
 * ALL filtering server-side from these GET parameters. In dev, Vite proxies
 * /api to http://localhost:5210 (see vite.config.ts), so run `npm run api`
 * alongside `npm run dev`.
 */

/** Maps UI filter state to the API's query parameters. Exported for tests. */
export function vehicleQueryParams(filters: InventoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  if (query) params.set('q', query);
  if (filters.make) params.set('make', filters.make);
  if (filters.bodyStyle) params.set('body_style', filters.bodyStyle);
  if (filters.titleStatus) params.set('title_status', filters.titleStatus);
  if (filters.province) params.set('province', filters.province);
  if (filters.status) {
    params.set('status', filters.status);
    // Auction windows anchor to the buyer's local midnight; send that exact
    // instant so the API's status filter agrees with what the UI renders,
    // whatever timezone (or DST day) each side is in.
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    params.set('anchor_ms', String(midnight.getTime()));
  }
  if (filters.minCondition !== null) params.set('min_condition', String(filters.minCondition));
  if (filters.priceMin !== null) params.set('price_min', String(filters.priceMin));
  if (filters.priceMax !== null) params.set('price_max', String(filters.priceMax));
  return params;
}

export async function fetchVehicles(
  filters?: InventoryFilters,
  signal?: AbortSignal
): Promise<Vehicle[]> {
  const params = filters ? vehicleQueryParams(filters) : new URLSearchParams();
  const query = params.size > 0 ? `?${params}` : '';
  const response = await fetch(`/api/vehicles${query}`, { signal });
  if (!response.ok) {
    throw new Error(`The inventory API responded with ${response.status}`);
  }
  return (await response.json()) as Vehicle[];
}
