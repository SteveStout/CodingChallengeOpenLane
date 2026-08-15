import vehiclesJson from '../../data/vehicles.json';
import type { Vehicle } from './types';
import { vehiclePhotos } from './images';

/**
 * The single seam for inventory data. Everything downstream consumes
 * Vehicle[] from here, so swapping the bundled JSON for a real API call
 * later touches exactly this file.
 *
 * The dataset's placeholder image URLs are replaced here with vendored
 * stock photos (see src/lib/images.ts) — the JSON itself stays untouched.
 */
const vehicles: Vehicle[] = vehiclesJson.map((vehicle) => ({
  ...vehicle,
  images: vehiclePhotos(vehicle),
}));

export function getVehicles(): Vehicle[] {
  return vehicles;
}
