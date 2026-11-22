/**
 * @fileoverview Caller fragments are readable on tool and resource response surfaces.
 * @module tests/tools/caller-display.test
 */

import { runToolContract } from '@cyanheads/mcp-ts-core/testing';
import MarkdownIt from 'markdown-it';
import { beforeAll, describe, expect, it } from 'vitest';
import { refCountriesResource } from '@/mcp-server/resources/definitions/ref-countries.resource.js';
import { refElementsResource } from '@/mcp-server/resources/definitions/ref-elements.resource.js';
import {
  refTimezonesResource,
  refTimezonesSlashCatchResource,
} from '@/mcp-server/resources/definitions/ref-timezones.resource.js';
import { refConstantLookup } from '@/mcp-server/tools/definitions/ref-constant-lookup.tool.js';
import { refElementLookup } from '@/mcp-server/tools/definitions/ref-element-lookup.tool.js';
import { refElementSearch } from '@/mcp-server/tools/definitions/ref-element-search.tool.js';
import { refGeoLookup } from '@/mcp-server/tools/definitions/ref-geo-lookup.tool.js';
import { refGeoSearch } from '@/mcp-server/tools/definitions/ref-geo-search.tool.js';
import { refHttpStatus } from '@/mcp-server/tools/definitions/ref-http-status.tool.js';
import { refMimeType } from '@/mcp-server/tools/definitions/ref-mime-type.tool.js';
import { refTimezoneConvert } from '@/mcp-server/tools/definitions/ref-timezone-convert.tool.js';
import { refTimezoneLookup } from '@/mcp-server/tools/definitions/ref-timezone-lookup.tool.js';
import { refUnitConvert } from '@/mcp-server/tools/definitions/ref-unit-convert.tool.js';
import { initConstantsService } from '@/services/constants/constants-service.js';
import { initElementsService } from '@/services/elements/elements-service.js';
import { initGeoService } from '@/services/geo/geo-service.js';
import { initHttpStatusService } from '@/services/http-status/http-status-service.js';
import { initMimeService } from '@/services/mime/mime-service.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';
import { initUnitsService } from '@/services/units/units-service.js';
import { createResourceReader } from '../resources/read-resource.js';

const markdown = new MarkdownIt('commonmark');

function rendered(result: Awaited<ReturnType<typeof runToolContract>>): string {
  return result.content
    .flatMap((block) => (block.type === 'text' ? markdown.parse(block.text, {}) : []))
    .flatMap((token) => token.children ?? [])
    .map((token) => token.content)
    .join('');
}

beforeAll(() => {
  initTimezoneService();
  initGeoService();
  initElementsService();
  initConstantsService();
  initHttpStatusService();
  initMimeService();
  initUnitsService();
});

describe('caller text in tool errors', () => {
  const query = 'Fictional\tCafé';
  const display = 'Fictional\\u{0009}Café';
  const datetime = '2026-05-24T15:30:00';
  it.each([
    ['country', 'no_match', () => runToolContract(refGeoLookup, { query })],
    ['element', 'no_match', () => runToolContract(refElementLookup, { query })],
    ['constant', 'no_match', () => runToolContract(refConstantLookup, { query })],
    ['HTTP status', 'no_match', () => runToolContract(refHttpStatus, { query })],
    ['MIME extension', 'no_match', () => runToolContract(refMimeType, { query })],
    ['MIME type', 'no_match', () => runToolContract(refMimeType, { query: `text/${query}` })],
    ['timezone', 'no_match', () => runToolContract(refTimezoneLookup, { query })],
    [
      'lookup date',
      'invalid_at',
      () => runToolContract(refTimezoneLookup, { query: 'UTC', at: query }),
    ],
    [
      'source timezone',
      'invalid_timezone',
      () => runToolContract(refTimezoneConvert, { from_tz: query, to_tz: 'UTC', datetime }),
    ],
    [
      'target timezone',
      'invalid_timezone',
      () => runToolContract(refTimezoneConvert, { from_tz: 'UTC', to_tz: query, datetime }),
    ],
    [
      'unit',
      'unknown_unit',
      () => runToolContract(refUnitConvert, { from: query, to: 'kg', value: 1 }),
    ],
  ] as const)('shows the %s fragment legibly', async (_label, reason, run) => {
    const result = await run();
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: {
        message: expect.stringContaining(display),
        data: { reason, recovery: { hint: expect.any(String) } },
      },
    });
    const text = rendered(result);
    expect(text).toContain(display);
    expect(text).toContain(`(reason ${reason})`);
    expect(text).not.toContain(query);
  });

  it('preserves an ordinary visible error and its recovery', async () => {
    const result = await runToolContract(refElementLookup, { query: 'Fictional Café' });
    expect(result.structuredContent).toMatchObject({
      error: {
        message:
          'No element matched "Fictional Café". Use ref_element_search to browse by category, or check the IUPAC name or symbol spelling.',
        data: { reason: 'no_match' },
      },
    });
    expect(rendered(result)).toContain('No element matched "Fictional Café"');
  });
});

describe('caller text in enrichment', () => {
  it.each([
    ['countries', 'keyword', (value: string) => runToolContract(refGeoSearch, { keyword: value })],
    [
      'elements',
      'category',
      (value: string) => runToolContract(refElementSearch, { category: value }),
    ],
  ] as const)(
    'retains the raw %s filter and distinguishes an escape from literal notation',
    async (_label, field, run) => {
      const value = 'Fictional\t"Café"\\u{0009}';
      const display = 'Fictional\\u{0009}\\"Café\\"\\\\u{0009}';
      const result = await run(value);
      expect(result.structuredContent).toMatchObject({
        results: [],
        appliedFilters: { [field]: value },
        notice: expect.stringContaining(display),
      });
      expect(rendered(result)).toContain(`Applied Filters: ${field}="${display}"`);
      expect(rendered(result)).toContain(`matched filters: ${field}="${display}"`);
    },
  );

  it('preserves a visible fuzzy query on both surfaces', async () => {
    const result = await runToolContract(refGeoLookup, { query: 'German' });
    expect(result.structuredContent).toMatchObject({
      alpha2: 'DE',
      notice: expect.stringContaining("resolved 'German' → Germany (DE)"),
    });
    expect(rendered(result)).toContain("resolved 'German' → Germany (DE)");
  });
});

describe('caller text in resource errors', () => {
  const read = createResourceReader([
    refCountriesResource,
    refElementsResource,
    refTimezonesResource,
    refTimezonesSlashCatchResource,
  ]);

  it.each([
    [
      'countries/Fictional%09Code',
      'country_not_found',
      { alpha2: 'Fictional\tCode' },
      'Fictional\\u{0009}Code',
    ],
    [
      'elements/Fictional%09Number',
      'invalid_atomic_number',
      { number: 'Fictional\tNumber' },
      'Fictional\\u{0009}Number',
    ],
    [
      'timezones/Fictional%2FCity%09Name',
      'invalid_timezone',
      { iana_id: 'Fictional/City\tName' },
      'Fictional/City\\u{0009}Name',
    ],
    [
      'timezones/Fictional/City%09Name',
      'unencoded_slash',
      {
        iana_id: 'Fictional/City\tName',
        encoded_uri: 'ref://timezones/Fictional%2FCity%09Name',
      },
      'Fictional/City\\u{0009}Name',
    ],
  ] as const)('displays %s legibly and preserves raw data', async (path, reason, data, display) => {
    const result = await read(`ref://${path}`);
    expect(result.error).toMatchObject({
      message: expect.stringContaining(display),
      data: { ...data, reason, recovery: { hint: expect.any(String) } },
    });
  });
});
