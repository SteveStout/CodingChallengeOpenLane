import type { Vehicle } from './types';
import { filtersToSearchParams, type InventoryFilters, type SortKey } from './inventory';

/**
 * The single seam for inventory data: the .NET API (api/) serves a paged
 * envelope { total, vehicles } — filtering, sorting, and paging all happen
 * server-side from these GET parameters (the dataset is 100k records; the
 * browser only ever holds a page). In dev, Vite proxies /api to
 * http://localhost:5210 (see vite.config.ts), so run `npm run api`
 * alongside `npm run dev`.
 *
 * Responses are cached in-memory per query string for a short TTL, so
 * revisiting a filter combination renders instantly. Refresh paths (the
 * periodic status refresh, retry buttons) bypass the cache explicitly.
 */

export interface VehiclePage {
  total: number;
  vehicles: Vehicle[];
}

export interface InventoryFacets {
  makes: string[];
  body_styles: string[];
  title_statuses: string[];
  provinces: string[];
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 30;

interface CacheEntry {
  at: number;
  page: VehiclePage;
}

/** Map preserves insertion order, so the first key is always the oldest. */
const queryCache = new Map<string, CacheEntry>();

export function clearVehicleCache(): void {
  queryCache.clear();
}

/** Maps UI filter/sort state to the API's query parameters. Exported for tests. */
export function vehicleQueryParams(
  filters: InventoryFilters,
  sort: SortKey = 'ending-soonest'
): URLSearchParams {
  const params = filtersToSearchParams(filters, sort);
  // Auction windows anchor to the buyer's local midnight. Every request
  // carries it because the status filter, text search (tokens like "live"),
  // and the default auction-time sort all derive from the schedule — this
  // keeps the API's clock in agreement with what the UI renders, whatever
  // timezone (or DST day) each side is in. Stable within a day, so cache
  // keys stay stable too. (The URL bar uses filtersToSearchParams directly,
  // without the anchor — it's clock plumbing, not user state.)
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  params.set('anchor_ms', String(midnight.getTime()));
  return params;
}

function cacheKey(filters?: InventoryFilters, sort?: SortKey): string {
  return (filters ? vehicleQueryParams(filters, sort) : new URLSearchParams()).toString();
}

function cachedPage(key: string): VehiclePage | null {
  const hit = queryCache.get(key);
  return hit && Date.now() - hit.at < CACHE_TTL_MS ? hit.page : null;
}

/**
 * Synchronous cache peek. Callers use this to skip their request debounce on
 * a hit — the debounce only exists to avoid hammering the API, and a cached
 * result never touches the API.
 */
export function peekVehicles(filters?: InventoryFilters, sort?: SortKey): VehiclePage | null {
  return cachedPage(cacheKey(filters, sort));
}

export interface FetchVehiclesOptions {
  sort?: SortKey;
  signal?: AbortSignal;
  /** Skip the cache and overwrite it with a fresh response. */
  forceRefresh?: boolean;
}

export async function fetchVehicles(
  filters?: InventoryFilters,
  { sort, signal, forceRefresh = false }: FetchVehiclesOptions = {}
): Promise<VehiclePage> {
  const key = cacheKey(filters, sort);

  if (!forceRefresh) {
    const hit = cachedPage(key);
    if (hit) {
      return hit;
    }
  }

  const response = await fetch(`/api/vehicles${key ? `?${key}` : ''}`, { signal });
  if (!response.ok) {
    throw new Error(`The inventory API responded with ${response.status}`);
  }
  const page = (await response.json()) as VehiclePage;

  // Re-inserting moves the key to the back, so eviction drops the stalest.
  queryCache.delete(key);
  queryCache.set(key, { at: Date.now(), page });
  if (queryCache.size > CACHE_MAX_ENTRIES) {
    const oldest = queryCache.keys().next().value;
    if (oldest !== undefined) queryCache.delete(oldest);
  }
  return page;
}

/** Dropdown values, computed by the API over the full dataset. */
export async function fetchFacets(signal?: AbortSignal): Promise<InventoryFacets> {
  const response = await fetch('/api/facets', { signal });
  if (!response.ok) {
    throw new Error(`The inventory API responded with ${response.status}`);
  }
  return (await response.json()) as InventoryFacets;
}
