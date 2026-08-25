/**
 * @fileoverview Tests for the ref_geo_search tool.
 * @module tests/tools/ref-geo-search.tool.test
 */

import { createMockContext, getEnrichment } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refGeoSearch } from '@/mcp-server/tools/definitions/ref-geo-search.tool.js';
import { initGeoService } from '@/services/geo/geo-service.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';
import { expectNumber, expectRecord, expectText } from '../test-helpers.js';

beforeAll(() => {
  initTimezoneService();
  initGeoService();
});

describe('refGeoSearch', () => {
  it('searches by region', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ region: 'Oceania' });
    const result = await refGeoSearch.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(expectNumber(enrichment.totalMatches)).toBeGreaterThan(0);
    expect(result.results.every((c) => c.region === 'Oceania')).toBe(true);
    // Oceania has ~20 countries, default limit is 20 so may not be truncated
    expect(typeof enrichment.truncated).toBe('boolean');
  });

  it('searches by language code', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ language: 'pt' });
    const result = await refGeoSearch.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(expectNumber(enrichment.totalMatches)).toBeGreaterThan(0);
    // Should include Brazil and Portugal at minimum
    const names = result.results.map((c) => c.name);
    expect(names.some((n) => n.includes('Brazil') || n.includes('Portugal'))).toBe(true);
  });

  it('searches by currency', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ currency: 'EUR' });
    await refGeoSearch.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(expectNumber(enrichment.totalMatches)).toBeGreaterThan(0);
    // EUR is used by many EU countries
    expect(expectNumber(enrichment.totalMatches)).toBeGreaterThan(5);
  });

  it('applies limit correctly', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ region: 'Americas', limit: 5 });
    const result = await refGeoSearch.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(result.results.length).toBeLessThanOrEqual(5);
    if (expectNumber(enrichment.totalMatches) > 5) {
      expect(enrichment.truncated).toBe(true);
    }
  });

  it('searches by keyword matching capital', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ keyword: 'Tokyo' });
    const result = await refGeoSearch.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    expect(expectNumber(enrichment.totalMatches)).toBeGreaterThan(0);
    const names = result.results.map((c) => c.name);
    expect(names).toContain('Japan');
  });

  it('throws when no filter provided', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({});
    expect(() => refGeoSearch.handler(input, ctx)).toThrow(/at least one/i);
  });

  it('language filter uses exact code match — "es" does not match Portuguese', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ language: 'es' });
    const result = await refGeoSearch.handler(input, ctx);
    const names = result.results.map((c) => c.name);
    // Portuguese-speaking countries should NOT appear in Spanish results
    expect(names).not.toContain('Brazil');
    expect(names).not.toContain('Portugal');
  });

  it('subregion filter uses exact match — "Eastern Asia" does not match South-Eastern Asia', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ subregion: 'Eastern Asia', limit: 100 });
    const result = await refGeoSearch.handler(input, ctx);
    // All results should be exactly Eastern Asia, not South-Eastern Asia
    const names = result.results.map((c) => c.name);
    // Vietnam, Indonesia, Thailand are South-Eastern Asia — should NOT appear
    expect(names).not.toContain('Vietnam');
    expect(names).not.toContain('Indonesia');
    // China and Japan are Eastern Asia — should appear
    expect(names.some((n) => n === 'China' || n === 'Japan')).toBe(true);
  });

  it('sets notice enrichment with no results', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ region: 'Oceania', language: 'de' });
    const result = await refGeoSearch.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    // German-speaking countries are not in Oceania
    expect(expectNumber(enrichment.totalMatches)).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(enrichment.notice).toBeTruthy();
  });

  it('appliedFilters enrichment echoes active filters', async () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ region: 'Europe', limit: 10 });
    await refGeoSearch.handler(input, ctx);
    const enrichment = getEnrichment(ctx);
    const appliedFilters = expectRecord(enrichment.appliedFilters);
    expect(appliedFilters.region).toBe('Europe');
    expect(appliedFilters.limit).toBe(10);
  });

  it('formats results with flags, names, and codes', () => {
    const output = {
      results: [
        {
          alpha2: 'DE',
          alpha3: 'DEU',
          name: 'Germany',
          capital: 'Berlin',
          region: 'Europe',
          currency_code: 'EUR',
          flag: '🇩🇪',
        },
        {
          alpha2: 'FR',
          alpha3: 'FRA',
          name: 'France',
          capital: 'Paris',
          region: 'Europe',
          currency_code: 'EUR',
          flag: '🇫🇷',
        },
      ],
    };
    const blocks = refGeoSearch.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('Germany');
    expect(text).toContain('DE');
    expect(text).toContain('France');
    expect(text).toContain('Paris');
    expect(text).toContain('EUR');
  });
});
