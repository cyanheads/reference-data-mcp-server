/**
 * @fileoverview Tool for searching and filtering countries by region, language, currency, or keyword.
 * @module mcp-server/tools/definitions/ref-geo-search
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getGeoService } from '@/services/geo/geo-service.js';

const CountrySummarySchema = z.object({
  alpha2: z.string().describe('ISO alpha-2 code.'),
  alpha3: z.string().describe('ISO alpha-3 code.'),
  name: z.string().describe('English country name.'),
  capital: z.string().nullable().describe('Capital city, or null if not applicable.'),
  region: z.string().describe('Continent-level region.'),
  currency_code: z.string().nullable().describe('Primary currency ISO 4217 code.'),
  flag: z.string().describe('Flag emoji.'),
});

export const refGeoSearch = tool('ref_geo_search', {
  title: 'Country Search',
  description:
    'Search and filter countries by region, subregion, language, currency, or free-text keyword. At least one filter is required. Returns a ranked list of matching country summaries. Use ref_geo_lookup to get the full record for a specific result.',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    keyword: z
      .string()
      .optional()
      .describe('Matches against country name, native name, capital city, and subregion.'),
    region: z
      .string()
      .optional()
      .describe(
        'Filter by continent region: Africa, Americas, Asia, Europe, Oceania, or Antarctic.',
      ),
    subregion: z
      .string()
      .optional()
      .describe('Filter by subregion (e.g., "Western Europe", "Southeast Asia", "South America").'),
    language: z
      .string()
      .optional()
      .describe('ISO 639-1 language code (e.g., "pt") or language name (e.g., "Portuguese").'),
    currency: z
      .string()
      .optional()
      .describe('ISO 4217 currency code (e.g., "EUR") or currency name (e.g., "Euro").'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe('Maximum number of results to return (1–100).'),
  }),

  output: z.object({
    results: z
      .array(CountrySummarySchema.describe('Summary for a matching country.'))
      .describe('Matching country summaries, up to limit.'),
  }),

  // Agent-facing context: total match count, truncation flag, applied filters, and empty-result guidance.
  enrichment: {
    totalMatches: z
      .number()
      .int()
      .describe('Total countries matching the filters before limit is applied.'),
    truncated: z
      .boolean()
      .describe('True when totalMatches exceeds the limit and results are cut off.'),
    appliedFilters: z
      .object({
        keyword: z.string().optional().describe('Keyword filter applied.'),
        region: z.string().optional().describe('Region filter applied.'),
        subregion: z.string().optional().describe('Subregion filter applied.'),
        language: z.string().optional().describe('Language filter applied.'),
        currency: z.string().optional().describe('Currency filter applied.'),
        limit: z.number().int().describe('Result limit applied.'),
      })
      .describe('Active filters applied to the search.'),
    notice: z
      .string()
      .optional()
      .describe(
        'Recovery hint when no countries matched — echoes active filters and suggests how to broaden.',
      ),
  },

  enrichmentTrailer: {
    totalMatches: { label: 'Total Matches' },
    truncated: { label: 'Truncated' },
    appliedFilters: {
      render: (filters) => {
        const parts: string[] = [];
        if (filters.keyword) parts.push(`keyword="${filters.keyword}"`);
        if (filters.region) parts.push(`region="${filters.region}"`);
        if (filters.subregion) parts.push(`subregion="${filters.subregion}"`);
        if (filters.language) parts.push(`language="${filters.language}"`);
        if (filters.currency) parts.push(`currency="${filters.currency}"`);
        parts.push(`limit=${filters.limit}`);
        return `**Applied Filters:** ${parts.join(', ')}`;
      },
    },
  },

  errors: [
    {
      reason: 'no_filters',
      code: JsonRpcErrorCode.ValidationError,
      when: 'No filter or keyword was provided.',
      recovery:
        'Provide at least one of keyword, region, language, subregion, or currency to filter by.',
    },
  ],

  handler(input, ctx) {
    const searchOpts: {
      keyword?: string;
      region?: string;
      subregion?: string;
      language?: string;
      currency?: string;
      limit?: number;
    } = { limit: input.limit };
    if (input.keyword?.trim()) searchOpts.keyword = input.keyword;
    if (input.region?.trim()) searchOpts.region = input.region;
    if (input.subregion?.trim()) searchOpts.subregion = input.subregion;
    if (input.language?.trim()) searchOpts.language = input.language;
    if (input.currency?.trim()) searchOpts.currency = input.currency;

    const hasFilter =
      searchOpts.keyword ||
      searchOpts.region ||
      searchOpts.subregion ||
      searchOpts.language ||
      searchOpts.currency;
    if (!hasFilter) {
      throw ctx.fail(
        'no_filters',
        'At least one search filter is required. Provide keyword, region, subregion, language, or currency.',
        ctx.recoveryFor('no_filters'),
      );
    }

    const { results, total_matches } = getGeoService().search(searchOpts, ctx);

    const truncated = total_matches > results.length;
    const appliedFilters = {
      ...(searchOpts.keyword && { keyword: searchOpts.keyword }),
      ...(searchOpts.region && { region: searchOpts.region }),
      ...(searchOpts.subregion && { subregion: searchOpts.subregion }),
      ...(searchOpts.language && { language: searchOpts.language }),
      ...(searchOpts.currency && { currency: searchOpts.currency }),
      limit: input.limit,
    };

    ctx.enrich({ totalMatches: total_matches, truncated, appliedFilters });

    if (total_matches === 0) {
      const filterDesc = [
        input.keyword && `keyword="${input.keyword}"`,
        input.region && `region="${input.region}"`,
        input.subregion && `subregion="${input.subregion}"`,
        input.language && `language="${input.language}"`,
        input.currency && `currency="${input.currency}"`,
      ]
        .filter(Boolean)
        .join(', ');
      ctx.enrich.notice(
        `No countries matched filters: ${filterDesc}. Try broadening your search by removing or changing a filter.`,
      );
    }

    return { results };
  },

  format: (result) => {
    const lines: string[] = [];
    for (const c of result.results) {
      lines.push(`${c.flag} **${c.name}** (${c.alpha2} / ${c.alpha3})`);
      lines.push(
        `  Capital: ${c.capital ?? 'N/A'} | Region: ${c.region} | Currency: ${c.currency_code ?? 'N/A'}`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
