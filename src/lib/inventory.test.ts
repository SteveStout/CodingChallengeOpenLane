import { describe, expect, it } from 'vitest';
import { auctionTiming } from './auction';
import { countActiveFilters, distinctValues, EMPTY_FILTERS, sortVehicles } from './inventory';
import type { Vehicle } from './types';

const NOW = new Date('2026-08-15T12:00:00').getTime();

const base: Vehicle = {
  id: 'a',
  vin: 'VIN',
  year: 2023,
  make: 'Ford',
  model: 'Bronco',
  trim: 'Big Bend',
  body_style: 'SUV',
  exterior_color: 'Burgundy',
  interior_color: 'Beige',
  engine: '2.7L V6',
  transmission: 'automatic',
  drivetrain: '4WD',
  odometer_km: 47731,
  fuel_type: 'gasoline',
  condition_grade: 3.8,
  condition_report: '',
  damage_notes: [],
  title_status: 'clean',
  province: 'Ontario',
  city: 'Toronto',
  auction_start: '2026-04-05T14:00:00',
  starting_bid: 14500,
  reserve_price: null,
  buy_now_price: null,
  images: [],
  selling_dealership: 'Dealer',
  lot: 'A-1',
  current_bid: 22800,
  bid_count: 16,
};

const v = (overrides: Partial<Vehicle>): Vehicle => ({ ...base, ...overrides });

describe('sortVehicles', () => {
  it('sorts by price both ways using the competing price', () => {
    const vehicles = [v({ id: 'b', current_bid: 20000 }), v({ id: 'a', current_bid: null, starting_bid: 5000 })];
    expect(sortVehicles(vehicles, 'price-asc', NOW).map((x) => x.id)).toEqual(['a', 'b']);
    expect(sortVehicles(vehicles, 'price-desc', NOW).map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('puts live auctions first (soonest ending), then upcoming, then ended', () => {
    const vehicles = Array.from({ length: 30 }, (_, i) => v({ id: `probe-${i}` }));
    const sorted = sortVehicles(vehicles, 'ending-soonest', NOW);
    const statuses = sorted.map((x) => auctionTiming(x, NOW).status);
    const firstUpcoming = statuses.indexOf('upcoming');
    const firstEnded = statuses.indexOf('ended');
    expect(statuses[0]).toBe('live');
    expect(firstUpcoming).toBeGreaterThan(statuses.lastIndexOf('live'));
    expect(firstEnded).toBeGreaterThan(statuses.lastIndexOf('upcoming'));
    // Within the live group, end times ascend.
    const liveEnds = sorted
      .filter((x) => auctionTiming(x, NOW).status === 'live')
      .map((x) => auctionTiming(x, NOW).endsAt);
    expect([...liveEnds].sort((a, b) => a - b)).toEqual(liveEnds);
  });

  it('sorts by condition grade and bid count descending', () => {
    const vehicles = [v({ id: 'x', condition_grade: 2, bid_count: 3 }), v({ id: 'y', condition_grade: 4.5, bid_count: 9 })];
    expect(sortVehicles(vehicles, 'condition', NOW)[0].id).toBe('y');
    expect(sortVehicles(vehicles, 'most-bids', NOW)[0].id).toBe('y');
  });
});

describe('distinctValues', () => {
  it('returns sorted unique values for dropdowns', () => {
    const vehicles = [v({ make: 'Toyota' }), v({ make: 'BMW' }), v({ make: 'Toyota' })];
    expect(distinctValues(vehicles, 'make')).toEqual(['BMW', 'Toyota']);
  });
});

describe('countActiveFilters', () => {
  it('counts populated filters, treating the price pair as one', () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters({ ...EMPTY_FILTERS, make: 'Ford', priceMin: 1000, priceMax: 2000 })
    ).toBe(2);
  });
});
