import type { Vehicle } from './types';
import { auctionTiming, currentPrice, type AuctionStatus } from './auction';

/**
 * Inventory browsing state and client-side concerns: the filter model the UI
 * edits (applied server-side via /api/vehicles GET parameters — see data.ts),
 * sorting of the returned results, and dropdown facets.
 */

export interface InventoryFilters {
  /** Free-text search across year, make, model, and trim. */
  query: string;
  /** Empty string means "any" for the select-based filters. */
  make: string;
  bodyStyle: string;
  titleStatus: string;
  province: string;
  status: AuctionStatus | '';
  minCondition: number | null;
  /** Bounds apply to the price a buyer competes against (bid or opening ask). */
  priceMin: number | null;
  priceMax: number | null;
}

export const EMPTY_FILTERS: InventoryFilters = {
  query: '',
  make: '',
  bodyStyle: '',
  titleStatus: '',
  province: '',
  status: '',
  minCondition: null,
  priceMin: null,
  priceMax: null,
};

export type SortKey = 'ending-soonest' | 'price-asc' | 'price-desc' | 'condition' | 'most-bids';

export const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'ending-soonest', label: 'Ending soonest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'condition', label: 'Highest condition' },
  { value: 'most-bids', label: 'Most bids' },
];

/** Live first (closest to ending), then upcoming (starting soonest), then ended (most recent). */
function endingSoonestRank(vehicle: Vehicle, now: number): number {
  const { status, startsAt, endsAt } = auctionTiming(vehicle, now);
  if (status === 'live') return endsAt;
  if (status === 'upcoming') return 1e15 + startsAt;
  return 2e15 - endsAt;
}

export function sortVehicles(vehicles: Vehicle[], sort: SortKey, now: number): Vehicle[] {
  const sorted = [...vehicles];
  switch (sort) {
    case 'ending-soonest': {
      // Rank once per vehicle, not once per comparison — the rank derives the
      // auction window each time, and this sort re-runs on every clock tick.
      const rank = new Map(vehicles.map((v) => [v.id, endingSoonestRank(v, now)]));
      return sorted.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }
    case 'price-asc':
      return sorted.sort((a, b) => currentPrice(a) - currentPrice(b));
    case 'price-desc':
      return sorted.sort((a, b) => currentPrice(b) - currentPrice(a));
    case 'condition':
      return sorted.sort((a, b) => b.condition_grade - a.condition_grade);
    case 'most-bids':
      return sorted.sort((a, b) => b.bid_count - a.bid_count);
  }
}

/** Distinct values of a field, sorted alphabetically — feeds the filter dropdowns. */
export function distinctValues(
  vehicles: Vehicle[],
  field: 'make' | 'body_style' | 'title_status' | 'province'
): string[] {
  return [...new Set(vehicles.map((vehicle) => vehicle[field]))].sort((a, b) =>
    a.localeCompare(b)
  );
}

export function countActiveFilters(filters: InventoryFilters): number {
  let count = 0;
  if (filters.query.trim()) count++;
  if (filters.make) count++;
  if (filters.bodyStyle) count++;
  if (filters.titleStatus) count++;
  if (filters.province) count++;
  if (filters.status) count++;
  if (filters.minCondition !== null) count++;
  if (filters.priceMin !== null || filters.priceMax !== null) count++;
  return count;
}
