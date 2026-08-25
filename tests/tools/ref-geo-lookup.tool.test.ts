/**
 * @fileoverview Tests for the ref_geo_lookup tool.
 * @module tests/tools/ref-geo-lookup.tool.test
 */

import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refGeoLookup } from '@/mcp-server/tools/definitions/ref-geo-lookup.tool.js';
import { initGeoService } from '@/services/geo/geo-service.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';
import { expectText } from '../test-helpers.js';

beforeAll(() => {
  initTimezoneService();
  initGeoService();
});

describe('refGeoLookup', () => {
  it('looks up Germany by alpha-2 code', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'DE' });
    const result = await refGeoLookup.handler(input, ctx);
    expect(result.alpha2).toBe('DE');
    expect(result.alpha3).toBe('DEU');
    expect(result.name).toBe('Germany');
    expect(result.region).toBe('Europe');
    expect(result.flag).toBeTruthy();
    expect(result.timezones).toBeInstanceOf(Array);
    expect(result.currencies).toBeInstanceOf(Array);
    expect(result.languages).toBeInstanceOf(Array);
  });

  it('looks up United States by alpha-3 code', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'USA', by: 'alpha3' });
    const result = await refGeoLookup.handler(input, ctx);
    expect(result.alpha2).toBe('US');
    expect(result.name).toBe('United States');
    expect(result.calling_codes).toContain('+1');
  });

  it('looks up Japan by name', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'Japan', by: 'name' });
    const result = await refGeoLookup.handler(input, ctx);
    expect(result.alpha2).toBe('JP');
    expect(result.tld).toBe('.jp');
  });

  it('auto mode resolves two-letter input as alpha2', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'FR' });
    const result = await refGeoLookup.handler(input, ctx);
    expect(result.alpha2).toBe('FR');
    expect(result.name).toBe('France');
  });

  it('emits a fuzzy-match notice when resolved via the fuzzy name path', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    // "german" is not an exact country name/native-name key — it starts-with "germany".
    const input = refGeoLookup.input.parse({ query: 'german' });
    const result = await refGeoLookup.handler(input, ctx);
    expect(result.name).toBe('Germany');
    const enrichment = getEnrichment(ctx);
    expect(enrichment.notice).toBeTruthy();
    expect(enrichment.notice).toContain('german');
    expect(enrichment.notice).toContain('Germany');
    expect(enrichment.notice).toContain('DE');
  });

  it('emits no notice for an exact name match', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'Japan', by: 'name' });
    const result = await refGeoLookup.handler(input, ctx);
    expect(result.alpha2).toBe('JP');
    expect(getEnrichment(ctx).notice).toBeUndefined();
  });

  it('emits no notice for an exact code match', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'DE' });
    await refGeoLookup.handler(input, ctx);
    expect(getEnrichment(ctx).notice).toBeUndefined();
  });

  it('throws for unrecognized query', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'XYZZY_NO_COUNTRY' });
    expect(() => refGeoLookup.handler(input, ctx)).toThrow();
  });

  it('formats output with flag, name, codes, and timezones', () => {
    const output = {
      alpha2: 'DE',
      alpha3: 'DEU',
      name: 'Germany',
      native_name: 'Deutschland',
      capital: 'Berlin',
      region: 'Europe',
      subregion: 'Western Europe',
      languages: [{ code: 'de', name: 'German' }],
      currencies: [{ code: 'EUR', name: 'Euro', symbol: '€' }],
      calling_codes: ['+49'],
      tld: '.de',
      flag: '🇩🇪',
      timezones: ['Europe/Berlin'],
    };
    const blocks = refGeoLookup.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('Germany');
    expect(text).toContain('DE');
    expect(text).toContain('DEU');
    expect(text).toContain('Berlin');
    expect(text).toContain('Europe');
    expect(text).toContain('German');
    expect(text).toContain('Euro');
    expect(text).toContain('+49');
    expect(text).toContain('Europe/Berlin');
  });

  it('formats null capital and subregion gracefully', () => {
    const output = {
      alpha2: 'AQ',
      alpha3: 'ATA',
      name: 'Antarctica',
      native_name: 'Antarctica',
      capital: null,
      region: 'Antarctic',
      subregion: null,
      languages: [],
      currencies: [],
      calling_codes: [],
      tld: '.aq',
      flag: '🇦🇶',
      timezones: [],
    };
    const blocks = refGeoLookup.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('Antarctica');
    expect(text).toContain('N/A');
  });

  it('returns .uk (not .gb) for the United Kingdom', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'GB' });
    const result = await refGeoLookup.handler(input, ctx);
    expect(result.alpha2).toBe('GB');
    expect(result.tld).toBe('.uk');
  });

  it('leaves an unaffected country tld unchanged (JP → .jp)', async () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: 'JP' });
    const result = await refGeoLookup.handler(input, ctx);
    expect(result.tld).toBe('.jp');
  });
});
