/**
 * @fileoverview Units conversion service — wraps convert-units library.
 * @module services/units/units-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import convert from 'convert-units';

export interface ConversionResult {
  from_unit: string;
  measure: string;
  result: number;
  result_precision: string;
  to_unit: string;
  value: number;
}

function formatPrecision(n: number): string {
  if (Math.abs(n) >= 1000) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  if (Math.abs(n) >= 0.001) return n.toFixed(6);
  return n.toExponential(4);
}

/**
 * Everyday spellings convert-units lacks, mapped to its own unit ("m/h" is its mile per hour).
 * Exact and case-sensitive like library units (`mW` and `MW` differ), and a Map so prototype keys
 * such as "constructor" never match. Only spellings absent from every library measure belong here.
 */
const UNIT_ALIASES = new Map([
  ['mph', 'm/h'],
  ['mi/h', 'm/h'],
  ['kph', 'km/h'],
]);

function getMeasureForUnit(unitStr: string): string | null {
  try {
    for (const measure of convert().measures()) {
      if (convert().possibilities(measure).includes(unitStr)) return measure;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export type ConversionError =
  | { error: 'unknown_unit'; unit: string; which: 'from' | 'to' }
  | {
      error: 'incompatible_units';
      from: string;
      to: string;
      from_measure: string;
      to_measure: string;
    }
  | { error: 'below_absolute_zero'; from: string; value: number; kelvin_equivalent: number }
  | { error: 'result_out_of_range'; value: number; from: string; to: string };

export class UnitsService {
  convert(
    value: number,
    from: string,
    to: string,
    ctx: Context,
  ): ConversionResult | ConversionError {
    ctx.log.debug('Unit convert', { value, from, to });

    // Library spellings drive every convert-units call; results and errors keep the caller's.
    const fromUnit = UNIT_ALIASES.get(from) ?? from;
    const toUnit = UNIT_ALIASES.get(to) ?? to;

    // Validate both units exist
    const fromMeasure = getMeasureForUnit(fromUnit);
    const toMeasure = getMeasureForUnit(toUnit);

    if (!fromMeasure) {
      return { error: 'unknown_unit', unit: from, which: 'from' };
    }

    if (!toMeasure) {
      return { error: 'unknown_unit', unit: to, which: 'to' };
    }

    if (fromMeasure !== toMeasure) {
      return {
        error: 'incompatible_units',
        from,
        to,
        from_measure: fromMeasure,
        to_measure: toMeasure,
      };
    }

    // Physical validation: reject temperatures below absolute zero
    if (fromMeasure === 'temperature') {
      let kelvin_equivalent: number;
      try {
        kelvin_equivalent = convert(value).from(fromUnit).to('K');
      } catch {
        kelvin_equivalent = NaN;
      }
      // Use a small epsilon to absorb float imprecision (e.g., -459.67 F = 0 K exactly but
      // the library may compute a tiny negative value like -1.4e-13).
      if (!Number.isNaN(kelvin_equivalent) && kelvin_equivalent < -1e-9) {
        return { error: 'below_absolute_zero', from, value, kelvin_equivalent };
      }
    }

    let result: number;
    try {
      result = convert(value).from(fromUnit).to(toUnit);
    } catch (err) {
      throw new Error(
        `Unit conversion from "${from}" to "${to}" failed: ${err instanceof Error ? err.message : String(err)}. Ensure both units measure the same quantity.`,
      );
    }

    /**
     * convert-units scales to its anchor unit first (km → m), which overflows for some values
     * whose result still fits (1e308 km is 6.2e307 mi). Every measure but temperature is linear,
     * so the result is the value times the one-unit factor; only a result that is itself beyond
     * a double fails. Temperature's shift-and-scale path overflows only when its result does.
     */
    if (!Number.isFinite(result) && fromMeasure !== 'temperature') {
      result = value * convert(1).from(fromUnit).to(toUnit);
    }
    if (!Number.isFinite(result)) {
      return { error: 'result_out_of_range', value, from, to };
    }

    return {
      value,
      from_unit: from,
      to_unit: to,
      result,
      result_precision: formatPrecision(result),
      measure: fromMeasure,
    };
  }
}

// --- Init/accessor pattern ---

let _service: UnitsService | undefined;

export function initUnitsService(): void {
  _service = new UnitsService();
}

export function getUnitsService(): UnitsService {
  if (!_service)
    throw new Error('UnitsService not initialized — call initUnitsService() in setup()');
  return _service;
}
