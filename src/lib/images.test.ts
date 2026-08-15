import { describe, expect, it } from 'vitest';
import { vehiclePhotos } from './images';
import manifest from './photo-manifest.json';
import type { Vehicle } from './types';

const vehicle = (overrides: Partial<Vehicle>): Vehicle => ({
  id: 'test-id',
  vin: 'VIN',
  year: 2023,
  make: 'Ford',
  model: 'Bronco',
  trim: 'Big Bend',
  body_style: 'SUV',
  exterior_color: 'Burgundy',
  interior_color: 'Beige',
  engine: 'V6',
  transmission: 'automatic',
  drivetrain: '4WD',
  odometer_km: 1,
  fuel_type: 'gasoline',
  condition_grade: 3,
  condition_report: '',
  damage_notes: [],
  title_status: 'clean',
  province: 'Ontario',
  city: 'Toronto',
  auction_start: '2026-04-05T14:00:00',
  starting_bid: 1000,
  reserve_price: null,
  buy_now_price: null,
  images: ['https://placehold.co/800x600'],
  selling_dealership: 'Dealer',
  lot: 'A-1',
  current_bid: null,
  bid_count: 0,
  ...overrides,
});

describe('vehiclePhotos', () => {
  it('returns four distinct photos from the vehicle body-style pool', () => {
    const photos = vehiclePhotos(vehicle({ body_style: 'SUV' }));
    expect(photos).toHaveLength(4);
    expect(new Set(photos).size).toBe(4);
    for (const photo of photos) {
      expect(photo).toMatch(/^\/vehicles\/suv-(0[1-9]|10)\.jpg$/);
    }
  });

  it('leads with same-make photos when the pool has them', () => {
    const fordSuv = vehiclePhotos(vehicle({ make: 'Ford', body_style: 'SUV' }))[0];
    const matching = (manifest as Array<{ file: string; title: string }>).filter(
      (entry) => entry.title.toLowerCase().includes('ford')
    );
    expect(matching.map((entry) => `/vehicles/${entry.file}`)).toContain(fordSuv);
  });

  it('is deterministic per id and varies across ids', () => {
    const a = vehiclePhotos(vehicle({ id: 'aaa' }));
    expect(vehiclePhotos(vehicle({ id: 'aaa' }))).toEqual(a);
    const pools = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => vehiclePhotos(vehicle({ id }))[0])
    );
    expect(pools.size).toBeGreaterThan(1);
  });

  it('falls back to the dataset URLs for an unknown body style', () => {
    const v = vehicle({ body_style: 'van' });
    expect(vehiclePhotos(v)).toEqual(v.images);
  });
});
