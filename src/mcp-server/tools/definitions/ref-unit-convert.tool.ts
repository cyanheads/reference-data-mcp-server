/**
 * @fileoverview Tool for converting a numeric value between compatible units of measure.
 * @module mcp-server/tools/definitions/ref-unit-convert
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { internalError, JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getUnitsService } from '@/services/units/units-service.js';

export const refUnitConvert = tool('ref_unit_convert', {
  title: 'Unit Conversion',
  description:
    'Convert a numeric value between compatible units of measure. Supports: length (mm, cm, m, km, in, ft, yd, mi), mass (mcg, mg, g, kg, oz, lb, mt = metric tonne / 1000 kg, t = US short ton / 907.18 kg), volume (ml, cl, dl, l, kl, tsp, Tbs, fl-oz, cup, pnt, qt, gal, m3), temperature (C, F, K, R — non-linear conversions handled), speed (m/s, km/h, kph, mph, m/h or mi/h = mile per hour, knot, ft/s), pressure (Pa, kPa, MPa, hPa, bar, torr, psi), energy (J, kJ, Wh, kWh, MWh), power (W, mW, kW, MW, GW), frequency (Hz, kHz, MHz, GHz), digital storage (b, Kb, Mb, Gb, Tb, B, KB, MB, GB, TB), and angle (deg, rad, grad). Incompatible units (e.g., km to kg) return an error identifying the quantity mismatch.',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    value: z.number().describe('Numeric quantity to convert.'),
    from: z.string().describe('Source unit abbreviation (e.g., "km", "C", "mph", "kWh", "kg").'),
    to: z.string().describe('Target unit abbreviation (e.g., "mi", "F", "m/s", "kJ", "lb").'),
  }),

  output: z.object({
    value: z.number().describe('Input value as provided.'),
    from_unit: z.string().describe('Source unit as provided.'),
    to_unit: z.string().describe('Target unit as provided.'),
    result: z.number().describe('Converted value (full precision float).'),
    result_precision: z.string().describe('Human-readable rounded form of the result.'),
    measure: z
      .string()
      .describe('Physical quantity being measured (e.g., "length", "mass", "temperature").'),
  }),

  errors: [
    {
      reason: 'incompatible_units',
      code: JsonRpcErrorCode.ValidationError,
      when: 'The source and target units measure different physical quantities.',
      recovery:
        'Ensure both from and to units measure the same physical quantity (e.g., both length, both mass, both temperature).',
    },
    {
      reason: 'unknown_unit',
      code: JsonRpcErrorCode.ValidationError,
      when: 'One or both units are not recognized by the underlying library.',
      recovery:
        'Use standard unit abbreviations: km, kg, l, C, mph, Pa, kWh, W, Hz, GB, deg. Check for typos or degree symbols (use "C" not "°C").',
    },
    {
      reason: 'below_absolute_zero',
      code: JsonRpcErrorCode.ValidationError,
      when: 'The input temperature is below absolute zero (0 K = -273.15 °C = -459.67 °F).',
      recovery:
        'Provide a temperature at or above absolute zero. Absolute zero is 0 K, -273.15 C, or -459.67 F.',
    },
    {
      reason: 'result_out_of_range',
      code: JsonRpcErrorCode.ValidationError,
      when: 'The converted result, in either sign, is larger in magnitude than the largest double-precision number (1.7976931348623157e308).',
      recovery:
        'Convert a value of smaller magnitude, or convert to a larger unit (e.g., km instead of mm) so the result fits.',
      severity: 'notice',
    },
  ],

  handler(input, ctx) {
    const outcome = getUnitsService().convert(input.value, input.from, input.to, ctx);
    if ('error' in outcome) {
      const err = outcome;
      if (err.error === 'unknown_unit') {
        throw ctx.fail('unknown_unit', `Unrecognized unit "${err.unit}".`);
      }
      if (err.error === 'incompatible_units') {
        throw ctx.fail(
          'incompatible_units',
          `Cannot convert "${err.from}" (${err.from_measure}) to "${err.to}" (${err.to_measure}) — different physical quantities. Ensure both units measure the same quantity.`,
        );
      }
      if (err.error === 'below_absolute_zero') {
        throw ctx.fail(
          'below_absolute_zero',
          `Temperature ${err.value} ${err.from} converts to ${err.kelvin_equivalent.toFixed(2)} K, which is below absolute zero (0 K = -273.15 °C = -459.67 °F).`,
        );
      }
      if (err.error === 'result_out_of_range') {
        throw ctx.fail(
          'result_out_of_range',
          `Converting ${err.value} ${err.from} to ${err.to} gives a result outside the range a number can hold.`,
        );
      }
      throw internalError('Unexpected conversion error.');
    }
    return outcome;
  },

  format: (result) => {
    const lines = [
      `**${result.value} ${result.from_unit}** = **${result.result_precision} ${result.to_unit}**`,
      `Full precision: ${result.result}`,
      `Measure: ${result.measure}`,
    ];
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
