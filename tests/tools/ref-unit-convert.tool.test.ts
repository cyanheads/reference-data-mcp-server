/**
 * @fileoverview Tests for the ref_unit_convert tool.
 * @module tests/tools/ref-unit-convert.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refUnitConvert } from '@/mcp-server/tools/definitions/ref-unit-convert.tool.js';
import { initUnitsService } from '@/services/units/units-service.js';
import { expectText } from '../test-helpers.js';

beforeAll(() => {
  initUnitsService();
});

describe('refUnitConvert', () => {
  it('converts kilometers to miles', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: 'km', to: 'mi' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result.value).toBe(1);
    expect(result.from_unit).toBe('km');
    expect(result.to_unit).toBe('mi');
    expect(result.result).toBeCloseTo(0.621371, 4);
    expect(result.measure).toBe('length');
    expect(result.result_precision).toBeTruthy();
  });

  it('converts kilograms to pounds', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: 'kg', to: 'lb' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result.result).toBeCloseTo(2.20462, 3);
    expect(result.measure).toBe('mass');
  });

  it('converts Celsius to Fahrenheit (non-linear)', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 0, from: 'C', to: 'F' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result.result).toBeCloseTo(32, 2);
    expect(result.measure).toBe('temperature');
  });

  it('converts 100 Celsius to Fahrenheit', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 100, from: 'C', to: 'F' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result.result).toBeCloseTo(212, 2);
  });

  it('converts liters to gallons', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: 'l', to: 'gal' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result.result).toBeCloseTo(0.264172, 4);
    expect(result.measure).toBe('volume');
  });

  it('converts watts to kilowatts', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1000, from: 'W', to: 'kW' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result.result).toBeCloseTo(1, 4);
    expect(result.measure).toBe('power');
  });

  it('throws for unrecognized from unit', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: 'xyzzy_unit', to: 'km' });
    expect(() => refUnitConvert.handler(input, ctx)).toThrow(/Unrecognized unit/);
  });

  it('throws for unrecognized to unit', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: 'km', to: 'xyzzy_unit' });
    expect(() => refUnitConvert.handler(input, ctx)).toThrow(/Unrecognized unit/);
  });

  it('throws for mismatched measures', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: 'km', to: 'kg' });
    expect(() => refUnitConvert.handler(input, ctx)).toThrow(/Cannot convert/);
  });

  it('throws for temperature below absolute zero', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: -600, from: 'F', to: 'K' });
    expect(() => refUnitConvert.handler(input, ctx)).toThrow(/absolute zero/i);
  });

  it('accepts -273.15 C (absolute zero, exact boundary)', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: -273.15, from: 'C', to: 'K' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result.result).toBeCloseTo(0, 1);
  });

  it('accepts -459.67 F (absolute zero in Fahrenheit, should not be rejected)', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: -459.67, from: 'F', to: 'C' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result.result).toBeCloseTo(-273.15, 1);
  });

  it('below_absolute_zero error message states the input kelvin equivalent clearly', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: -300, from: 'C', to: 'F' });
    expect(() => refUnitConvert.handler(input, ctx)).toThrow(
      /converts to.*K.*below absolute zero/i,
    );
  });

  it('formats output with value, units, result, and measure', () => {
    const output = {
      value: 1,
      from_unit: 'km',
      to_unit: 'mi',
      result: 0.621371192237334,
      result_precision: '0.6214',
      measure: 'length',
    };
    const blocks = refUnitConvert.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('1 km');
    expect(text).toContain('mi');
    expect(text).toContain('0.6214');
    expect(text).toContain('0.621371192237334');
    expect(text).toContain('length');
  });
});
