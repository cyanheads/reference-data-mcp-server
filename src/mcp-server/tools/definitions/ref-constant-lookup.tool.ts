/**
 * @fileoverview Tool for looking up a physical constant by name, symbol, or alias.
 * @module mcp-server/tools/definitions/ref-constant-lookup
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { DATASET_VERSION, getConstantsService } from '@/services/constants/constants-service.js';

export const refConstantLookup = tool('ref_constant_lookup', {
  title: 'Physical Constant Lookup',
  description: `Look up a fundamental physical constant by name, symbol, or common alias. Returns the ${DATASET_VERSION} value, SI unit expression, relative standard uncertainty, and a short description. Recognizes common names and symbols — "speed of light", "c", "Avogadro's number", "N_A", "Planck", "h", "Boltzmann", "k_B" all resolve correctly. Fuzzy matching returns the closest match plus alternatives.`,
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    query: z
      .string()
      .describe(
        'Constant name, symbol, or common alias (e.g., "speed of light", "c", "Avogadro", "N_A", "Planck constant", "h").',
      ),
  }),

  output: z.object({
    name: z.string().describe('Full CODATA constant name.'),
    symbol: z.string().describe('Standard mathematical symbol.'),
    value: z.number().describe('Numeric value in SI units.'),
    unit: z.string().describe('SI unit expression (e.g., "m s⁻¹", "J K⁻¹", "dimensionless").'),
    uncertainty: z
      .number()
      .nullable()
      .describe('Absolute standard uncertainty in SI units. Null for exactly-defined constants.'),
    uncertainty_relative: z
      .string()
      .nullable()
      .describe('Relative standard uncertainty or "exact (defined)" for exact values.'),
    description: z.string().describe('Short description of the constant and its significance.'),
    codata_id: z
      .string()
      .nullable()
      .describe('CODATA identifier string, or null if not in CODATA registry.'),
    exact: z
      .boolean()
      .describe('True when the constant has an exact defined value (no experimental uncertainty).'),
    match_strategy: z
      .enum(['exact_symbol', 'exact_name', 'fuzzy'])
      .describe(
        'How this constant was matched: exact_symbol = case-sensitive symbol hit (e.g. "G"), exact_name = exact alias/name match, fuzzy = partial or contains match. fuzzy signals the query was imprecise and the result is the closest candidate.',
      ),
    dataset_version: z.string().describe('Data source version (CODATA year).'),
    related: z
      .array(
        z
          .object({
            name: z.string().describe('Related constant name.'),
            symbol: z.string().describe('Related constant symbol.'),
          })
          .describe('A related constant that also matched the query.'),
      )
      .describe('Related constants that also matched the query.'),
  }),

  errors: [
    {
      reason: 'no_match',
      code: JsonRpcErrorCode.NotFound,
      when: 'No constant matched the query.',
      recovery:
        'Try a more common name or alias, e.g., "electron mass", "Planck constant", or "gravitational constant".',
    },
  ],

  handler(input, ctx) {
    if (!input.query.trim()) {
      throw ctx.fail(
        'no_match',
        'Empty query. Provide a constant name, symbol, or alias (e.g., "speed of light", "G", "h").',
        ctx.recoveryFor('no_match'),
      );
    }
    const result = getConstantsService().lookup(input.query, ctx);
    if (!result) {
      throw ctx.fail(
        'no_match',
        `No physical constant matched "${input.query}". Try common names like "speed of light", "Planck constant", or "gravitational constant".`,
        ctx.recoveryFor('no_match'),
      );
    }
    return { ...result, dataset_version: DATASET_VERSION };
  },

  format: (result) => {
    const lines = [
      `# ${result.name}`,
      `**Symbol:** ${result.symbol}`,
      `**Value:** ${result.value} ${result.unit}`,
      `**Uncertainty:** ${result.uncertainty != null ? `${result.uncertainty} (relative: ${result.uncertainty_relative ?? 'N/A'})` : (result.uncertainty_relative ?? 'N/A')}${result.exact ? ' (exact by definition)' : ''}`,
      `**Dataset:** ${result.dataset_version}${result.codata_id ? ` (CODATA: ${result.codata_id})` : ''}`,
      `**Match:** ${result.match_strategy}${result.match_strategy === 'fuzzy' ? ' — closest candidate for an imprecise query; verify before reuse' : ''}`,
      '',
      result.description,
    ];
    if (result.related.length > 0) {
      lines.push(
        '',
        `**Related constants:** ${result.related.map((r) => `${r.name} (${r.symbol})`).join(', ')}`,
      );
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
