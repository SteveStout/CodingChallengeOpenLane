import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchFacets,
  fetchVehicles,
  peekVehicles,
  type InventoryFacets,
  type VehiclePage,
} from './lib/data';
import type { Vehicle } from './lib/types';
import {
  EMPTY_FILTERS,
  filtersFromSearchParams,
  filtersToSearchParams,
  type InventoryFilters,
  type SortKey,
} from './lib/inventory';
import { applyBidRecord, useBids } from './hooks/useBids';
import { useNow } from './hooks/useNow';
import { FilterBar } from './components/FilterBar';
import { InventoryGrid } from './components/InventoryGrid';
import { VehicleDetail } from './components/VehicleDetail';
import styles from './App.module.css';

type LoadState = 'loading' | 'ready' | 'error';

/** How long to let the user keep typing/clicking before asking the API to filter. */
const FILTER_DEBOUNCE_MS = 500;

/** A status-filtered list goes stale as auctions cross their boundaries; refresh this often. */
const STATUS_REFRESH_MS = 60_000;

const EMPTY_FACETS: InventoryFacets = { makes: [], body_styles: [], title_statuses: [], provinces: [] };
const EMPTY_PAGE: VehiclePage = { total: 0, vehicles: [] };

/** Filters arrive in the URL (?make=Ford&status=live) so views are shareable. */
const INITIAL_URL_STATE = filtersFromSearchParams(new URLSearchParams(window.location.search));

export default function App() {
  /** The server-filtered, server-sorted page currently on display. */
  const [page, setPage] = useState<VehiclePage>(EMPTY_PAGE);
  const [facets, setFacets] = useState<InventoryFacets>(EMPTY_FACETS);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  /** A filter request failed — the list shows the previous results. */
  const [staleResults, setStaleResults] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  /** Snapshot of the opened vehicle, so the detail view survives page refetches. */
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>(INITIAL_URL_STATE.filters);
  const [sort, setSort] = useState<SortKey>(INITIAL_URL_STATE.sort);
  const now = useNow();
  const { vehicles: visibleVehicles, bids, placeBid, buyNow, resetBids } = useBids(page.vehicles);

  // Dropdown options come from the API (the page only ever holds a slice of
  // the dataset). Missing facets degrade to empty dropdowns, not a crash.
  useEffect(() => {
    const controller = new AbortController();
    fetchFacets(controller.signal)
      .then(setFacets)
      .catch(() => {});
    return () => controller.abort();
  }, [reloadNonce]);

  // Filtering, sorting, and paging are server-side: every change becomes a
  // GET request, debounced so typing doesn't spam the API and cached per
  // query string in data.ts. Cache hits skip the debounce entirely — it only
  // exists to simulate not hammering the server. reloadNonce bumps are
  // refreshes (retry buttons, the status interval): immediate and uncached.
  const lastNonce = useRef(reloadNonce);
  useEffect(() => {
    const controller = new AbortController();
    const isRefresh = reloadNonce !== lastNonce.current;
    lastNonce.current = reloadNonce;
    const firstLoad = loadState !== 'ready';
    if (firstLoad) setLoadState('loading');

    if (!firstLoad && !isRefresh) {
      const cached = peekVehicles(filters, sort);
      if (cached) {
        setPage(cached);
        setStaleResults(false);
        return;
      }
    }

    const timer = window.setTimeout(
      () => {
        fetchVehicles(filters, { sort, signal: controller.signal, forceRefresh: isRefresh })
          .then((data) => {
            setPage(data);
            setStaleResults(false);
            if (firstLoad) setLoadState('ready');
          })
          .catch(() => {
            if (controller.signal.aborted) return;
            if (firstLoad) setLoadState('error');
            else setStaleResults(true);
          });
      },
      firstLoad || isRefresh ? 0 : FILTER_DEBOUNCE_MS
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, reloadNonce]);

  // Mirror the active filters into the address bar (the same GET parameters
  // the API receives) so any filtered view is shareable and bookmarkable.
  // replaceState, not pushState — typing shouldn't pile up history entries.
  useEffect(() => {
    const query = filtersToSearchParams(filters, sort).toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }, [filters, sort]);

  // While a status filter is active, membership drifts as auctions open and
  // close — re-ask the server periodically so the list stays honest.
  useEffect(() => {
    if (!filters.status) return;
    const id = window.setInterval(() => setReloadNonce((n) => n + 1), STATUS_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [filters.status]);

  const highBidderIds = useMemo(() => new Set(Object.keys(bids)), [bids]);
  const wonIds = useMemo(
    () => new Set(Object.entries(bids).filter(([, b]) => b.wonBuyNow).map(([id]) => id)),
    [bids]
  );

  /** The snapshot with the buyer's live bid state layered on. */
  const selected = useMemo(
    () => (selectedVehicle ? applyBidRecord(selectedVehicle, bids[selectedVehicle.id]) : undefined),
    [selectedVehicle, bids]
  );

  // Open the detail at the top; restore the list scroll position on back.
  const listScrollY = useRef(0);
  const openVehicle = (vehicle: Vehicle) => {
    listScrollY.current = window.scrollY;
    setSelectedVehicle(vehicle);
  };
  const backToInventory = () => setSelectedVehicle(null);

  useEffect(() => {
    window.scrollTo(0, selectedVehicle ? 0 : listScrollY.current);
  }, [selectedVehicle]);

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
              bodyStyles={facets.body_styles}
              titleStatuses={facets.title_statuses}
              provinces={facets.provinces}
              shownCount={visibleVehicles.length}
              totalCount={page.total}
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
