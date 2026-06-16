/**
 * @fileoverview Tool for looking up a country by name, ISO alpha-2/3 code, or numeric code.
 * @module mcp-server/tools/definitions/ref-geo-lookup
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getGeoService } from '@/services/geo/geo-service.js';

const CurrencySchema = z.object({
  code: z.string().describe('ISO 4217 currency code (e.g., "USD").'),
  name: z.string().describe('Full currency name.'),
  symbol: z.string().nullable().describe('Currency symbol (e.g., "$"), or null if unknown.'),
});

const LanguageSchema = z.object({
  code: z.string().describe('ISO 639-1 language code (e.g., "en").'),
  name: z.string().describe('English name of the language.'),
});

export const refGeoLookup = tool('ref_geo_lookup', {
  title: 'Country Lookup',
  description:
    'Look up a country by name, ISO alpha-2 code (2 letters), or ISO alpha-3 code (3 letters). Returns the full record: capital, region, official languages, currencies, calling codes, TLD, flag emoji, and IANA timezone IDs. Accepts fuzzy name matching — "Brasil" and "Brazil" both resolve.',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    query: z
      .string()
      .describe(
        'Country name (e.g., "Germany"), ISO alpha-2 code (e.g., "DE"), or ISO alpha-3 code (e.g., "DEU").',
      ),
    by: z
      .enum(['auto', 'name', 'alpha2', 'alpha3'])
      .default('auto')
      .describe('Lookup strategy: auto tries alpha2, alpha3, then name in order.'),
  }),

  output: z.object({
    alpha2: z.string().describe('ISO 3166-1 alpha-2 code (2 letters).'),
    alpha3: z.string().describe('ISO 3166-1 alpha-3 code (3 letters).'),
    name: z.string().describe('Official English country name.'),
    native_name: z.string().describe('Country name in the primary native language.'),
    capital: z
      .string()
      .nullable()
      .describe('Capital city name, or null if not applicable (e.g., Antarctica).'),
    region: z
      .string()
      .describe('Continent-level region (Africa, Americas, Asia, Europe, Oceania, Antarctic).'),
    subregion: z
      .string()
      .nullable()
      .describe('Subregion within the continent (e.g., "Western Europe"), or null if unavailable.'),
    languages: z
      .array(LanguageSchema.describe('Language spoken in the country.'))
      .describe('Official or widely spoken languages in the country.'),
    currencies: z
      .array(CurrencySchema.describe('Currency used in the country.'))
      .describe('Currencies used in the country.'),
    calling_codes: z
      .array(z.string())
      .describe('International dialing codes with leading + (e.g., "+1", "+44").'),
    tld: z
      .string()
      .nullable()
      .describe('Country-code top-level domain (e.g., ".de"), or null if not applicable.'),
    flag: z.string().describe('Flag emoji (e.g., 🇩🇪).'),
    timezones: z
      .array(z.string())
      .describe('IANA timezone IDs observed in this country (e.g., "America/New_York").'),
  }),

  // Agent-facing context: signals when the country was resolved by fuzzy name matching
  // rather than an exact hit, so the caller knows whether to normalize the canonical name.
  enrichment: {
    notice: z
      .string()
      .optional()
      .describe(
        'Present only when the country was resolved via fuzzy name matching (starts-with or contains), not an exact code or name hit. Echoes the query and the resolved country so the caller can normalize follow-up lookups.',
      ),
  },

  errors: [
    {
      reason: 'no_match',
      code: JsonRpcErrorCode.NotFound,
      when: 'No country matched the query.',
      recovery: 'Try a different spelling or use ref_geo_search with a keyword to browse.',
    },
  ],

  handler(input, ctx) {
    if (!input.query.trim()) {
      throw ctx.fail('no_match', 'Empty query. Provide a country name, alpha-2, or alpha-3 code.');
    }
    const match = getGeoService().lookup(input.query, input.by, ctx);
    if (match === 'numeric_unsupported') {
      throw ctx.fail(
        'no_match',
        'Numeric country code lookup is not supported. Use alpha2 or alpha3 codes, or try the country name.',
      );
    }
    if (!match) {
      throw ctx.fail(
        'no_match',
        `No country matched "${input.query}". Try a different spelling or use ref_geo_search with a keyword.`,
      );
    }

    const { record: result, fuzzy } = match;
    if (fuzzy) {
      ctx.enrich.notice(
        `Fuzzy name match: resolved '${input.query}' → ${result.name} (${result.alpha2}). Use the canonical name or '${result.alpha2}' for exact follow-up lookups.`,
      );
    }

    return {
      alpha2: result.alpha2,
      alpha3: result.alpha3,
      name: result.name,
      native_name: result.native_name,
      capital: result.capital,
      region: result.region,
      subregion: result.subregion,
      languages: result.languages,
      currencies: result.currencies,
      calling_codes: result.calling_codes,
      tld: result.tld,
      flag: result.flag,
      timezones: result.timezones,
    };
  },

  format: (result) => {
    const lines: string[] = [
      `# ${result.flag} ${result.name} (${result.alpha2} / ${result.alpha3})`,
      `**Native name:** ${result.native_name}`,
      `**Capital:** ${result.capital ?? 'N/A'}`,
      `**Region:** ${result.region}${result.subregion ? ` › ${result.subregion}` : ''}`,
      '',
      `**Languages:** ${result.languages.map((l) => `${l.name} (${l.code})`).join(', ') || 'N/A'}`,
      `**Currencies:** ${result.currencies.map((c) => `${c.name} (${c.code}${c.symbol ? ` ${c.symbol}` : ''})`).join(', ') || 'N/A'}`,
      `**Calling codes:** ${result.calling_codes.join(', ') || 'N/A'}`,
      `**TLD:** ${result.tld ?? 'N/A'}`,
      `**Timezones:** ${result.timezones.length > 0 ? result.timezones.join(', ') : 'N/A'}`,
    ];
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
