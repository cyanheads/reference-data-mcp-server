/**
 * @fileoverview Resource for fetching a full country record by ISO alpha-2 code.
 * @module mcp-server/resources/definitions/ref-countries
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { notFound } from '@cyanheads/mcp-ts-core/errors';
import { getGeoService } from '@/services/geo/geo-service.js';

export const refCountriesResource = resource('ref://countries/{alpha2}', {
  name: 'ref-country',
  description:
    'Full country record by ISO alpha-2 code (e.g., ref://countries/DE for Germany). Returns all fields including capital, region, languages, currencies, calling codes, TLD, flag, and timezone IDs.',
  mimeType: 'application/json',
  cacheHint: { ttlMs: 86_400_000, cacheScope: 'public' },

  params: z.object({
    alpha2: z
      .string()
      .describe('ISO 3166-1 alpha-2 country code (2 uppercase letters, e.g., "US", "DE", "JP").'),
  }),

  output: z.object({
    alpha2: z.string().describe('ISO alpha-2 code.'),
    alpha3: z.string().describe('ISO alpha-3 code.'),
    name: z.string().describe('Official English country name.'),
    native_name: z.string().describe('Country name in the primary native language.'),
    capital: z
      .string()
      .nullable()
      .describe('Capital city name, or null if not applicable (e.g., Antarctica).'),
    region: z.string().describe('Continent-level region.'),
    subregion: z.string().nullable().describe('Subregion, or null if unavailable.'),
    languages: z
      .array(
        z
          .object({
            code: z.string().describe('ISO 639-1 code.'),
            name: z.string().describe('Language name.'),
          })
          .describe('A language spoken in the country.'),
      )
      .describe('Official or widely spoken languages.'),
    currencies: z
      .array(
        z
          .object({
            code: z.string().describe('ISO 4217 code.'),
            name: z.string().describe('Currency name.'),
            symbol: z.string().nullable().describe('Currency symbol.'),
          })
          .describe('A currency used in the country.'),
      )
      .describe('Currencies used.'),
    calling_codes: z.array(z.string()).describe('International dialing codes with + prefix.'),
    tld: z
      .string()
      .nullable()
      .describe('Country-code top-level domain (e.g., ".de"), or null if not applicable.'),
    flag: z.string().describe('Flag emoji.'),
    timezones: z.array(z.string()).describe('IANA timezone IDs observed in this country.'),
  }),

  handler(params) {
    const record = getGeoService().lookupByAlpha2(params.alpha2.toUpperCase());
    if (!record) {
      throw notFound(
        `Country "${params.alpha2}" not found. Use a valid ISO 3166-1 alpha-2 code (e.g., "US", "DE").`,
        { alpha2: params.alpha2 },
      );
    }
    return record;
  },
});
