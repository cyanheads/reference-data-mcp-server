/**
 * @fileoverview Resource for fetching a full element record by atomic number.
 * @module mcp-server/resources/definitions/ref-elements
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { notFound } from '@cyanheads/mcp-ts-core/errors';
import { DATASET_VERSION, getElementsService } from '@/services/elements/elements-service.js';

export const refElementsResource = resource('ref://elements/{number}', {
  name: 'ref-element',
  description:
    'Full periodic table element record by atomic number (e.g., ref://elements/6 for Carbon). Returns all properties: symbol, name, atomic mass, electron configuration, group, period, block, category, electronegativity, density, melting/boiling points, and discovery data.',
  mimeType: 'application/json',
  cacheHint: { ttlMs: 86_400_000, cacheScope: 'public' },

  params: z.object({
    number: z
      .string()
      .describe('Atomic number as a string (1–118, e.g., "6" for Carbon, "79" for Gold).'),
  }),

  output: z.object({
    number: z.number().int().describe('Atomic number.'),
    symbol: z.string().describe('Chemical symbol.'),
    name: z.string().describe('IUPAC element name.'),
    atomic_mass: z
      .number()
      .nullable()
      .describe(
        'Atomic mass in unified atomic mass units. Null for unstable elements with no standard mass.',
      ),
    atomic_mass_estimated: z
      .boolean()
      .describe(
        'True when the atomic mass is estimated or based on the most stable isotope rather than a natural abundance average.',
      ),
    electron_configuration: z.string().describe('Electron configuration (noble gas shorthand).'),
    group: z
      .number()
      .int()
      .nullable()
      .describe('Periodic table group (1–18), or null for lanthanides/actinides.'),
    period: z.number().int().describe('Periodic table period (1–7).'),
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
    density_g_per_cm3: z.number().nullable().describe('Density in g/cm³, or null.'),
    melting_point_k: z.number().nullable().describe('Melting point in K, or null.'),
    boiling_point_k: z.number().nullable().describe('Boiling point in K, or null.'),
    discovery_year: z
      .number()
      .int()
      .nullable()
      .describe('Discovery year, or null for ancient elements.'),
    discovery_scientists: z.string().nullable().describe('Discovery scientists, or null.'),
    appearance: z.string().nullable().describe('Physical appearance description, or null.'),
    phase_at_stp: z.string().describe('Phase at STP: Solid, Liquid, or Gas.'),
    radioactive: z.boolean().describe('True if no stable isotopes.'),
    natural: z.boolean().describe('True if occurs naturally.'),
    dataset_version: z.string().describe('Dataset version identifier.'),
  }),

  handler(params) {
    const num = parseInt(params.number, 10);
    if (Number.isNaN(num) || num < 1 || num > 118) {
      throw notFound(
        `Atomic number "${params.number}" is not valid. Use an integer from 1 to 118.`,
        { number: params.number },
      );
    }
    const el = getElementsService().getByNumber(num);
    if (!el) {
      throw notFound(`Element with atomic number ${num} not found.`, { number: num });
    }
    return { ...el, dataset_version: DATASET_VERSION };
  },
});
