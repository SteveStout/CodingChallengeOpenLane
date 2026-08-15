import { describe, expect, it } from 'vitest';
import {
  auctionStatus,
  auctionWindow,
  bidIncrement,
  canBuyNow,
  minNextBid,
  reserveState,
  resolveBid,
  resolveBuyNow,
  validateBid,
  type AuctionStatus,
} from './auction';
import type { Vehicle } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fixed reference time so every assertion is deterministic. */
const NOW = new Date('2026-08-15T12:00:00').getTime();

const baseVehicle: Vehicle = {
  id: '3cc3b89e-68b0-479e-af39-bca6251ea0b4',
  vin: 'TRD7L1KS0HNB5X3K3',
  year: 2023,
  make: 'Ford',
  model: 'Bronco',
  trim: 'Big Bend',
  body_style: 'SUV',
  exterior_color: 'Burgundy',
  interior_color: 'Beige',
  engine: '2.7L EcoBoost V6',
  transmission: 'automatic',
  drivetrain: '4WD',
  odometer_km: 47731,
  fuel_type: 'gasoline',
  condition_grade: 3.8,
  condition_report: 'Average condition.',
  damage_notes: ['Scratch on liftgate'],
  title_status: 'clean',
  province: 'Ontario',
  city: 'Toronto',
  auction_start: '2026-04-05T14:00:00',
  starting_bid: 14500,
  reserve_price: 25000,
  buy_now_price: null,
  images: ['https://placehold.co/800x600'],
  selling_dealership: 'King City Auto',
  lot: 'A-0043',
  current_bid: 22800,
  bid_count: 16,
};

function makeVehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return { ...baseVehicle, ...overrides };
}

/**
 * Windows are derived from ids, so tests can't pick timing directly.
 * Instead, probe deterministic ids until one lands in the wanted status
 * at NOW — stable across runs because the hash is stable.
 */
function idWithStatus(status: AuctionStatus): string {
  for (let i = 0; i < 1000; i++) {
    const id = `probe-${i}`;
    if (auctionStatus(auctionWindow(id, NOW), NOW) === status) return id;
  }
  throw new Error(`No probe id found with status "${status}"`);
}

describe('reserveState', () => {
  it('is "no-reserve" when reserve_price is null', () => {
    expect(reserveState(makeVehicle({ reserve_price: null }))).toBe('no-reserve');
  });

  it('is "met" when the high bid reaches the reserve', () => {
    expect(reserveState(makeVehicle({ current_bid: 25000, reserve_price: 25000 }))).toBe('met');
    expect(reserveState(makeVehicle({ current_bid: 26000, reserve_price: 25000 }))).toBe('met');
  });

  it('is "not-met" while the high bid is below the reserve', () => {
    expect(reserveState(makeVehicle({ current_bid: 22800, reserve_price: 25000 }))).toBe('not-met');
  });

  it('is "not-met" when there are no bids yet', () => {
    expect(reserveState(makeVehicle({ current_bid: null, bid_count: 0, reserve_price: 25000 }))).toBe('not-met');
  });
});

describe('auction scheduling', () => {
  it('derives a stable window for the same id on the same day', () => {
    const morning = new Date('2026-08-15T00:30:00').getTime();
    const evening = new Date('2026-08-15T23:30:00').getTime();
    expect(auctionWindow('some-id', morning)).toEqual(auctionWindow('some-id', evening));
  });

  it('spreads end times across roughly two days before to five days after now', () => {
    const midnight = new Date('2026-08-15T00:00:00').getTime();
    for (let i = 0; i < 200; i++) {
      const { startsAt, endsAt } = auctionWindow(`probe-${i}`, NOW);
      expect(endsAt).toBeGreaterThanOrEqual(midnight - 2 * DAY_MS);
      expect(endsAt).toBeLessThan(midnight + 5 * DAY_MS);
      const duration = endsAt - startsAt;
      expect(duration).toBeGreaterThanOrEqual(2 * DAY_MS);
      expect(duration).toBeLessThanOrEqual(4 * DAY_MS);
    }
  });

  it('produces a mix of upcoming, live, and ended auctions', () => {
    const statuses = new Set<AuctionStatus>();
    for (let i = 0; i < 200; i++) {
      statuses.add(auctionStatus(auctionWindow(`probe-${i}`, NOW), NOW));
    }
    expect(statuses).toEqual(new Set(['upcoming', 'live', 'ended']));
  });

  it('reports upcoming before the window, live inside it, ended after it', () => {
    const window = auctionWindow('some-id', NOW);
    expect(auctionStatus(window, window.startsAt - 1)).toBe('upcoming');
    expect(auctionStatus(window, window.startsAt)).toBe('live');
    expect(auctionStatus(window, (window.startsAt + window.endsAt) / 2)).toBe('live');
    expect(auctionStatus(window, window.endsAt)).toBe('ended');
    expect(auctionStatus(window, window.endsAt + DAY_MS)).toBe('ended');
  });
});

describe('bid increments', () => {
  it('uses $100 under $5,000', () => {
    expect(bidIncrement(3500)).toBe(100);
    expect(bidIncrement(4999)).toBe(100);
  });

  it('uses $250 from $5,000 to $19,999', () => {
    expect(bidIncrement(5000)).toBe(250);
    expect(bidIncrement(19999)).toBe(250);
  });

  it('uses $500 from $20,000 up', () => {
    expect(bidIncrement(20000)).toBe(500);
    expect(bidIncrement(77000)).toBe(500);
  });

  it('minNextBid adds the tier increment to the high bid', () => {
    expect(minNextBid(makeVehicle({ current_bid: 4000 }))).toBe(4100);
    expect(minNextBid(makeVehicle({ current_bid: 12000 }))).toBe(12250);
    expect(minNextBid(makeVehicle({ current_bid: 30000 }))).toBe(30500);
  });

  it('minNextBid is the opening ask when there are no bids yet', () => {
    expect(minNextBid(makeVehicle({ current_bid: null, bid_count: 0, starting_bid: 14500 }))).toBe(14500);
  });
});

describe('validateBid', () => {
  const liveVehicle = makeVehicle({ id: idWithStatus('live') });

  it('accepts a bid at the minimum on a live auction', () => {
    expect(validateBid(liveVehicle, minNextBid(liveVehicle), NOW)).toEqual({ ok: true });
  });

  it('accepts a bid above the minimum on a live auction', () => {
    expect(validateBid(liveVehicle, minNextBid(liveVehicle) + 1000, NOW).ok).toBe(true);
  });

  it('rejects a bid below the minimum', () => {
    const result = validateBid(liveVehicle, minNextBid(liveVehicle) - 1, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/at least/i);
  });

  it('rejects any bid on an ended auction', () => {
    const ended = makeVehicle({ id: idWithStatus('ended') });
    const result = validateBid(ended, 1_000_000, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ended/i);
  });

  it('rejects any bid on an upcoming auction', () => {
    const upcoming = makeVehicle({ id: idWithStatus('upcoming') });
    const result = validateBid(upcoming, 1_000_000, NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/not started/i);
  });

  it('rejects a non-numeric amount', () => {
    expect(validateBid(liveVehicle, Number.NaN, NOW).ok).toBe(false);
  });
});

describe('buy now', () => {
  const liveId = idWithStatus('live');
  const endedId = idWithStatus('ended');

  it('a bid at or above buy_now_price wins outright at the buy-now price', () => {
    const vehicle = makeVehicle({ id: liveId, current_bid: 22800, buy_now_price: 28000 });
    expect(resolveBid(vehicle, 28000, NOW)).toEqual({ kind: 'won', amount: 28000 });
    expect(resolveBid(vehicle, 30000, NOW)).toEqual({ kind: 'won', amount: 28000 });
  });

  it('a bid at buy_now_price wins even when it is below the minimum next bid', () => {
    // current_bid 27,900 → minNextBid 28,400, above the 28,000 buy-now price.
    const vehicle = makeVehicle({ id: liveId, current_bid: 27900, buy_now_price: 28000 });
    expect(resolveBid(vehicle, 28000, NOW)).toEqual({ kind: 'won', amount: 28000 });
  });

  it('a non-finite amount cannot trigger a buy-now win', () => {
    const vehicle = makeVehicle({ id: liveId, current_bid: 22800, buy_now_price: 28000 });
    expect(resolveBid(vehicle, Number.POSITIVE_INFINITY, NOW).kind).toBe('rejected');
    expect(resolveBid(vehicle, Number.NaN, NOW).kind).toBe('rejected');
  });

  it('a bid below buy_now_price is an ordinary accepted bid', () => {
    const vehicle = makeVehicle({ id: liveId, current_bid: 22800, buy_now_price: 28000 });
    expect(resolveBid(vehicle, 23300, NOW)).toEqual({ kind: 'accepted', amount: 23300 });
  });

  it('an invalid bid is rejected with the validation reason', () => {
    const vehicle = makeVehicle({ id: liveId, current_bid: 22800, buy_now_price: 28000 });
    expect(resolveBid(vehicle, 22900, NOW).kind).toBe('rejected');
  });

  it('the Buy Now action wins immediately on a live auction', () => {
    const vehicle = makeVehicle({ id: liveId, buy_now_price: 28000 });
    expect(canBuyNow(vehicle, NOW)).toBe(true);
    expect(resolveBuyNow(vehicle, NOW)).toEqual({ kind: 'won', amount: 28000 });
  });

  it('Buy Now is unavailable once the auction has ended', () => {
    const vehicle = makeVehicle({ id: endedId, buy_now_price: 28000 });
    expect(canBuyNow(vehicle, NOW)).toBe(false);
    expect(resolveBuyNow(vehicle, NOW).kind).toBe('rejected');
    expect(resolveBid(vehicle, 30000, NOW).kind).toBe('rejected');
  });

  it('Buy Now is unavailable when no buy_now_price exists', () => {
    const vehicle = makeVehicle({ id: liveId, buy_now_price: null });
    expect(canBuyNow(vehicle, NOW)).toBe(false);
    expect(resolveBuyNow(vehicle, NOW).kind).toBe('rejected');
  });
});
