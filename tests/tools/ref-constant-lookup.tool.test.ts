/**
 * @fileoverview Tests for the ref_constant_lookup tool.
 * @module tests/tools/ref-constant-lookup.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refConstantLookup } from '@/mcp-server/tools/definitions/ref-constant-lookup.tool.js';
import { initConstantsService } from '@/services/constants/constants-service.js';

beforeAll(() => {
  initConstantsService();
});

describe('refConstantLookup', () => {
  it('returns speed of light by exact name', async () => {
    const ctx = createMockContext();
    const input = refConstantLookup.input.parse({ query: 'speed of light' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.name).toContain('light');
    expect(result.value).toBeGreaterThan(0);
    expect(result.symbol).toBeTruthy();
    expect(result.unit).toBeTruthy();
    expect(result.dataset_version).toBeTruthy();
  });

  it('resolves by symbol shorthand', async () => {
    const ctx = createMockContext();
    const input = refConstantLookup.input.parse({ query: 'c' });
    const result = await refConstantLookup.handler(input, ctx);
    // speed of light symbol is 'c'
    expect(result.value).toBeGreaterThan(0);
    expect(result.symbol).toBeTruthy();
  });

  it('reports match_strategy "exact_symbol" for a case-sensitive symbol hit', async () => {
    const ctx = createMockContext();
    // Capital G is the gravitational constant — a case-sensitive symbol match.
    const input = refConstantLookup.input.parse({ query: 'G' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.symbol).toBe('G');
    expect(result.match_strategy).toBe('exact_symbol');
  });

  it('reports match_strategy "exact_name" for an exact name/alias hit', async () => {
    const ctx = createMockContext();
    const input = refConstantLookup.input.parse({ query: 'speed of light' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.match_strategy).toBe('exact_name');
  });

  it('reports match_strategy "fuzzy" for a partial query', async () => {
    const ctx = createMockContext();
    // "electron" is not an exact constant name — it partial-matches several.
    const input = refConstantLookup.input.parse({ query: 'electron' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.match_strategy).toBe('fuzzy');
  });

  it('resolves Planck constant by name', async () => {
    const ctx = createMockContext();
    const input = refConstantLookup.input.parse({ query: 'Planck constant' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.name.toLowerCase()).toContain('planck');
    expect(result.value).toBeGreaterThan(0);
    expect(result.exact).toBe(true); // 2019 SI redefinition made it exact
  });

  it('returns exact: true for defined constants', async () => {
    const ctx = createMockContext();
    const input = refConstantLookup.input.parse({ query: 'speed of light' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.exact).toBe(true);
    expect(result.uncertainty).toBeNull();
  });

  it('throws for unrecognized query', async () => {
    const ctx = createMockContext({ errors: refConstantLookup.errors });
    const input = refConstantLookup.input.parse({ query: 'xyzzy_nonexistent_constant_12345' });
    expect(() => refConstantLookup.handler(input, ctx)).toThrow(/No physical constant matched/);
  });

  it('resolves capital G to gravitational constant (not standard gravity)', async () => {
    const ctx = createMockContext({ errors: refConstantLookup.errors });
    const input = refConstantLookup.input.parse({ query: 'G' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.name).toBe('gravitational constant');
    expect(result.symbol).toBe('G');
    expect(result.value).toBeCloseTo(6.674e-11, 5);
  });

  it('resolves lowercase g to standard gravity (not gravitational constant)', async () => {
    const ctx = createMockContext({ errors: refConstantLookup.errors });
    const input = refConstantLookup.input.parse({ query: 'g' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.name).toBe('standard acceleration of gravity');
    expect(result.value).toBeCloseTo(9.80665, 4);
  });

  it('returns related constants for direct name lookup', async () => {
    const ctx = createMockContext({ errors: refConstantLookup.errors });
    const input = refConstantLookup.input.parse({ query: 'speed of light' });
    const result = await refConstantLookup.handler(input, ctx);
    expect(result.related).toBeInstanceOf(Array);
    expect(result.related.length).toBeGreaterThan(0);
  });

  it('returns related constants for fuzzy match', async () => {
    const ctx = createMockContext();
    const input = refConstantLookup.input.parse({ query: 'electron' });
    const result = await refConstantLookup.handler(input, ctx);
    // "electron" should fuzzy-match several electron-related constants
    expect(result.name).toBeTruthy();
    expect(result.related).toBeInstanceOf(Array);
  });

  it('formats output with name, value, unit, and symbol', () => {
    const output = {
      name: 'speed of light in vacuum',
      symbol: 'c',
      value: 299792458,
      unit: 'm s⁻¹',
      uncertainty: null,
      uncertainty_relative: 'exact (defined)',
      description: 'The speed of light.',
      codata_id: 'CODATA-c',
      exact: true,
      match_strategy: 'exact_name' as const,
      dataset_version: 'CODATA 2022',
      related: [{ name: 'Planck constant', symbol: 'h' }],
    };
    const blocks = refConstantLookup.format!(output);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]!.type).toBe('text');
    const text = blocks[0]!.text as string;
    expect(text).toContain('speed of light in vacuum');
    expect(text).toContain('299792458');
    expect(text).toContain('m s⁻¹');
    expect(text).toContain('CODATA 2022');
    expect(text).toContain('Planck constant');
    // match_strategy must render to satisfy format-parity.
    expect(text).toContain('exact_name');
  });

  it('formats a fuzzy match with a caution annotation', () => {
    const output = {
      name: 'some constant',
      symbol: 'X',
      value: 1.23,
      unit: 'kg',
      uncertainty: 0.01,
      uncertainty_relative: '8.1e-6',
      description: 'A test constant.',
      codata_id: null,
      exact: false,
      match_strategy: 'fuzzy' as const,
      dataset_version: 'CODATA 2022',
      related: [],
    };
    const blocks = refConstantLookup.format!(output);
    const text = blocks[0]!.text as string;
    expect(text).not.toContain('Related constants');
    expect(text).toContain('fuzzy');
  });
});
