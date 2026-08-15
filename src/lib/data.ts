import vehiclesJson from '../../data/vehicles.json';
import type { Vehicle } from './types';

/**
 * The single seam for inventory data. Everything downstream consumes
 * Vehicle[] from here, so swapping the bundled JSON for a real API call
 * later touches exactly this file.
 */
const vehicles: Vehicle[] = vehiclesJson;

export function getVehicles(): Vehicle[] {
  return vehicles;
}
