/**
 * @fileoverview Tests for the ref_unit_convert tool.
 * @module tests/tools/ref-unit-convert.tool.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext, runToolContract } from '@cyanheads/mcp-ts-core/testing';
import convert from 'convert-units';
import { beforeAll, describe, expect, it } from 'vitest';
import { refUnitConvert } from '@/mcp-server/tools/definitions/ref-unit-convert.tool.js';
import { initUnitsService } from '@/services/units/units-service.js';
import { expectText } from '../test-helpers.js';

beforeAll(() => {
  initUnitsService();
});

/** Run the handler and return the thrown error, or fail when it returns. */
function thrownBy(raw: { value: number; from: string; to: string }): unknown {
  const ctx = createMockContext({ errors: refUnitConvert.errors });
  try {
    refUnitConvert.handler(refUnitConvert.input.parse(raw), ctx);
  } catch (err) {
    return err;
  }
  throw new Error(`Expected ${JSON.stringify(raw)} to fail`);
}

/** Description measure names → convert-units measure names. */
const DESCRIBED_MEASURES: Record<string, string> = {
  length: 'length',
  mass: 'mass',
  volume: 'volume',
  temperature: 'temperature',
  speed: 'speed',
  pressure: 'pressure',
  energy: 'energy',
  power: 'power',
  frequency: 'frequency',
  'digital storage': 'digital',
  angle: 'angle',
};

/** Per-measure unit lists in the tool description: "length (mm, cm, …), …, and angle (…)". */
function describedUnitLists(): Map<string, string[]> {
  const supports = refUnitConvert.description.split('Supports: ')[1]!.split('. Incompatible')[0]!;
  const lists = new Map<string, string[]>();
  for (const [, name, items] of supports.matchAll(/(?:and )?([a-z][a-z ]*) \(([^)]+)\)/g)) {
    // An item is a spelling list ("m/h or mi/h") optionally glossed after " = " or " — ".
    const spellings = items!
      .split(', ')
      .flatMap((item) => item.split(/ = | — /)[0]!.split(' or '))
      .map((s) => s.trim());
    lists.set(name!, spellings);
  }
  return lists;
}

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

  it('converts the library spelling m/h as mile per hour (unchanged by the aliases)', async () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 60, from: 'm/h', to: 'km/h' });
    const result = await refUnitConvert.handler(input, ctx);
    expect(result).toEqual({
      value: 60,
      from_unit: 'm/h',
      to_unit: 'km/h',
      result: 96.56064,
      result_precision: '96.5606',
      measure: 'speed',
    });
  });

  it('accepts mph and echoes it on both surfaces (#40)', async () => {
    const result = await runToolContract(refUnitConvert, { value: 60, from: 'mph', to: 'km/h' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      value: 60,
      from_unit: 'mph',
      to_unit: 'km/h',
      result: 96.56064,
      result_precision: '96.5606',
      measure: 'speed',
    });
    expect(expectText(result.content)).toContain('**60 mph** = **96.5606 km/h**');
  });

  it.each([
    ['km/h', 'kph', 60],
    ['mph', 'kph', 96.56064],
    ['mi/h', 'm/h', 60],
    ['kph', 'mi/h', 37.28227153424004],
  ])('converts 60 %s to %s with the caller spelling echoed (#40)', async (from, to, expected) => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const result = await refUnitConvert.handler(
      refUnitConvert.input.parse({ value: 60, from, to }),
      ctx,
    );
    expect(result).toMatchObject({ from_unit: from, to_unit: to, measure: 'speed' });
    expect(result.result).toBeCloseTo(expected, 9);
  });

  it('names the caller spelling in incompatible_units for an alias (#40)', () => {
    expect(thrownBy({ value: 60, from: 'mph', to: 'kg' })).toMatchObject({
      code: JsonRpcErrorCode.ValidationError,
      data: { reason: 'incompatible_units' },
      message: expect.stringContaining('Cannot convert "mph" (speed) to "kg" (mass)'),
    });
  });

  it.each(['MPH', 'Mph', 'KPH', 'kmh', 'knots', 'constructor', '__proto__', 'toString'])(
    'rejects %j as unknown_unit',
    (unit) => {
      expect(thrownBy({ value: 1, from: unit, to: 'km/h' })).toMatchObject({
        data: { reason: 'unknown_unit' },
        message: expect.stringContaining(`Unrecognized unit "${unit}"`),
      });
    },
  );

  it('aliases only spellings absent from every convert-units measure', () => {
    const libraryUnits = convert().possibilities();
    for (const alias of ['mph', 'mi/h', 'kph']) expect(libraryUnits).not.toContain(alias);
  });

  it('converts every unit spelling the definition advertises', async () => {
    const lists = describedUnitLists();
    expect([...lists.keys()].sort()).toEqual(Object.keys(DESCRIBED_MEASURES).sort());
    const fieldExamples = [refUnitConvert.input.shape.from, refUnitConvert.input.shape.to].flatMap(
      (field) => [...(field.description ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]!),
    );
    const recovery = refUnitConvert.errors!.find((e) => e.reason === 'unknown_unit')!.recovery;
    const recoveryList = recovery.split(': ')[1]!.split('. ')[0]!.split(', ');
    const advertised = new Set([...[...lists.values()].flat(), ...fieldExamples, ...recoveryList]);
    expect([...advertised]).toEqual(expect.arrayContaining(['mph', 'kph', 'm/h', 'mi/h']));
    for (const [name, spellings] of lists) {
      for (const unit of spellings) {
        const ctx = createMockContext({ errors: refUnitConvert.errors });
        const result = await refUnitConvert.handler(
          refUnitConvert.input.parse({ value: 1, from: unit, to: unit }),
          ctx,
        );
        expect(result.measure, `${unit} listed under ${name}`).toBe(DESCRIBED_MEASURES[name]);
      }
    }
    for (const unit of advertised) {
      const ctx = createMockContext({ errors: refUnitConvert.errors });
      const input = refUnitConvert.input.parse({ value: 1, from: unit, to: unit });
      expect(await refUnitConvert.handler(input, ctx), unit).toMatchObject({ result: 1 });
    }
  });

  it('unknown_unit carries a short message and a recovery naming one spelling per described measure', async () => {
    const result = await runToolContract(refUnitConvert, {
      value: 1,
      from: 'xyzzy_unit',
      to: 'km',
    });
    expect(result.isError).toBe(true);
    const error = (
      result.structuredContent as {
        error: { message: string; data: { reason: string; recovery: { hint: string } } };
      }
    ).error;
    expect(error.message).toBe('Unrecognized unit "xyzzy_unit".');
    expect(error.data.reason).toBe('unknown_unit');
    const { hint } = error.data.recovery;
    expect(hint).toContain('use "C" not "°C"');
    expect(expectText(result.content)).toContain(`Recovery: ${hint}`);
    const measures = new Set<string>();
    for (const unit of hint.split(': ')[1]!.split('. ')[0]!.split(', ')) {
      const ctx = createMockContext({ errors: refUnitConvert.errors });
      const converted = await refUnitConvert.handler(
        refUnitConvert.input.parse({ value: 1, from: unit, to: unit }),
        ctx,
      );
      measures.add(converted.measure);
    }
    expect([...measures].sort()).toEqual(Object.values(DESCRIBED_MEASURES).sort());
  });

  describe('results at the edge of the double range', () => {
    it('declares result_out_of_range as a notice-level ValidationError', () => {
      expect(refUnitConvert.errors!.find((e) => e.reason === 'result_out_of_range')).toMatchObject({
        code: JsonRpcErrorCode.ValidationError,
        severity: 'notice',
      });
    });

    it.each([
      // Linear, one system: the next km value past the last whose metre count fits.
      [1.797693134862316e305, 'km', 'm', 'Converting 1.797693134862316e+305 km to m'],
      [-1.797693134862316e305, 'km', 'm', 'Converting -1.797693134862316e+305 km to m'],
      // Temperature transform: the next C value past the last whose F reading fits.
      [9.987184082568422e307, 'C', 'F', 'Converting 9.987184082568422e+307 C to F'],
      // Alias spellings across systems (mile per hour → km/h ratio), echoed as sent.
      [1.1170347264862676e308, 'mph', 'kph', 'Converting 1.1170347264862676e+308 mph to kph'],
      [-1.1170347264862676e308, 'mph', 'kph', 'Converting -1.1170347264862676e+308 mph to kph'],
    ])(
      'fails %d %s to %s as result_out_of_range on both surfaces',
      async (value, from, to, lead) => {
        const result = await runToolContract(refUnitConvert, { value, from, to });
        expect(result.isError).toBe(true);
        const { error } = result.structuredContent as {
          error: {
            code: number;
            message: string;
            data: { reason: string; recovery: { hint: string } };
          };
        };
        const message = `${lead} gives a result outside the range a number can hold.`;
        expect(error.code).toBe(JsonRpcErrorCode.ValidationError);
        expect(error.message).toBe(message);
        expect(error.data.reason).toBe('result_out_of_range');
        expect(error.data.recovery.hint).toContain('smaller magnitude');
        expect(error.data.recovery.hint).toContain('larger unit');
        const text = expectText(result.content);
        expect(text).toContain(`Error: ${message}`);
        expect(text).toContain(`Recovery: ${error.data.recovery.hint}`);
        expect(text).toContain('(reason result_out_of_range');
      },
    );

    it.each([
      [1.7976931348623156e305, 'km', 'm', 1.7976931348623155e308],
      [-1.7976931348623156e305, 'km', 'm', -1.7976931348623155e308],
      [9.98718408256842e307, 'C', 'F', 1.7976931348623155e308],
      [1.1170347264862674e308, 'mph', 'kph', Number.MAX_VALUE],
    ])(
      'still converts %d %s to %s, the largest finite result on its path',
      async (value, from, to, expected) => {
        const result = await runToolContract(refUnitConvert, { value, from, to });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toMatchObject({
          value,
          from_unit: from,
          to_unit: to,
          result: expected,
        });
      },
    );

    it.each([
      [1e308, 6.213712121212122e307, '6.213712121212122e+307'],
      [-1e308, -6.213712121212122e307, '-6.213712121212122e+307'],
    ])(
      'converts %d km to mi, whose result fits though km → m does not',
      async (value, expected, printed) => {
        const result = await runToolContract(refUnitConvert, { value, from: 'km', to: 'mi' });
        expect(result.isError).toBeFalsy();
        expect(result.structuredContent).toEqual({
          value,
          from_unit: 'km',
          to_unit: 'mi',
          result: expected,
          result_precision: printed,
          measure: 'length',
        });
        expect(expectText(result.content)).toContain(`Full precision: ${printed}`);
      },
    );

    it('reports a hugely negative temperature as below_absolute_zero, never out of range', () => {
      expect(thrownBy({ value: -1e308, from: 'C', to: 'F' })).toMatchObject({
        data: { reason: 'below_absolute_zero' },
      });
    });
  });
});
