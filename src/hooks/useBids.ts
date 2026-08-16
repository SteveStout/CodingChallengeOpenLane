import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Vehicle } from '../lib/types';
import { resolveBid, resolveBuyNow, type BidOutcome } from '../lib/auction';

/** The buyer's standing on one vehicle, persisted across refreshes. */
export interface BidRecord {
  /** The buyer's high bid (or the buy-now price if they bought outright). */
  amount: number;
  /** The vehicle's updated total bid count. */
  bidCount: number;
  /** True when the buyer ended the auction via buy-now. */
  wonBuyNow: boolean;
}

export type BidMap = Record<string, BidRecord>;

const STORAGE_KEY = 'the-block/bids/v1';

function isBidRecord(value: unknown): value is BidRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.amount === 'number' &&
    Number.isFinite(record.amount) &&
    typeof record.bidCount === 'number' &&
    typeof record.wonBuyNow === 'boolean'
  );
}

/** Reads persisted bids, discarding anything malformed rather than crashing. */
function loadStoredBids(): BidMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const bids: BidMap = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (isBidRecord(value)) bids[id] = value;
    }
    return bids;
  } catch {
    return {};
  }
}

/** A vehicle with the buyer's own bid layered over the server's figures. */
export function applyBidRecord(vehicle: Vehicle, record: BidRecord | undefined): Vehicle {
  return record
    ? { ...vehicle, current_bid: record.amount, bid_count: record.bidCount }
    : vehicle;
}

/**
 * The buyer's bids, merged over the base dataset and persisted to
 * localStorage keyed by vehicle id so they survive a refresh.
 */
export function useBids(baseVehicles: Vehicle[]) {
  const [bids, setBids] = useState<BidMap>(loadStoredBids);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bids));
    } catch {
      // Storage unavailable (private mode, quota) — bids just won't persist.
    }
  }, [bids]);

  const vehicles = useMemo(
    () => baseVehicles.map((vehicle) => applyBidRecord(vehicle, bids[vehicle.id])),
    [baseVehicles, bids]
  );

  /** Expects the merged vehicle so validation sees the buyer's own bids. */
  const placeBid = useCallback((vehicle: Vehicle, amount: number): BidOutcome => {
    const outcome = resolveBid(vehicle, amount, Date.now());
    if (outcome.kind !== 'rejected') {
      setBids((prev) => ({
        ...prev,
        [vehicle.id]: {
          amount: outcome.amount,
          bidCount: vehicle.bid_count + 1,
          wonBuyNow: outcome.kind === 'won',
        },
      }));
    }
    return outcome;
  }, []);

  /** Buy Now is a purchase, not a bid — the bid count stays as-is. */
  const buyNow = useCallback((vehicle: Vehicle): BidOutcome => {
    const outcome = resolveBuyNow(vehicle, Date.now());
    if (outcome.kind === 'won') {
      setBids((prev) => ({
        ...prev,
        [vehicle.id]: { amount: outcome.amount, bidCount: vehicle.bid_count, wonBuyNow: true },
      }));
    }
    return outcome;
  }, []);

  const resetBids = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clean up if storage is unavailable.
    }
    setBids({});
  }, []);

  return { vehicles, bids, placeBid, buyNow, resetBids };
}
