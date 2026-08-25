/**
 * @fileoverview Tests for the ref_timezone_lookup tool.
 * @module tests/tools/ref-timezone-lookup.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refTimezoneLookup } from '@/mcp-server/tools/definitions/ref-timezone-lookup.tool.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';
import { expectText } from '../test-helpers.js';

beforeAll(() => {
  initTimezoneService();
});

describe('refTimezoneLookup', () => {
  it('looks up America/New_York by exact IANA ID', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: 'America/New_York', by: 'iana' });
    const result = await refTimezoneLookup.handler(input, ctx);
    expect(result.timezones).toHaveLength(1);
    expect(result.timezones[0]!.iana_id).toBe('America/New_York');
    expect(result.timezones[0]!.standard_offset_hours).toBe(-5);
    expect(result.evaluated_at).toBeTruthy();
  });

  it('looks up timezones for a country code', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: 'JP', by: 'country' });
    const result = await refTimezoneLookup.handler(input, ctx);
    expect(result.timezones.length).toBeGreaterThan(0);
    expect(result.timezones[0]!.iana_id).toBeTruthy();
  });

  it('auto mode resolves Tokyo by city name', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: 'Tokyo' });
    const result = await refTimezoneLookup.handler(input, ctx);
    expect(result.timezones.length).toBeGreaterThan(0);
    const tzId = result.timezones[0]!.iana_id;
    expect(tzId).toContain('Tokyo');
    expect(result.timezones[0]!.standard_offset_hours).toBe(9);
  });

  it('accepts at parameter for historical evaluation', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    // January is winter — EDT not active in New York
    const input = refTimezoneLookup.input.parse({
      query: 'America/New_York',
      by: 'iana',
      at: '2026-01-15T12:00:00',
    });
    const result = await refTimezoneLookup.handler(input, ctx);
    expect(result.timezones[0]!.dst_active).toBe(false);
    expect(result.timezones[0]!.current_offset_hours).toBe(-5);
  });

  it('accepts at parameter for summer DST evaluation', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    // July — EDT is active in New York (UTC-4)
    const input = refTimezoneLookup.input.parse({
      query: 'America/New_York',
      by: 'iana',
      at: '2026-07-15T12:00:00',
    });
    const result = await refTimezoneLookup.handler(input, ctx);
    expect(result.timezones[0]!.dst_active).toBe(true);
    expect(result.timezones[0]!.current_offset_hours).toBe(-4);
  });

  it('throws for unrecognized timezone', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: 'Galaxy/FakeCity_9999', by: 'iana' });
    expect(() => refTimezoneLookup.handler(input, ctx)).toThrow(/No timezone matched/);
  });

  it('resolves UTC as a valid timezone', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: 'UTC' });
    const result = await refTimezoneLookup.handler(input, ctx);
    expect(result.timezones.length).toBeGreaterThan(0);
    expect(result.timezones[0]!.iana_id).toBe('UTC');
  });

  it('resolves GMT as an alias for UTC', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: 'GMT' });
    const result = await refTimezoneLookup.handler(input, ctx);
    expect(result.timezones.length).toBeGreaterThan(0);
    expect(result.timezones[0]!.iana_id).toBe('UTC');
  });

  it('formats output with IANA ID, offsets, and DST status', () => {
    const output = {
      timezones: [
        {
          iana_id: 'America/New_York',
          current_offset_hours: -4,
          standard_offset_hours: -5,
          dst_active: true,
          dst_abbreviation: 'EDT',
          standard_abbreviation: 'EST',
          major_cities: ['New York', 'Boston'],
          countries: ['US'],
        },
      ],
      evaluated_at: '2026-07-15T12:00:00.000Z',
    };
    const blocks = refTimezoneLookup.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('America/New_York');
    expect(text).toContain('-4');
    expect(text).toContain('-5');
    expect(text).toContain('Yes');
    expect(text).toContain('EDT');
    expect(text).toContain('New York');
    expect(text).toContain('2026-07-15');
  });

  it('formats multiple timezones for country lookup', () => {
    const output = {
      timezones: [
        {
          iana_id: 'America/New_York',
          current_offset_hours: -5,
          standard_offset_hours: -5,
          dst_active: false,
          dst_abbreviation: null,
          standard_abbreviation: 'EST',
          major_cities: ['New York'],
          countries: ['US'],
        },
        {
          iana_id: 'America/Chicago',
          current_offset_hours: -6,
          standard_offset_hours: -6,
          dst_active: false,
          dst_abbreviation: null,
          standard_abbreviation: 'CST',
          major_cities: ['Chicago'],
          countries: ['US'],
        },
      ],
      evaluated_at: '2026-01-15T12:00:00.000Z',
    };
    const blocks = refTimezoneLookup.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('America/New_York');
    expect(text).toContain('America/Chicago');
    expect(text).toContain('Chicago');
  });
});
