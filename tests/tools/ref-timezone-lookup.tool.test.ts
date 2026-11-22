/**
 * @fileoverview Tests for the ref_timezone_lookup tool.
 * @module tests/tools/ref-timezone-lookup.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refTimezoneLookup } from '@/mcp-server/tools/definitions/ref-timezone-lookup.tool.js';
import { getTimezoneService, initTimezoneService } from '@/services/timezone/timezone-service.js';
import { expectText } from '../test-helpers.js';

beforeAll(() => {
  initTimezoneService();
});

/** Least thread-CPU microseconds per call of `fn`, over `rounds` batches of `calls` calls. */
function cpuMicrosPerCall(fn: () => void, calls: number, rounds = 3): number {
  let least = Number.POSITIVE_INFINITY;
  for (let round = 0; round < rounds; round++) {
    const start = process.threadCpuUsage();
    for (let i = 0; i < calls; i++) fn();
    const used = process.threadCpuUsage(start);
    least = Math.min(least, (used.user + used.system) / calls);
  }
  return least;
}

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

  it('auto mode answers a two-letter country code with the zones of that country', async () => {
    for (const [query, expected] of [
      ['JP', ['Asia/Tokyo']],
      ['gb', ['Europe/London']],
    ] as const) {
      const ctx = createMockContext({ errors: refTimezoneLookup.errors });
      const result = await refTimezoneLookup.handler(refTimezoneLookup.input.parse({ query }), ctx);
      expect(result.timezones.map((tz) => tz.iana_id)).toEqual(expected);
    }
  });

  it('resolves a location name written with spaces on both surfaces (#42)', async () => {
    const result = await runToolContract(refTimezoneLookup, {
      query: 'New York',
      at: '2026-01-15T12:00:00Z',
    });
    expect(result.isError).toBeFalsy();
    const structured = result.structuredContent as { timezones: { iana_id: string }[] };
    expect(structured.timezones.map((tz) => tz.iana_id)).toEqual(['America/New_York']);
    expect(expectText(result.content)).toContain('## America/New_York');
  });

  it('by "iana" resolves a location name written with spaces (#42)', async () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: 'New York', by: 'iana' });
    const result = await refTimezoneLookup.handler(input, ctx);
    expect(result.timezones.map((tz) => tz.iana_id)).toEqual(['America/New_York']);
  });

  it('by "country" still rejects a location name as no_match', () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: 'New York', by: 'country' });
    let thrown: unknown;
    try {
      refTimezoneLookup.handler(input, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toMatchObject({ code: JsonRpcErrorCode.NotFound, data: { reason: 'no_match' } });
  });

  it('description examples name only queries that resolve', () => {
    expect(refTimezoneLookup.description).not.toContain('"NY"');
    const examples = [
      ...refTimezoneLookup.description.matchAll(/"([^"]+)" resolves to "([^"]+)"/g),
    ];
    expect(examples.length, 'the description names no example').toBeGreaterThan(0);
    for (const [, query, expected] of examples) {
      expect(getTimezoneService().resolveIanaIdPublic(query!)).toBe(expected);
    }
  });
});

describe('TimezoneService.resolveIanaIdPublic — queries that resolve today', () => {
  it.each([
    // tzdb mainCities keys, including the unaccented spelling of an accented city
    ['new york city', 'America/New_York'],
    ['los angeles', 'America/Los_Angeles'],
    ['buenos aires', 'America/Argentina/Buenos_Aires'],
    ['Sao Paulo', 'America/Sao_Paulo'],
    // raw accented mainCities strings, and a partially unaccented spelling of one
    ['São Paulo', 'America/Sao_Paulo'],
    ['Zürich', 'Europe/Zurich'],
    ['Łódź', 'Europe/Warsaw'],
    ['łodź', 'Europe/Warsaw'],
    // IANA IDs as-is, lowercased, uppercased; tzdb names the Intl list does not carry
    ['Asia/Tokyo', 'Asia/Tokyo'],
    ['asia/tokyo', 'Asia/Tokyo'],
    ['ASIA/TOKYO', 'Asia/Tokyo'],
    ['America/Argentina/Buenos_Aires', 'America/Argentina/Buenos_Aires'],
    ['Asia/Kolkata', 'Asia/Kolkata'],
    // an ID segment with and without underscores
    ['New_York', 'America/New_York'],
    ['Buenos_Aires', 'America/Buenos_Aires'],
    ['Tokyo', 'Asia/Tokyo'],
    ['Los Angeles', 'America/Los_Angeles'],
    ['Buenos Aires', 'America/Argentina/Buenos_Aires'],
    // a segment prefix
    ['Honol', 'Pacific/Honolulu'],
    ['reykj', 'Atlantic/Reykjavik'],
    // UTC aliases
    ['utc', 'UTC'],
    ['GMT', 'UTC'],
    ['Etc/UTC', 'UTC'],
    ['etc/gmt', 'UTC'],
  ])('%s → %s', (query, expected) => {
    expect(getTimezoneService().resolveIanaIdPublic(query)).toBe(expected);
  });
});

describe('TimezoneService.resolveIanaIdPublic — location names written with spaces (#42)', () => {
  it.each([
    ['El Aaiun', 'Africa/El_Aaiun'],
    ['La Rioja', 'America/Argentina/La_Rioja'],
    ['Rio Gallegos', 'America/Argentina/Rio_Gallegos'],
    ['San Luis', 'America/Argentina/San_Luis'],
    ['Bahia Banderas', 'America/Bahia_Banderas'],
    ['Boa Vista', 'America/Boa_Vista'],
    ['Coral Harbour', 'America/Coral_Harbour'],
    ['Costa Rica', 'America/Costa_Rica'],
    ['Dawson Creek', 'America/Dawson_Creek'],
    ['El Salvador', 'America/El_Salvador'],
    ['Glace Bay', 'America/Glace_Bay'],
    ['Goose Bay', 'America/Goose_Bay'],
    ['Grand Turk', 'America/Grand_Turk'],
    ['Tell City', 'America/Indiana/Tell_City'],
    ['Lower Princes', 'America/Lower_Princes'],
    ['New York', 'America/New_York'],
    ['New Salem', 'America/North_Dakota/New_Salem'],
    ['Puerto Rico', 'America/Puerto_Rico'],
    ['St Barthelemy', 'America/St_Barthelemy'],
    ['St Johns', 'America/St_Johns'],
    ['St Kitts', 'America/St_Kitts'],
    ['St Lucia', 'America/St_Lucia'],
    ['St Thomas', 'America/St_Thomas'],
    ['St Vincent', 'America/St_Vincent'],
    ['Swift Current', 'America/Swift_Current'],
    ['Ho Chi Minh', 'Asia/Ho_Chi_Minh'],
    ['Kolkata', 'Asia/Kolkata'],
    ['Cape Verde', 'Atlantic/Cape_Verde'],
    ['Faroe', 'Atlantic/Faroe'],
    ['South Georgia', 'Atlantic/South_Georgia'],
    ['St Helena', 'Atlantic/St_Helena'],
    ['Broken Hill', 'Australia/Broken_Hill'],
    ['Isle of Man', 'Europe/Isle_of_Man'],
    // hyphenated segments written with spaces
    ['Blanc Sablon', 'America/Blanc-Sablon'],
    ['Port au Prince', 'America/Port-au-Prince'],
    ['Porto Novo', 'Africa/Porto-Novo'],
    ['Ust Nera', 'Asia/Ust-Nera'],
  ])('%s → %s', (query, expected) => {
    expect(getTimezoneService().resolveIanaIdPublic(query)).toBe(expected);
  });

  it.each([
    ['new york', 'America/New_York'],
    ['NEW YORK', 'America/New_York'],
    [' New  York ', 'America/New_York'],
    ['New-York', 'America/New_York'],
    ['St. Lucia', 'America/St_Lucia'],
    ['St. Johns', 'America/St_Johns'],
    ['Hồ Chí Minh', 'Asia/Ho_Chi_Minh'],
    ['Hồ Chí Minh'.normalize('NFD'), 'Asia/Ho_Chi_Minh'],
    ['Bahía Banderas', 'America/Bahia_Banderas'],
  ])('variant %j → %s', (query, expected) => {
    expect(getTimezoneService().resolveIanaIdPublic(query)).toBe(expected);
  });

  it.each([
    'NY',
    'North Dakota', // a middle segment spanning several zones
    'Eastern',
    'Saint Paul',
    'Ho Chi', // the location step matches whole names only
    'Seattle',
    '',
    '   ',
    // a location name two IDs share (America/Buenos_Aires, America/Argentina/Buenos_Aires)
    'Buenos-Aires',
    // an Etc/ ID whose sign reads backwards (Etc/GMT-5 is UTC+5)
    'GMT 5',
  ])('%j stays unresolved', (query) => {
    expect(getTimezoneService().resolveIanaIdPublic(query)).toBeNull();
  });
});

describe('TimezoneService.resolveIanaIdPublic — accented tzdb cities typed without accents (#42)', () => {
  it.each([
    ['Nis', 'Europe/Belgrade'],
    ['Kosice', 'Europe/Bratislava'],
    ['Petrzalka', 'Europe/Bratislava'],
    ['Niksic', 'Europe/Podgorica'],
    ['Iasi', 'Europe/Bucharest'],
    ['Constanta', 'Europe/Bucharest'],
    ['Shubra al Khaymah', 'Africa/Cairo'],
    ['Balti', 'Europe/Chisinau'],
    ['Khan Yunis', 'Asia/Gaza'],
    ['Jabalya', 'Asia/Gaza'],
    ['Liepaja', 'Europe/Riga'],
    ['Klaipeda', 'Europe/Vilnius'],
    ['Siauliai', 'Europe/Vilnius'],
    ['Petah Tiqva', 'Asia/Jerusalem'],
    ['Al Ahmadi', 'Asia/Kuwait'],
    ['Hawalli', 'Asia/Kuwait'],
    ['Sabah as Salim', 'Asia/Kuwait'],
    ['Al Farwaniyah', 'Asia/Kuwait'],
    ['Madinat Hamad', 'Asia/Bahrain'],
    ['Ar Rayyan', 'Asia/Qatar'],
    ['Izmir', 'Europe/Istanbul'],
    ['Herat', 'Asia/Kabul'],
    ['Mazar-e Sharif', 'Asia/Kabul'],
    ['Kandahar', 'Asia/Kabul'],
    ['Kulob', 'Asia/Dushanbe'],
    ['Dasoguz', 'Asia/Ashgabat'],
    ['Patan', 'Asia/Kathmandu'],
    ['Punakha', 'Asia/Thimphu'],
    ['Can Tho', 'Asia/Ho_Chi_Minh'],
    ['Hamhung', 'Asia/Pyongyang'],
  ])('%s → %s', (query, expected) => {
    expect(getTimezoneService().resolveIanaIdPublic(query)).toBe(expected);
  });
});

describe('TimezoneService.resolveIanaIdPublic — cost on long unmatched text', () => {
  const BASE_CHARS = 5_000;
  const MAX_CHARS = 320_000;

  it.each([
    ['a digit run', (n: number) => '1'.repeat(n)],
    ['one long line ending in a break', (n: number) => `${'x'.repeat(n)}\ny`],
    ['line breaks throughout', (n: number) => `x${'  \r\n'.repeat(n / 4)}`],
    ['precomposed accented letters', (n: number) => 'é'.repeat(n)],
    ['combining marks', (n: number) => `e${String.fromCodePoint(0x301).repeat(n)}`],
    ['separators and punctuation', (n: number) => `${"_- .'".repeat(n / 5)}a`],
  ])(
    'grows linearly over %s',
    (_shape, make) => {
      const svc = getTimezoneService();
      const base = make(BASE_CHARS);
      // Unmatched text runs every resolver step, the accent and separator fold included.
      expect(svc.resolveIanaIdPublic(base)).toBeNull();
      for (let size = BASE_CHARS * 2; size <= MAX_CHARS; size *= 2) {
        const input = make(size);
        const multiple = size / BASE_CHARS;
        let growth = Number.POSITIVE_INFINITY;
        for (let pair = 0; pair < 3; pair++) {
          const baseCost = cpuMicrosPerCall(() => svc.resolveIanaIdPublic(base), 2 * multiple);
          const sizeCost = cpuMicrosPerCall(() => svc.resolveIanaIdPublic(input), 2);
          growth = Math.min(growth, sizeCost / baseCost);
        }
        expect(
          growth,
          `${size} chars cost ${growth.toFixed(1)}x the ${BASE_CHARS}-char input`,
        ).toBeLessThan(4 * multiple);
      }
      const longest = make(MAX_CHARS);
      expect(cpuMicrosPerCall(() => svc.resolveIanaIdPublic(longest), 2)).toBeLessThan(100_000);
    },
    0,
  );
});
