import type { Vehicle } from './types';
import { fnv1a } from './hash';
import { formatCurrency } from './format';

// ---------------------------------------------------------------------------
// Reserve state
// ---------------------------------------------------------------------------

export type ReserveState = 'no-reserve' | 'met' | 'not-met';

/** UI copy for each reserve state. The reserve amount itself is never shown. */
export const RESERVE_STATE_LABELS: Record<ReserveState, string> = {
  'no-reserve': 'No reserve',
  met: 'Reserve met',
  'not-met': 'Reserve not met',
};

/**
 * Rule: a null reserve_price means the vehicle sells at any price; otherwise
 * the reserve is met once the high bid reaches it. With no bids yet
 * (current_bid === null) a reserve cannot be met.
 */
export function reserveState(vehicle: Vehicle): ReserveState {
  if (vehicle.reserve_price === null) return 'no-reserve';
  if (vehicle.current_bid !== null && vehicle.current_bid >= vehicle.reserve_price) return 'met';
  return 'not-met';
}

// ---------------------------------------------------------------------------
// Auction scheduling
//
// auction_start in the dataset is synthetic, so each vehicle's window is
// derived from its id instead: the id hashes to an end time spread across
// the two days before through five days after "now", with a 2–4 day run-up.
// Anchoring to local midnight keeps a window stable across reloads (the
// schedule re-seeds at midnight) while guaranteeing the inventory always
// shows a mix of ended, live, and upcoming auctions.
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Auction end times land within [midnight - LOOKBACK, midnight - LOOKBACK + SPAN). */
const SCHEDULE_LOOKBACK_MS = 2 * DAY_MS;
const SCHEDULE_SPAN_MS = 7 * DAY_MS;
/** Each auction runs 2–4 days from open to close. */
const MIN_DURATION_MS = 2 * DAY_MS;
const EXTRA_DURATION_MS = 2 * DAY_MS;

export interface AuctionWindow {
  /** Epoch ms. */
  startsAt: number;
  endsAt: number;
}

export type AuctionStatus = 'upcoming' | 'live' | 'ended';

function startOfLocalDay(epochMs: number): number {
  const day = new Date(epochMs);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** Deterministic per id and calendar day; see the section comment above. */
export function auctionWindow(id: string, now: number): AuctionWindow {
  const anchor = startOfLocalDay(now);
  const hash = fnv1a(id);
  const endFraction = (hash % 100_000) / 100_000;
  const durationFraction = (Math.floor(hash / 100_000) % 1_000) / 1_000;
  const endsAt = Math.round(anchor - SCHEDULE_LOOKBACK_MS + endFraction * SCHEDULE_SPAN_MS);
  const durationMs = Math.round(MIN_DURATION_MS + durationFraction * EXTRA_DURATION_MS);
  return { startsAt: endsAt - durationMs, endsAt };
}

/** Rule: live from startsAt (inclusive) until endsAt (exclusive). */
export function auctionStatus(window: AuctionWindow, now: number): AuctionStatus {
  if (now < window.startsAt) return 'upcoming';
  if (now < window.endsAt) return 'live';
  return 'ended';
}

export interface AuctionTiming extends AuctionWindow {
  status: AuctionStatus;
}

/** Convenience: a vehicle's window and status in one call. */
export function auctionTiming(vehicle: Vehicle, now: number): AuctionTiming {
  const window = auctionWindow(vehicle.id, now);
  return { ...window, status: auctionStatus(window, now) };
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

/** The price a buyer competes against: the high bid, or the opening ask before any bids. */
export function currentPrice(vehicle: Vehicle): number {
  return vehicle.current_bid ?? vehicle.starting_bid;
}

/** Rule: tiered increments — under $5k +$100, $5k–$19,999 +$250, $20k and up +$500. */
export function bidIncrement(currentBid: number): number {
  if (currentBid < 5_000) return 100;
  if (currentBid < 20_000) return 250;
  return 500;
}

/**
 * Rule: the minimum next bid is the high bid plus its tier's increment.
 * Before any bids exist the opening ask itself is the minimum first bid.
 */
export function minNextBid(vehicle: Vehicle): number {
  if (vehicle.current_bid === null) return vehicle.starting_bid;
  return vehicle.current_bid + bidIncrement(vehicle.current_bid);
}

export type BidValidation = { ok: true } | { ok: false; reason: string };

/**
 * Rule: a bid is valid only while the auction is live and the amount is at
 * least the minimum next bid. Rejections carry a buyer-facing reason.
 */
export function validateBid(vehicle: Vehicle, amount: number, now: number): BidValidation {
  const status = auctionStatus(auctionWindow(vehicle.id, now), now);
  if (status === 'upcoming') return { ok: false, reason: 'This auction has not started yet.' };
  if (status === 'ended') return { ok: false, reason: 'This auction has ended.' };
  if (!Number.isFinite(amount)) return { ok: false, reason: 'Enter a valid bid amount.' };
  const min = minNextBid(vehicle);
  if (amount < min) return { ok: false, reason: `Bid must be at least ${formatCurrency(min)}.` };
  return { ok: true };
}

export type BidOutcome =
  | { kind: 'rejected'; reason: string }
  /** A regular high bid — the auction continues at this amount. */
  | { kind: 'accepted'; amount: number }
  /** The buyer wins outright at `amount` and the auction ends. */
  | { kind: 'won'; amount: number };

/** Buy Now exists for this vehicle and its auction is currently live. */
export function canBuyNow(vehicle: Vehicle, now: number): boolean {
  return (
    vehicle.buy_now_price !== null &&
    auctionStatus(auctionWindow(vehicle.id, now), now) === 'live'
  );
}

/**
 * Rule: on a live auction, a bid at or above buy_now_price wins outright —
 * charged the buy-now price, not the overbid. Anything else is an ordinary
 * bid subject to validateBid.
 */
export function resolveBid(vehicle: Vehicle, amount: number, now: number): BidOutcome {
  if (
    Number.isFinite(amount) &&
    canBuyNow(vehicle, now) &&
    vehicle.buy_now_price !== null &&
    amount >= vehicle.buy_now_price
  ) {
    return { kind: 'won', amount: vehicle.buy_now_price };
  }
  const validation = validateBid(vehicle, amount, now);
  if (!validation.ok) return { kind: 'rejected', reason: validation.reason };
  return { kind: 'accepted', amount };
}

/** Rule: the Buy Now action wins immediately at buy_now_price while live. */
export function resolveBuyNow(vehicle: Vehicle, now: number): BidOutcome {
  if (vehicle.buy_now_price === null) {
    return { kind: 'rejected', reason: 'This vehicle has no Buy Now price.' };
  }
  if (auctionStatus(auctionWindow(vehicle.id, now), now) !== 'live') {
    return { kind: 'rejected', reason: 'Buy Now is only available while the auction is live.' };
  }
  return { kind: 'won', amount: vehicle.buy_now_price };
}
