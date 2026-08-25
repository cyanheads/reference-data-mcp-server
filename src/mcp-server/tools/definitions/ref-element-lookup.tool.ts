/**
 * @fileoverview Tool for looking up a periodic table element by name, symbol, or atomic number.
 * @module mcp-server/tools/definitions/ref-element-lookup
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { DATASET_VERSION, getElementsService } from '@/services/elements/elements-service.js';

export const refElementLookup = tool('ref_element_lookup', {
  title: 'Element Lookup',
  description:
    'Look up a periodic table element by name, chemical symbol, or atomic number. Returns the full data record: atomic number, symbol, name, atomic mass (in unified atomic mass units), electron configuration, group, period, block, category (e.g., "noble gas", "transition metal"), Pauling electronegativity, density (g/cm³), melting and boiling points in kelvin, and discovery year. Properties unavailable for synthetic or insufficiently studied elements are returned as null.',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    query: z
      .string()
      .describe(
        'Element name (e.g., "tungsten"), chemical symbol (e.g., "W"), or atomic number as a string (e.g., "74").',
      ),
    by: z
      .enum(['auto', 'name', 'symbol', 'number'])
      .default('auto')
      .describe('Lookup mode: auto tries atomic number, then symbol, then name.'),
  }),

  output: z.object({
    number: z.number().int().describe('Atomic number (proton count).'),
    symbol: z.string().describe('Chemical symbol (e.g., "Fe").'),
    name: z.string().describe('IUPAC element name.'),
    atomic_mass: z
      .number()
      .nullable()
      .describe(
        'Standard atomic mass in unified atomic mass units (u). Null for unstable elements with no standard mass.',
      ),
    atomic_mass_estimated: z
      .boolean()
      .describe(
        'True when the atomic mass is estimated or based on the most stable isotope rather than a natural abundance average.',
      ),
    electron_configuration: z
      .string()
      .describe('Electron configuration using noble gas shorthand (e.g., "[Ar] 3d6 4s2").'),
    group: z
      .number()
      .int()
      .nullable()
      .describe('Periodic table group number (1–18). Null for lanthanides and actinides.'),
    period: z.number().int().describe('Periodic table period number (1–7).'),
    block: z.string().describe('Electron block: s, p, d, or f.'),
    category: z
      .string()
      .describe('Element category (e.g., "transition metal", "noble gas", "lanthanide").'),
    electronegativity_pauling: z
      .number()
      .nullable()
      .describe(
        'Pauling electronegativity scale value. Null for noble gases and heavy synthetic elements.',
      ),
    density_g_per_cm3: z
      .number()
      .nullable()
      .describe(
        'Density in grams per cubic centimeter at STP. Null for synthetic or poorly studied elements.',
      ),
    melting_point_k: z
      .number()
      .nullable()
      .describe(
        'Melting point in kelvin at standard pressure. Null for unstable or synthetic elements.',
      ),
    boiling_point_k: z
      .number()
      .nullable()
      .describe(
        'Boiling point in kelvin at standard pressure. Null for unstable or synthetic elements.',
      ),
    discovery_year: z
      .number()
      .int()
      .nullable()
      .describe('Year of discovery. Null for elements known since antiquity.'),
    discovery_scientists: z
      .string()
      .nullable()
      .describe('Scientist(s) credited with discovery. Null for elements known since antiquity.'),
    appearance: z
      .string()
      .nullable()
      .describe(
        'Physical appearance description. Null for synthetic elements not macroscopically observed.',
      ),
    phase_at_stp: z
      .string()
      .describe('Phase at standard temperature and pressure: Solid, Liquid, or Gas.'),
    radioactive: z.boolean().describe('True if all isotopes are radioactive (no stable isotopes).'),
    natural: z.boolean().describe('True if the element occurs naturally on Earth.'),
    dataset_version: z.string().describe('Data source version identifier.'),
  }),

  errors: [
    {
      reason: 'no_match',
      code: JsonRpcErrorCode.NotFound,
      when: 'No element matched the query.',
      recovery:
        'Use ref_element_search to browse by category, or check the IUPAC name or symbol spelling.',
    },
  ],

  handler(input, ctx) {
    if (!input.query.trim()) {
      throw ctx.fail(
        'no_match',
        'Empty query. Provide an element name, symbol, or atomic number.',
        ctx.recoveryFor('no_match'),
      );
    }
    const el = getElementsService().lookup(input.query, input.by, ctx);
    if (!el) {
      throw ctx.fail(
        'no_match',
        `No element matched "${input.query}". Use ref_element_search to browse by category, or check the IUPAC name or symbol spelling.`,
        ctx.recoveryFor('no_match'),
      );
    }
    return {
      number: el.number,
      symbol: el.symbol,
      name: el.name,
      atomic_mass: el.atomic_mass,
      atomic_mass_estimated: el.atomic_mass_estimated,
      electron_configuration: el.electron_configuration,
      group: el.group,
      period: el.period,
      block: el.block,
      category: el.category,
      electronegativity_pauling: el.electronegativity_pauling,
      density_g_per_cm3: el.density_g_per_cm3,
      melting_point_k: el.melting_point_k,
      boiling_point_k: el.boiling_point_k,
      discovery_year: el.discovery_year,
      discovery_scientists: el.discovery_scientists,
      appearance: el.appearance,
      phase_at_stp: el.phase_at_stp,
      radioactive: el.radioactive,
      natural: el.natural,
      dataset_version: DATASET_VERSION,
    };
  },

  format: (result) => {
    const lines = [
      `# ${result.symbol} — ${result.name} (Z=${result.number})`,
      `**Category:** ${result.category} | **Period:** ${result.period} | **Group:** ${result.group ?? 'N/A'} | **Block:** ${result.block}`,
      `**Atomic mass:** ${result.atomic_mass != null ? `${result.atomic_mass} u${result.atomic_mass_estimated ? ' (estimated)' : ''}` : 'N/A'}`,
      `**Electron configuration:** ${result.electron_configuration}`,
      `**Phase at STP:** ${result.phase_at_stp}`,
      `**Radioactive:** ${result.radioactive ? 'Yes' : 'No'} | **Natural:** ${result.natural ? 'Yes' : 'No'}`,
      '',
      `**Electronegativity (Pauling):** ${result.electronegativity_pauling ?? 'N/A'}`,
      `**Density:** ${result.density_g_per_cm3 != null ? `${result.density_g_per_cm3} g/cm³` : 'N/A'}`,
      `**Melting point:** ${result.melting_point_k != null ? `${result.melting_point_k} K` : 'N/A'}`,
      `**Boiling point:** ${result.boiling_point_k != null ? `${result.boiling_point_k} K` : 'N/A'}`,
      `**Appearance:** ${result.appearance ?? 'N/A'}`,
      '',
      result.discovery_year == null && result.discovery_scientists === 'Ancient'
        ? '**Discovered:** Known since antiquity'
        : `**Discovered:** ${result.discovery_year ?? 'unknown year'} by ${result.discovery_scientists ?? 'unknown'}`,
      `**Dataset:** ${result.dataset_version}`,
    ];
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
