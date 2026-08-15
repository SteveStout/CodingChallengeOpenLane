import type { Vehicle } from './types';
import { auctionTiming, currentPrice, type AuctionStatus } from './auction';

/**
 * Inventory browsing logic: search, filters, and sort as pure functions so
 * the components stay declarative and this stays unit-testable.
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

/** Every whitespace-separated token must match year, make, model, or trim. */
export function matchesQuery(vehicle: Vehicle, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function matchesFilters(vehicle: Vehicle, filters: InventoryFilters, now: number): boolean {
  if (!matchesQuery(vehicle, filters.query)) return false;
  if (filters.make && vehicle.make !== filters.make) return false;
  if (filters.bodyStyle && vehicle.body_style !== filters.bodyStyle) return false;
  if (filters.titleStatus && vehicle.title_status !== filters.titleStatus) return false;
  if (filters.province && vehicle.province !== filters.province) return false;
  if (filters.status && auctionTiming(vehicle, now).status !== filters.status) return false;
  if (filters.minCondition !== null && vehicle.condition_grade < filters.minCondition) return false;
  const price = currentPrice(vehicle);
  if (filters.priceMin !== null && price < filters.priceMin) return false;
  if (filters.priceMax !== null && price > filters.priceMax) return false;
  return true;
}

export function filterVehicles(
  vehicles: Vehicle[],
  filters: InventoryFilters,
  now: number
): Vehicle[] {
  return vehicles.filter((vehicle) => matchesFilters(vehicle, filters, now));
}

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
    case 'ending-soonest':
      return sorted.sort((a, b) => endingSoonestRank(a, now) - endingSoonestRank(b, now));
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
