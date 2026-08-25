/**
 * @fileoverview Tool for filtering periodic table elements by category, group, period, or property ranges.
 * @module mcp-server/tools/definitions/ref-element-search
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getElementsService } from '@/services/elements/elements-service.js';

const ElementSummarySchema = z.object({
  number: z.number().int().describe('Atomic number.'),
  symbol: z.string().describe('Chemical symbol.'),
  name: z.string().describe('IUPAC element name.'),
  atomic_mass: z
    .number()
    .nullable()
    .describe('Atomic mass in unified atomic mass units. Null for unstable elements.'),
  atomic_mass_estimated: z.boolean().describe('True when the atomic mass is estimated.'),
  category: z.string().describe('Element category.'),
});

const RangeSchema = z.object({
  min: z.number().describe('Minimum value (inclusive).'),
  max: z.number().describe('Maximum value (inclusive).'),
});

export const refElementSearch = tool('ref_element_search', {
  title: 'Element Search',
  description:
    'Filter periodic table elements by category, group, period, atomic number range, or atomic mass range. At least one filter is required. Returns matching elements as a summary list. Use ref_element_lookup for the full record on a specific element. Valid categories: alkali metal, alkaline earth metal, transition metal, post-transition metal, metalloid, reactive nonmetal, noble gas, lanthanide, actinide.',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    category: z
      .string()
      .optional()
      .describe(
        'Element category (partial match): alkali metal, alkaline earth metal, transition metal, post-transition metal, metalloid, reactive nonmetal, noble gas, lanthanide, actinide.',
      ),
    group: z
      .number()
      .int()
      .min(1)
      .max(18)
      .optional()
      .describe('Periodic table group number (1–18). Lanthanides and actinides have no group.'),
    period: z.number().int().min(1).max(7).optional().describe('Periodic table period (1–7).'),
    atomic_number_range: RangeSchema.optional().describe(
      'Inclusive range of atomic numbers to include.',
    ),
    atomic_mass_range: RangeSchema.optional().describe(
      'Inclusive range of atomic mass in unified atomic mass units.',
    ),
  }),

  output: z.object({
    results: z
      .array(ElementSummarySchema.describe('Summary for a matching element.'))
      .describe('Matching element summaries.'),
  }),

  // Agent-facing context: total match count and empty-result guidance.
  enrichment: {
    totalMatches: z.number().int().describe('Number of elements matching all filters.'),
    appliedFilters: z
      .object({
        category: z.string().optional().describe('Category filter applied.'),
        group: z.number().int().optional().describe('Group filter applied.'),
        period: z.number().int().optional().describe('Period filter applied.'),
        atomic_number_range: RangeSchema.optional().describe('Atomic number range applied.'),
        atomic_mass_range: RangeSchema.optional().describe('Atomic mass range applied.'),
      })
      .describe('Active filters applied to the search.'),
    notice: z
      .string()
      .optional()
      .describe(
        'Recovery hint when no elements matched — echoes active filters and suggests how to broaden.',
      ),
  },

  enrichmentTrailer: {
    totalMatches: { label: 'Total Matches' },
    appliedFilters: {
      render: (filters) => {
        const parts: string[] = [];
        if (filters.category) parts.push(`category="${filters.category}"`);
        if (filters.group != null) parts.push(`group=${filters.group}`);
        if (filters.period != null) parts.push(`period=${filters.period}`);
        if (filters.atomic_number_range)
          parts.push(`Z=${filters.atomic_number_range.min}–${filters.atomic_number_range.max}`);
        if (filters.atomic_mass_range)
          parts.push(`mass=${filters.atomic_mass_range.min}–${filters.atomic_mass_range.max} u`);
        return parts.length > 0
          ? `**Applied Filters:** ${parts.join(', ')}`
          : '**Applied Filters:** none';
      },
    },
  },

  errors: [
    {
      reason: 'no_filters',
      code: JsonRpcErrorCode.ValidationError,
      when: 'No filter was provided.',
      recovery:
        'Provide at least one filter: category, group, period, atomic_number_range, or atomic_mass_range.',
    },
  ],

  handler(input, ctx) {
    const searchOpts: {
      category?: string;
      group?: number;
      period?: number;
      atomic_number_range?: { min: number; max: number };
      atomic_mass_range?: { min: number; max: number };
    } = {};
    if (input.category?.trim()) searchOpts.category = input.category;
    if (input.group != null) searchOpts.group = input.group;
    if (input.period != null) searchOpts.period = input.period;
    if (input.atomic_number_range?.min != null && input.atomic_number_range?.max != null) {
      searchOpts.atomic_number_range = {
        min: input.atomic_number_range.min,
        max: input.atomic_number_range.max,
      };
    }
    if (input.atomic_mass_range?.min != null && input.atomic_mass_range?.max != null) {
      searchOpts.atomic_mass_range = {
        min: input.atomic_mass_range.min,
        max: input.atomic_mass_range.max,
      };
    }

    const hasFilter =
      searchOpts.category ||
      searchOpts.group != null ||
      searchOpts.period != null ||
      searchOpts.atomic_number_range ||
      searchOpts.atomic_mass_range;
    if (!hasFilter) {
      throw ctx.fail(
        'no_filters',
        'At least one filter is required. Provide category, group, period, atomic_number_range, or atomic_mass_range.',
        ctx.recoveryFor('no_filters'),
      );
    }

    const { results, total_matches } = getElementsService().search(searchOpts, ctx);

    ctx.enrich({ totalMatches: total_matches, appliedFilters: searchOpts });

    if (total_matches === 0) {
      const filterDesc = [
        input.category && `category="${input.category}"`,
        input.group != null && `group=${input.group}`,
        input.period != null && `period=${input.period}`,
        input.atomic_number_range &&
          `Z=${input.atomic_number_range.min}–${input.atomic_number_range.max}`,
        input.atomic_mass_range &&
          `mass=${input.atomic_mass_range.min}–${input.atomic_mass_range.max}`,
      ]
        .filter(Boolean)
        .join(', ');
      ctx.enrich.notice(
        `No elements matched filters: ${filterDesc}. Try a broader category or wider range.`,
      );
    }

    return { results };
  },

  format: (result) => {
    const lines: string[] = [];
    for (const el of result.results) {
      const massStr =
        el.atomic_mass != null
          ? `${el.atomic_mass} u${el.atomic_mass_estimated ? ' (est.)' : ''}`
          : 'N/A';
      lines.push(`**${el.number}. ${el.symbol}** — ${el.name} | Mass: ${massStr} | ${el.category}`);
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
