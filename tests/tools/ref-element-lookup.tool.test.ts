/**
 * @fileoverview Tests for the ref_element_lookup tool.
 * @module tests/tools/ref-element-lookup.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refElementLookup } from '@/mcp-server/tools/definitions/ref-element-lookup.tool.js';
import { initElementsService } from '@/services/elements/elements-service.js';

beforeAll(() => {
  initElementsService();
});

describe('refElementLookup', () => {
  it('looks up Carbon by name', async () => {
    const ctx = createMockContext();
    const input = refElementLookup.input.parse({ query: 'carbon' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.number).toBe(6);
    expect(result.symbol).toBe('C');
    expect(result.name).toBe('Carbon');
    expect(result.period).toBe(2);
    expect(result.block).toBe('p');
    expect(result.phase_at_stp).toBe('Solid');
    expect(result.radioactive).toBe(false);
    expect(result.natural).toBe(true);
    expect(result.dataset_version).toBeTruthy();
  });

  it('looks up Tungsten by symbol', async () => {
    const ctx = createMockContext();
    const input = refElementLookup.input.parse({ query: 'W', by: 'symbol' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.number).toBe(74);
    expect(result.symbol).toBe('W');
    expect(result.name).toBe('Tungsten');
  });

  it('looks up Gold by atomic number string', async () => {
    const ctx = createMockContext();
    const input = refElementLookup.input.parse({ query: '79', by: 'number' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.number).toBe(79);
    expect(result.symbol).toBe('Au');
    expect(result.name).toBe('Gold');
  });

  it('auto mode resolves by number first', async () => {
    const ctx = createMockContext();
    const input = refElementLookup.input.parse({ query: '1' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.number).toBe(1);
    expect(result.symbol).toBe('H');
  });

  it('returns null for sparse fields on synthetic elements', async () => {
    const ctx = createMockContext();
    // Oganesson (118) — synthetic, very limited data
    const input = refElementLookup.input.parse({ query: '118', by: 'number' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.number).toBe(118);
    // Synthetic elements have null for many properties
    expect(result.radioactive).toBe(true);
    expect(result.natural).toBe(false);
  });

  it('throws for unrecognized query', async () => {
    const ctx = createMockContext({ errors: refElementLookup.errors });
    const input = refElementLookup.input.parse({ query: 'notanelement12345' });
    expect(() => refElementLookup.handler(input, ctx)).toThrow(/No element matched/);
  });

  it('resolves the IUPAC spelling Aluminium via the auto branch (#34)', async () => {
    const ctx = createMockContext();
    const input = refElementLookup.input.parse({ query: 'Aluminium' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.symbol).toBe('Al');
    expect(result.number).toBe(13);
    expect(result.name).toBe('Aluminum');
  });

  it('resolves Caesium with explicit by:"name" (#34 — the branch most likely to be missed)', async () => {
    const ctx = createMockContext();
    const input = refElementLookup.input.parse({ query: 'Caesium', by: 'name' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.symbol).toBe('Cs');
    expect(result.number).toBe(55);
  });

  it('resolves the British spelling Sulphur (#34)', async () => {
    const ctx = createMockContext();
    const input = refElementLookup.input.parse({ query: 'Sulphur' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.symbol).toBe('S');
    expect(result.number).toBe(16);
  });

  it('leaves an unrelated fuzzy name lookup unaffected by the alias map (#34 control)', async () => {
    const ctx = createMockContext();
    // A prefix fuzzy match with no alias-map entry must still resolve via startsWith.
    const input = refElementLookup.input.parse({ query: 'heliu' });
    const result = await refElementLookup.handler(input, ctx);
    expect(result.symbol).toBe('He');
    expect(result.name).toBe('Helium');
  });

  it('formats output with symbol, name, and atomic number', () => {
    const output = {
      number: 6,
      symbol: 'C',
      name: 'Carbon',
      atomic_mass: 12.011,
      atomic_mass_estimated: false,
      electron_configuration: '[He] 2s2 2p2',
      group: 14,
      period: 2,
      block: 'p',
      category: 'reactive nonmetal',
      electronegativity_pauling: 2.55,
      density_g_per_cm3: 2.267,
      melting_point_k: 3823,
      boiling_point_k: 4098,
      discovery_year: null,
      discovery_scientists: null,
      appearance: 'black (graphite) or clear (diamond)',
      phase_at_stp: 'Solid',
      radioactive: false,
      natural: true,
      dataset_version: 'PubChem/IUPAC 2024',
    };
    const blocks = refElementLookup.format!(output);
    expect(blocks.length).toBeGreaterThan(0);
    const text = blocks[0]!.text as string;
    expect(text).toContain('C');
    expect(text).toContain('Carbon');
    expect(text).toContain('Z=6');
    expect(text).toContain('12.011');
    expect(text).toContain('PubChem/IUPAC 2024');
  });

  it('formats antiquity elements as "Known since antiquity"', () => {
    const output = {
      number: 6,
      symbol: 'C',
      name: 'Carbon',
      atomic_mass: 12.011,
      atomic_mass_estimated: false,
      electron_configuration: '[He] 2s2 2p2',
      group: 14,
      period: 2,
      block: 'p',
      category: 'reactive nonmetal',
      electronegativity_pauling: 2.55,
      density_g_per_cm3: 2.267,
      melting_point_k: 3823,
      boiling_point_k: 4098,
      discovery_year: null,
      discovery_scientists: 'Ancient',
      appearance: 'black (graphite) or clear (diamond)',
      phase_at_stp: 'Solid',
      radioactive: false,
      natural: true,
      dataset_version: 'PubChem/IUPAC 2024',
    };
    const blocks = refElementLookup.format!(output);
    const text = blocks[0]!.text as string;
    expect(text).toContain('Known since antiquity');
    expect(text).not.toContain('Ancient by Ancient');
  });

  it('formats null properties as N/A', () => {
    const output = {
      number: 118,
      symbol: 'Og',
      name: 'Oganesson',
      atomic_mass: null,
      atomic_mass_estimated: true,
      electron_configuration: '[Rn] 5f14 6d10 7s2 7p6',
      group: 18,
      period: 7,
      block: 'p',
      category: 'noble gas',
      electronegativity_pauling: null,
      density_g_per_cm3: null,
      melting_point_k: null,
      boiling_point_k: null,
      discovery_year: 2002,
      discovery_scientists: 'Oganessian et al.',
      appearance: null,
      phase_at_stp: 'Solid',
      radioactive: true,
      natural: false,
      dataset_version: 'PubChem/IUPAC 2024',
    };
    const blocks = refElementLookup.format!(output);
    const text = blocks[0]!.text as string;
    expect(text).toContain('N/A');
    expect(text).toContain('Og');
    expect(text).toContain('Oganesson');
  });
});
