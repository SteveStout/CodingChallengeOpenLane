import type { Vehicle } from './types';
import { fnv1a } from './hash';
import manifest from './photo-manifest.json';

/**
 * Maps vehicles to the vendored stock-photo pools in public/vehicles/
 * (10 photos per body style, fetched by scripts/fetch_photos.mjs). Photos
 * whose source title mentions the vehicle's make are preferred, so a Ford
 * listing leads with Ford photos; the rest of the gallery fills from the
 * same body-style pool. Picks are seeded by hashing the vehicle id, so a
 * gallery is stable across reloads. Photos are representative, not the
 * actual lot — a prototype tradeoff documented in the README. Credits live
 * in public/vehicles/CREDITS.md.
 */
interface PhotoEntry {
  file: string;
  style: string;
  title: string;
}

const GALLERY_SIZE = 4;

const POOLS = new Map<string, PhotoEntry[]>();
for (const entry of manifest as PhotoEntry[]) {
  const pool = POOLS.get(entry.style) ?? [];
  pool.push(entry);
  POOLS.set(entry.style, pool);
}

function rotate<T>(items: T[], by: number): T[] {
  if (items.length === 0) return items;
  const offset = by % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export function vehiclePhotos(vehicle: Vehicle): string[] {
  const pool = POOLS.get(vehicle.body_style.toLowerCase());
  // Unknown body style: fall back to whatever URLs the dataset carries.
  if (!pool || pool.length === 0) return vehicle.images;

  const make = vehicle.make.toLowerCase();
  const sameMake = pool.filter((photo) => photo.title.toLowerCase().includes(make));
  const others = pool.filter((photo) => !sameMake.includes(photo));
  const hash = fnv1a(vehicle.id);
  const ordered = [...rotate(sameMake, hash), ...rotate(others, Math.floor(hash / 7))];
  return ordered.slice(0, GALLERY_SIZE).map((photo) => `/vehicles/${photo.file}`);
}
