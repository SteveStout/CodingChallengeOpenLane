import { getVehicles } from './lib/data';

// Placeholder shell — Phase 2 replaces this with the inventory view.
export default function App() {
  const vehicles = getVehicles();
  return <main>Loaded {vehicles.length} vehicles.</main>;
}
