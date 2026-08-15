import { useEffect, useMemo, useRef, useState } from 'react';
import { getVehicles } from './lib/data';
import {
  distinctValues,
  EMPTY_FILTERS,
  filterVehicles,
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

const baseVehicles = getVehicles();

// Dropdown options come from the dataset itself, never a hardcoded list.
const FACETS = {
  makes: distinctValues(baseVehicles, 'make'),
  bodyStyles: distinctValues(baseVehicles, 'body_style'),
  titleStatuses: distinctValues(baseVehicles, 'title_status'),
  provinces: distinctValues(baseVehicles, 'province'),
};

export default function App() {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('ending-soonest');
  const now = useNow();
  const { vehicles, bids, placeBid, buyNow, resetBids } = useBids(baseVehicles);

  const visibleVehicles = useMemo(
    () => sortVehicles(filterVehicles(vehicles, filters, now), sort, now),
    [vehicles, filters, sort, now]
  );

  const highBidderIds = useMemo(() => new Set(Object.keys(bids)), [bids]);
  const wonIds = useMemo(
    () => new Set(Object.entries(bids).filter(([, b]) => b.wonBuyNow).map(([id]) => id)),
    [bids]
  );

  const selected = vehicles.find((v) => v.id === selectedVehicleId);

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
        {selected ? (
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
              makes={FACETS.makes}
              bodyStyles={FACETS.bodyStyles}
              titleStatuses={FACETS.titleStatuses}
              provinces={FACETS.provinces}
              resultCount={visibleVehicles.length}
            />
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
