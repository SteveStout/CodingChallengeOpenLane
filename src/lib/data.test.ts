import { describe, expect, it } from 'vitest';
import { vehicleQueryParams } from './data';
import { EMPTY_FILTERS } from './inventory';

describe('vehicleQueryParams', () => {
  it('produces no parameters for empty filters', () => {
    expect(vehicleQueryParams(EMPTY_FILTERS).size).toBe(0);
  });

  it('maps every populated filter to its API parameter name', () => {
    const params = vehicleQueryParams({
      query: ' bronco ',
      make: 'Ford',
      bodyStyle: 'SUV',
      titleStatus: 'clean',
      province: 'Ontario',
      status: 'live',
      minCondition: 3.5,
      priceMin: 10000,
      priceMax: 30000,
    });

    expect(params.get('q')).toBe('bronco');
    expect(params.get('make')).toBe('Ford');
    expect(params.get('body_style')).toBe('SUV');
    expect(params.get('title_status')).toBe('clean');
    expect(params.get('province')).toBe('Ontario');
    expect(params.get('status')).toBe('live');
    expect(params.get('min_condition')).toBe('3.5');
    expect(params.get('price_min')).toBe('10000');
    expect(params.get('price_max')).toBe('30000');
  });

  it('sends the local-midnight anchor only alongside a status filter', () => {
    expect(vehicleQueryParams(EMPTY_FILTERS).has('anchor_ms')).toBe(false);
    const params = vehicleQueryParams({ ...EMPTY_FILTERS, status: 'live' });
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    expect(params.get('anchor_ms')).toBe(String(midnight.getTime()));
  });

  it('omits a whitespace-only search query', () => {
    expect(vehicleQueryParams({ ...EMPTY_FILTERS, query: '   ' }).size).toBe(0);
  });
});
