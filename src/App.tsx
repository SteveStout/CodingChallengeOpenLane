import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchVehicles } from './lib/data';
import type { Vehicle } from './lib/types';
import {
  distinctValues,
  EMPTY_FILTERS,
  sortVehicles,
  type InventoryFilters,
  type SortKey,
} from './lib/inventory';
import { useBids } from './hooks/useBids';
import { useNow } from './hooks/useNow';
import { FilterBar } from './components/FilterBar';
import { InventoryGrid } from './components/InventoryGrid';
import { VehicleDetail } from './components/VehicleDetail';
import styles from './App.module.css';

type LoadState = 'loading' | 'ready' | 'error';

/** How long to let the user keep typing before asking the API to filter. */
const FILTER_DEBOUNCE_MS = 250;

/** A status-filtered list goes stale as auctions cross their boundaries; refresh this often. */
const STATUS_REFRESH_MS = 60_000;

export default function App() {
  /** Full dataset from the first successful load — feeds dropdowns and detail lookups. */
  const [facetSource, setFacetSource] = useState<Vehicle[]>([]);
  /** The server-filtered result set currently on display. */
  const [serverVehicles, setServerVehicles] = useState<Vehicle[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  /** A filter request failed — the list shows the previous results. */
  const [staleResults, setStaleResults] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('ending-soonest');
  const now = useNow();
  const { vehicles: allVehicles, bids, placeBid, buyNow, resetBids } = useBids(facetSource);

  // Filtering is server-side: every filter change becomes a GET request,
  // debounced so typing doesn't spam the API. The first successful load also
  // primes the facet source. (facetSource is read, not depended on — each
  // rerun gets a fresh closure, and depending on it would loop.)
  useEffect(() => {
    const controller = new AbortController();
    const firstLoad = facetSource.length === 0;
    if (firstLoad) setLoadState('loading');
    const timer = window.setTimeout(
      () => {
        fetchVehicles(filters, controller.signal)
          .then((data) => {
            setServerVehicles(data);
            setStaleResults(false);
            if (firstLoad) {
              setFacetSource(data);
              setLoadState('ready');
            }
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            if (firstLoad) setLoadState('error');
            else setStaleResults(true);
          });
      },
      firstLoad ? 0 : FILTER_DEBOUNCE_MS
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, reloadNonce]);

  // While a status filter is active, membership drifts as auctions open and
  // close — re-ask the server periodically so the list stays honest.
  useEffect(() => {
    if (!filters.status) return;
    const id = window.setInterval(() => setReloadNonce((n) => n + 1), STATUS_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [filters.status]);

  // Dropdown options come from the dataset itself, never a hardcoded list.
  const facets = useMemo(
    () => ({
      makes: distinctValues(facetSource, 'make'),
      bodyStyles: distinctValues(facetSource, 'body_style'),
      titleStatuses: distinctValues(facetSource, 'title_status'),
      provinces: distinctValues(facetSource, 'province'),
    }),
    [facetSource]
  );

  /** Bid-merged vehicles by id — detail pages resolve here, so an open
   *  detail survives the list being refiltered underneath it. */
  const vehicleById = useMemo(
    () => new Map(allVehicles.map((vehicle) => [vehicle.id, vehicle])),
    [allVehicles]
  );

  const visibleVehicles = useMemo(() => {
    const merged = serverVehicles.map((vehicle) => vehicleById.get(vehicle.id) ?? vehicle);
    return sortVehicles(merged, sort, now);
  }, [serverVehicles, vehicleById, sort, now]);

  const highBidderIds = useMemo(() => new Set(Object.keys(bids)), [bids]);
  const wonIds = useMemo(
    () => new Set(Object.entries(bids).filter(([, b]) => b.wonBuyNow).map(([id]) => id)),
    [bids]
  );

  const selected = selectedVehicleId ? vehicleById.get(selectedVehicleId) : undefined;

  // Open the detail at the top; restore the list scroll position on back.
  const listScrollY = useRef(0);
  const openVehicle = (id: string) => {
    listScrollY.current = window.scrollY;
    setSelectedVehicleId(id);
  };
  const backToInventory = () => setSelectedVehicleId(null);

  useEffect(() => {
    window.scrollTo(0, selectedVehicleId ? 0 : listScrollY.current);
  }, [selectedVehicleId]);

  const patchFilters = (patch: Partial<InventoryFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch }));
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const bidCount = Object.keys(bids).length;

  const handleResetBids = () => {
    if (window.confirm(`Clear your ${bidCount === 1 ? 'bid' : `${bidCount} bids`}? This can't be undone.`)) {
      resetBids();
    }
  };

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button type="button" className={styles.brand} onClick={backToInventory}>
            <svg className={styles.brandMark} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M13 2 5 14h5l-2 8 8-12h-5l2-8z" fill="currentColor" />
            </svg>
            The Block
            <span className={styles.brandSub}>Vehicle Auctions</span>
          </button>
          {bidCount > 0 && (
            <button type="button" className={styles.resetBids} onClick={handleResetBids}>
              Reset bids ({bidCount})
            </button>
          )}
        </div>
      </header>

      <main className={styles.main}>
        {loadState === 'loading' ? (
          <p className={styles.notice} role="status">
            Loading inventory…
          </p>
        ) : loadState === 'error' ? (
          <div className={styles.notice} role="alert">
            <p className={styles.noticeTitle}>Couldn't reach the inventory API.</p>
            <p>
              Make sure it's running — <code>npm run api</code> in a second terminal — then try
              again.
            </p>
            <button
              type="button"
              className={styles.retry}
              onClick={() => setReloadNonce((n) => n + 1)}
            >
              Try again
            </button>
          </div>
        ) : selected ? (
          <VehicleDetail
            key={selected.id}
            vehicle={selected}
            now={now}
            onBack={backToInventory}
            isHighBidder={highBidderIds.has(selected.id)}
            wonBuyNow={wonIds.has(selected.id)}
            onPlaceBid={(amount) => placeBid(selected, amount)}
            onBuyNow={() => buyNow(selected)}
          />
        ) : (
          <section aria-label="Vehicle inventory">
            <div className={styles.listHeader}>
              <h1 className={styles.listTitle}>Inventory</h1>
            </div>
            <FilterBar
              filters={filters}
              onFiltersChange={patchFilters}
              sort={sort}
              onSortChange={setSort}
              onClear={clearFilters}
              makes={facets.makes}
              bodyStyles={facets.bodyStyles}
              titleStatuses={facets.titleStatuses}
              provinces={facets.provinces}
              resultCount={visibleVehicles.length}
            />
            {staleResults && (
              <div className={styles.staleBanner} role="alert">
                Couldn't update results from the API — showing the previous list.
                <button
                  type="button"
                  className={styles.staleRetry}
                  onClick={() => setReloadNonce((n) => n + 1)}
                >
                  Retry
                </button>
              </div>
            )}
            <InventoryGrid
              vehicles={visibleVehicles}
              now={now}
              onSelect={openVehicle}
              highBidderIds={highBidderIds}
              wonIds={wonIds}
              onClearFilters={clearFilters}
            />
          </section>
        )}
      </main>
    </div>
  );
}
