/**
 * @fileoverview Tests for the ref_timezone_convert tool.
 * @module tests/tools/ref-timezone-convert.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refTimezoneConvert } from '@/mcp-server/tools/definitions/ref-timezone-convert.tool.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';
import { expectText } from '../test-helpers.js';

beforeAll(() => {
  initTimezoneService();
});

describe('refTimezoneConvert', () => {
  it('converts Tokyo time to New York time', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-05-24T15:30:00',
      from_tz: 'Asia/Tokyo',
      to_tz: 'America/New_York',
    });
    const result = await refTimezoneConvert.handler(input, ctx);
    expect(result.source.tz).toBe('Asia/Tokyo');
    expect(result.target.tz).toBe('America/New_York');
    expect(result.source.datetime).toBe('2026-05-24T15:30:00');
    expect(result.target.datetime).toBeTruthy();
    expect(result.utc_equivalent).toMatch(/Z$/);
    // Tokyo is UTC+9, New York in May is UTC-4: 15:30 Tokyo = 02:30 NY (same day or next)
    expect(result.source.offset).toContain('+09:00');
    expect(result.target.offset).toContain('-04:00'); // EDT in May
  });

  it('converts UTC to London', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-01-15T12:00:00',
      from_tz: 'UTC',
      to_tz: 'Europe/London',
    });
    const result = await refTimezoneConvert.handler(input, ctx);
    expect(result.source.tz).toBe('UTC');
    expect(result.target.tz).toBe('Europe/London');
    // January — London is UTC+0 (GMT, no DST)
    expect(result.target.datetime).toContain('12:00:00');
  });

  it('handles cross-midnight conversion', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    // 22:00 in Tokyo = early morning in New York
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-05-24T22:00:00',
      from_tz: 'Asia/Tokyo',
      to_tz: 'America/New_York',
    });
    const result = await refTimezoneConvert.handler(input, ctx);
    expect(result.source.datetime).toBe('2026-05-24T22:00:00');
    // 22:00 Tokyo = 09:00 New York previous day (UTC+9 to UTC-4 = -13h)
    expect(result.target.datetime).toBeTruthy();
    expect(result.utc_equivalent).toBeTruthy();
  });

  it('throws for unrecognized from_tz', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-05-24T15:00:00',
      from_tz: 'Galaxy/FakeZone_9999',
      to_tz: 'America/New_York',
    });
    expect(() => refTimezoneConvert.handler(input, ctx)).toThrow(/Unrecognized.*timezone/i);
  });

  it('throws for unrecognized to_tz', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-05-24T15:00:00',
      from_tz: 'Asia/Tokyo',
      to_tz: 'Galaxy/FakeZone_9999',
    });
    expect(() => refTimezoneConvert.handler(input, ctx)).toThrow(/Unrecognized.*timezone/i);
  });

  it('rejects a datetime with an offset suffix at the input schema', () => {
    // The regex on the datetime field advertises the format constraint in inputSchema and
    // rejects a "Z"/offset suffix at parse time, before the handler runs.
    expect(() =>
      refTimezoneConvert.input.parse({
        datetime: '2026-05-24T15:00:00Z', // Z suffix not allowed
        from_tz: 'Asia/Tokyo',
        to_tz: 'America/New_York',
      }),
    ).toThrow();
  });

  it('rejects out-of-range calendar components instead of silently rolling over (#32)', () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    // Each of these is format-valid (passes the regex) but calendar-invalid — previously
    // Date.UTC() normalized them to a different, silently-substituted date.
    for (const datetime of [
      '2026-02-30T12:00:00', // Feb 30 never exists
      '2026-02-29T12:00:00', // 2026 is not a leap year
      '2026-13-01T12:00:00', // month 13
      '2026-05-32T12:00:00', // day 32
      '2026-05-24T25:00:00', // hour 25
    ]) {
      const input = refTimezoneConvert.input.parse({
        datetime,
        from_tz: 'UTC',
        to_tz: 'Asia/Tokyo',
      });
      expect(() => refTimezoneConvert.handler(input, ctx)).toThrow(/out-of-range calendar/i);
    }
  });

  it('accepts a valid leap-year Feb 29 (control for the range check)', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    // 2028 is a leap year — Feb 29 is a real date and must still convert.
    const input = refTimezoneConvert.input.parse({
      datetime: '2028-02-29T12:00:00',
      from_tz: 'UTC',
      to_tz: 'UTC',
    });
    const result = await refTimezoneConvert.handler(input, ctx);
    expect(result.source.datetime).toBe('2028-02-29T12:00:00');
    expect(result.utc_equivalent).toBe('2028-02-29T12:00:00Z');
  });

  it('accepts the Dec 31 23:59:59 boundary (control for the range check)', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-12-31T23:59:59',
      from_tz: 'UTC',
      to_tz: 'UTC',
    });
    const result = await refTimezoneConvert.handler(input, ctx);
    expect(result.utc_equivalent).toBe('2026-12-31T23:59:59Z');
  });

  it('rejects a DST spring-forward gap datetime that never occurs (#37)', () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    // 2026-03-08 02:30 does not exist in America/New_York — clocks jump 02:00 → 03:00.
    // Previously this converted to a non-invertible result instead of being rejected.
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-03-08T02:30:00',
      from_tz: 'America/New_York',
      to_tz: 'UTC',
    });
    expect(() => refTimezoneConvert.handler(input, ctx)).toThrow(/spring-forward gap/i);
  });

  it('accepts a valid pre-transition time on the spring-forward date (control for #37)', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    // 01:30 exists (still EST, before the jump) and must convert normally.
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-03-08T01:30:00',
      from_tz: 'America/New_York',
      to_tz: 'UTC',
    });
    const result = await refTimezoneConvert.handler(input, ctx);
    expect(result.source.offset).toBe('-05:00'); // EST, before spring-forward
    expect(result.target.datetime).toContain('06:30:00');
  });

  it('correct DST offset for time after spring-forward', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    // 2026-03-08 is DST spring-forward in US Eastern: clocks jump from 02:00 to 03:00
    // 03:30 on that day should be EDT (UTC-4), not EST (UTC-5)
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-03-08T03:30:00',
      from_tz: 'America/New_York',
      to_tz: 'UTC',
    });
    const result = await refTimezoneConvert.handler(input, ctx);
    // EDT is UTC-4, so 03:30 EDT = 07:30 UTC
    expect(result.source.offset).toBe('-04:00');
    expect(result.target.datetime).toContain('07:30:00');
  });

  it('throws invalid_timezone for empty from_tz', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-05-24T15:30:00',
      from_tz: '',
      to_tz: 'Asia/Tokyo',
    });
    expect(() => refTimezoneConvert.handler(input, ctx)).toThrow(/Unrecognized source timezone/i);
  });

  it('throws invalid_timezone for empty to_tz', async () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-05-24T15:30:00',
      from_tz: 'Asia/Tokyo',
      to_tz: '',
    });
    expect(() => refTimezoneConvert.handler(input, ctx)).toThrow(/Unrecognized target timezone/i);
  });

  it('formats output with source, target, and UTC equivalent', () => {
    const output = {
      source: {
        datetime: '2026-05-24T15:30:00',
        tz: 'Asia/Tokyo',
        offset: '+09:00',
      },
      target: {
        datetime: '2026-05-24T02:30:00',
        tz: 'America/New_York',
        offset: '-04:00',
      },
      utc_equivalent: '2026-05-24T06:30:00.000Z',
    };
    const blocks = refTimezoneConvert.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('Asia/Tokyo');
    expect(text).toContain('America/New_York');
    expect(text).toContain('+09:00');
    expect(text).toContain('-04:00');
    expect(text).toContain('2026-05-24T06:30:00.000Z');
  });
});
