import { describe, expect, it } from 'vitest';
import { defaultGrouping, performanceLabel } from './analytics';

describe('analytics classification', () => {
  it('does not confuse inactive account state with low performance', () => {
    expect(performanceLabel(0)).toBe('No verified sales in selected period');
    expect(performanceLabel(2)).toBe('Verified sales activity');
  });

  it('uses period-appropriate default buckets', () => {
    expect(defaultGrouping('year')).toBe('month');
    expect(defaultGrouping('month')).toBe('week');
    expect(defaultGrouping('today')).toBe('day');
  });
});
