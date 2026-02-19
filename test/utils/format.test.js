import { describe, expect, it } from 'vitest';
import { formatPrice } from '../../js/utils/format.js';

describe('formatPrice', () => {
  it('returns the same fallback for invalid or non-positive values', () => {
    const fallback = formatPrice(0);

    expect(formatPrice(null)).toBe(fallback);
    expect(formatPrice(undefined)).toBe(fallback);
    expect(formatPrice(NaN)).toBe(fallback);
    expect(formatPrice(-1)).toBe(fallback);
  });

  it('formats positive values as currency and not as fallback', () => {
    const fallback = formatPrice(0);
    const result = formatPrice(1500000);

    expect(result).not.toBe(fallback);
    expect(result).toMatch(/1,500,000/);
  });
});
