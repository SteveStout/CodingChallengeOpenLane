import { useState } from 'react';
import type { Vehicle } from '../lib/types';
import {
  auctionTiming,
  canBuyNow,
  currentPrice,
  minNextBid,
  reserveState,
  type BidOutcome,
} from '../lib/auction';
import { formatCountdown, formatCurrency } from '../lib/format';
import { AuctionCountdown } from './AuctionCountdown';
import { ReserveBadge } from './ReserveBadge';
import styles from './BidPanel.module.css';

interface BidPanelProps {
  /** The vehicle with the buyer's own bids already merged in. */
  vehicle: Vehicle;
  now: number;
  isHighBidder: boolean;
  wonBuyNow: boolean;
  onPlaceBid: (amount: number) => BidOutcome;
  onBuyNow: () => BidOutcome;
}

export function BidPanel({ vehicle, now, isHighBidder, wonBuyNow, onPlaceBid, onBuyNow }: BidPanelProps) {
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const timing = auctionTiming(vehicle, now);
  // A buy-now purchase ends the auction immediately, whatever the clock says.
  const status = wonBuyNow ? 'ended' : timing.status;
  const hasBids = vehicle.current_bid !== null;
  const min = minNextBid(vehicle);
  const reserve = reserveState(vehicle);
  const wonAtClose = status === 'ended' && isHighBidder && (reserve === 'met' || reserve === 'no-reserve');

  const submitBid = (event: React.FormEvent) => {
    event.preventDefault();
    const outcome = onPlaceBid(Number(amountInput));
    if (outcome.kind === 'rejected') {
      setError(outcome.reason);
    } else {
      // The panel re-renders into its high-bidder or "won" state.
      setError(null);
      setAmountInput('');
    }
  };

  const handleBuyNow = () => {
    const outcome = onBuyNow();
    setError(outcome.kind === 'rejected' ? outcome.reason : null);
  };

  return (
    <section className={styles.panel} aria-label="Auction">
      <div className={styles.statusRow}>
        {wonBuyNow ? (
          <span className={styles.soldChip}>Sold</span>
        ) : (
          <AuctionCountdown timing={timing} now={now} />
        )}
        <span className={styles.bidCount}>
          {vehicle.bid_count} {vehicle.bid_count === 1 ? 'bid' : 'bids'}
        </span>
      </div>

      <div className={styles.priceBlock}>
        <span className={styles.priceLabel}>
          {wonBuyNow ? 'Purchase price' : hasBids ? 'Current bid' : 'Starting bid'}
        </span>
        <span className={styles.price}>{formatCurrency(currentPrice(vehicle))}</span>
        <ReserveBadge state={reserve} />
      </div>

      {wonBuyNow && (
        <p className={styles.wonBox}>
          You bought this vehicle for {formatCurrency(currentPrice(vehicle))}.
        </p>
      )}

      {status === 'ended' && !wonBuyNow && (
        <p className={wonAtClose ? styles.wonBox : styles.endedBox}>
          {wonAtClose
            ? `You won this auction at ${formatCurrency(currentPrice(vehicle))}.`
            : isHighBidder
              ? 'The auction ended below reserve — the vehicle was not sold.'
              : 'This auction has ended.'}
        </p>
      )}

      {status === 'upcoming' && (
        <p className={styles.upcomingBox}>
          Bidding opens in {formatCountdown(timing.startsAt, now)}.
        </p>
      )}

      {status === 'live' && (
        <>
          {isHighBidder && (
            <p className={styles.highBidder} role="status">
              You're the high bidder at {formatCurrency(currentPrice(vehicle))}
            </p>
          )}

          <form className={styles.form} onSubmit={submitBid}>
            <label className={styles.inputLabel} htmlFor="bid-amount">
              Your bid <span className={styles.minHint}>(minimum {formatCurrency(min)})</span>
            </label>
            <div className={styles.inputRow}>
              <div className={styles.amountWrap}>
                <span className={styles.currencySign} aria-hidden="true">
                  $
                </span>
                <input
                  id="bid-amount"
                  className={styles.amountInput}
                  type="number"
                  inputMode="numeric"
                  placeholder={String(min)}
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setError(null);
                  }}
                />
              </div>
              <button type="submit" className={styles.bidButton}>
                Place bid
              </button>
            </div>
          </form>

          {error && (
            <p className={styles.error} role="status">
              {error}
            </p>
          )}

          {canBuyNow(vehicle, now) && vehicle.buy_now_price !== null && (
            <div className={styles.buyNow}>
              <span className={styles.buyNowDivider}>or</span>
              <button type="button" className={styles.buyNowButton} onClick={handleBuyNow}>
                Buy now for {formatCurrency(vehicle.buy_now_price)}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
