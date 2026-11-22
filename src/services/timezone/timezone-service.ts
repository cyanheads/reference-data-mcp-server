/**
 * @fileoverview Timezone service — IANA timezone lookup, offset computation, and conversion.
 * Core offsets use Node.js Intl API; supplementary metadata from @vvo/tzdb.
 * @module services/timezone/timezone-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import { getTimeZones } from '@vvo/tzdb';
import { TimezoneResolver } from './timezone-resolver.js';
import type { ConversionResult, DatetimeIssue, TimezoneRecord } from './types.js';

/** Format UTC offset minutes as "+HH:MM" or "-HH:MM" */
function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60)
    .toString()
    .padStart(2, '0');
  const m = (abs % 60).toString().padStart(2, '0');
  return `${sign}${h}:${m}`;
}

/** Get current UTC offset in minutes for a timezone using Intl */
function getIntlOffsetMinutes(ianaId: string, at?: Date): number {
  const date = at ?? new Date();
  // Use Intl to get the offset: format a UTC timestamp and compare to local
  const utcMs = date.getTime();
  const localStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: ianaId,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  // Parse the formatted local time back to a Date
  const [datePart, timePart] = localStr.split(', ');
  if (!datePart || !timePart) return 0;
  const [year = 0, month = 1, day = 1] = datePart.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(':').map(Number);
  const localMs = Date.UTC(year, month - 1, day, hour, minute, second);
  return Math.round((localMs - utcMs) / 60000);
}

/** Format a Date as a local ISO 8601 datetime string (no offset suffix) using UTC getters */
function formatLocalDatetime(d: Date): string {
  return [
    d.getUTCFullYear(),
    '-',
    String(d.getUTCMonth() + 1).padStart(2, '0'),
    '-',
    String(d.getUTCDate()).padStart(2, '0'),
    'T',
    String(d.getUTCHours()).padStart(2, '0'),
    ':',
    String(d.getUTCMinutes()).padStart(2, '0'),
    ':',
    String(d.getUTCSeconds()).padStart(2, '0'),
  ].join('');
}

/**
 * Interpret a local wall-clock datetime as a UTC instant for a given zone, using two-step
 * offset refinement so DST transitions resolve correctly: estimate the offset at the naive
 * instant, then re-read it at the refined instant. Returns the UTC epoch ms and the resolved
 * source-zone offset (minutes). Shared by convert() and the datetime pre-validation so the
 * subtle two-pass logic lives in exactly one place.
 */
function localDatetimeToUtc(
  c: { year: number; month: number; day: number; hour: number; minute: number; second: number },
  resolvedTz: string,
): { utcMs: number; offsetMinutes: number } {
  const approxUtcMs = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
  const firstOffsetMin = getIntlOffsetMinutes(resolvedTz, new Date(approxUtcMs));
  const refinedUtcMs = approxUtcMs - firstOffsetMin * 60000;
  const offsetMinutes = getIntlOffsetMinutes(resolvedTz, new Date(refinedUtcMs));
  return { utcMs: approxUtcMs - offsetMinutes * 60000, offsetMinutes };
}

/** Get timezone abbreviation using Intl */
function getIntlAbbreviation(ianaId: string, at?: Date): string | null {
  const date = at ?? new Date();
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaId,
      timeZoneName: 'short',
    }).formatToParts(date);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? null;
  } catch {
    return null;
  }
}

export class TimezoneService {
  private readonly byIana: Map<
    string,
    { cities: string[]; countries: string[]; alternates: string[] }
  > = new Map();
  private readonly byCountry: Map<string, string[]> = new Map();
  private readonly resolver: TimezoneResolver;

  constructor() {
    const rows = getTimeZones();
    this.resolver = new TimezoneResolver(rows);
    for (const { name, mainCities, countryCode, group } of rows) {
      this.byIana.set(name, {
        cities: mainCities,
        countries: [countryCode],
        alternates: group.filter((id) => id !== name),
      });
      const existing = this.byCountry.get(countryCode) ?? [];
      existing.push(name);
      this.byCountry.set(countryCode, existing);
    }
  }

  /** Resolve an exact ID and build its record, without city or country lookup. */
  readNamedZone(query: string): TimezoneRecord | undefined {
    const id = this.resolver.exactId(query);
    return id ? this.buildRecord(id) : undefined;
  }

  /** Resolve conversion operands to candidates, including exact numeric UTC offsets. */
  conversionCandidates(query: string): string[] {
    return this.resolver.candidates(query, true);
  }

  /**
   * Validate that a format-checked local datetime is actually convertible from the source
   * zone, catching two silent-corruption cases the raw Date.UTC() path in convert() would
   * otherwise normalize away:
   *   1. Out-of-range calendar components (e.g. 2026-02-30, month 13, hour 25) — Date.UTC
   *      rolls these over, so round-trip the UTC getters against the parsed components.
   *   2. DST spring-forward gap — a wall-clock instant skipped by the clock jumping forward,
   *      which never physically occurs in the source zone. Interpret the input, then reformat
   *      the resulting UTC instant back to local time in the same zone: a gap time round-trips
   *      to a different wall clock. (Fall-back/ambiguous times round-trip to one of their two
   *      valid instants and are intentionally allowed — spring-forward gaps only.)
   *
   * Returns null when convertible, or a DatetimeIssue for the handler to raise as
   * invalid_datetime. The handler calls this after resolving the source timezone.
   */
  validateConvertibleDatetime(datetime: string, resolvedFromTz: string): DatetimeIssue | null {
    const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    // Format is enforced by the tool's input schema; a mismatch here has nothing to add.
    if (!match) return null;
    const [, year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = match.map(Number);

    // (1) Range / calendar validity — Date.UTC silently normalizes overflow, so compare back.
    const asUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (
      asUtc.getUTCFullYear() !== year ||
      asUtc.getUTCMonth() !== month - 1 ||
      asUtc.getUTCDate() !== day ||
      asUtc.getUTCHours() !== hour ||
      asUtc.getUTCMinutes() !== minute ||
      asUtc.getUTCSeconds() !== second
    ) {
      return {
        message: `Datetime "${datetime}" has out-of-range calendar components (e.g. month past 12, a day the month lacks such as February 30, or hour past 23).`,
        hint: 'Use a real calendar date and 24-hour time, e.g. "2026-05-24T15:30:00".',
      };
    }

    // (2) DST spring-forward gap — round-trip the interpreted instant back to local time.
    const { utcMs } = localDatetimeToUtc(
      { year, month, day, hour, minute, second },
      resolvedFromTz,
    );
    const backOffsetMin = getIntlOffsetMinutes(resolvedFromTz, new Date(utcMs));
    const roundTrip = formatLocalDatetime(new Date(utcMs + backOffsetMin * 60000));
    if (roundTrip !== datetime) {
      return {
        message: `Datetime "${datetime}" falls in a daylight-saving spring-forward gap in ${resolvedFromTz} — the clock jumps forward, so this wall-clock time never occurs.`,
        hint: 'Pick a time outside the skipped hour of the transition (the clock advances an hour, so times within it do not exist).',
      };
    }

    return null;
  }

  /** Get timezones for a country code (alpha2) */
  getTimezonesByCountry(countryCode: string): string[] {
    return this.byCountry.get(countryCode.toUpperCase()) ?? [];
  }

  private buildRecord(ianaId: string, at?: Date): TimezoneRecord {
    const date = at ?? new Date();
    const jan = new Date(date.getFullYear(), 0, 15);
    const jul = new Date(date.getFullYear(), 6, 15);
    const janOffset = getIntlOffsetMinutes(ianaId, jan);
    const julOffset = getIntlOffsetMinutes(ianaId, jul);
    const standard_offset_minutes = Math.min(janOffset, julOffset);
    const standardDate = janOffset <= julOffset ? jan : jul;
    const current_offset_minutes = getIntlOffsetMinutes(ianaId, date);
    const dst_active = current_offset_minutes !== standard_offset_minutes;
    const meta = this.byIana.get(ianaId);

    return {
      iana_id: ianaId,
      current_offset_hours: Math.round(current_offset_minutes * 100) / 6000, // minutes → hours with 2 decimal precision
      standard_offset_hours: Math.round(standard_offset_minutes * 100) / 6000,
      dst_active,
      dst_abbreviation: dst_active ? getIntlAbbreviation(ianaId, date) : null,
      standard_abbreviation: getIntlAbbreviation(ianaId, standardDate),
      major_cities: meta?.cities ?? [],
      countries: meta?.countries ?? [],
      alternate_names: meta?.alternates ?? [],
    };
  }

  lookup(
    query: string,
    by: 'iana' | 'country' | 'auto',
    at: Date | undefined,
    ctx: Context,
  ): TimezoneRecord[] | undefined {
    ctx.log.debug('Timezone lookup', { query, by });

    if (by === 'country' || (by === 'auto' && query.length === 2 && /^[A-Za-z]{2}$/.test(query))) {
      const tzIds = this.byCountry.get(query.toUpperCase()) ?? [];
      if (tzIds.length === 0) {
        // If auto and nothing found by country, fall through to IANA
        if (by === 'country') {
          return undefined;
        }
      } else {
        return tzIds.map((id) => this.buildRecord(id, at));
      }
    }

    const ids = this.resolver.candidates(query);
    return ids.length > 0 ? ids.map((id) => this.buildRecord(id, at)) : undefined;
  }

  /** Converts using the same resolved IDs the handler used to validate the wall clock. */
  convert(
    datetime: string,
    resolvedFrom: string,
    resolvedTo: string,
    ctx: Context,
  ): ConversionResult {
    ctx.log.debug('Timezone convert', { datetime, fromTz: resolvedFrom, toTz: resolvedTo });

    // Parse the input datetime as local time in the source timezone
    // ISO 8601 local format: "2026-05-24T15:30:00" — format pre-validated by the handler
    const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) {
      throw new Error(
        `Datetime "${datetime}" does not match the expected ISO 8601 local format (YYYY-MM-DDTHH:mm:ss).`,
      );
    }
    const [, year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = match.map(Number);

    // Interpret the local datetime in the source timezone as a UTC instant (two-step,
    // DST-aware). Out-of-range and spring-forward-gap inputs are rejected upstream by the
    // handler's validateConvertibleDatetime call, so this arithmetic runs on valid input.
    const { utcMs, offsetMinutes: fromOffsetMin } = localDatetimeToUtc(
      { year, month, day, hour, minute, second },
      resolvedFrom,
    );
    const utcDate = new Date(utcMs);

    // Format source datetime (the input) with its offset
    const fromOffsetStr = formatOffset(fromOffsetMin);

    // Format target datetime using Intl
    const toOffsetMin = getIntlOffsetMinutes(resolvedTo, utcDate);
    const targetMs = utcMs + toOffsetMin * 60000;
    const targetDate = new Date(targetMs);

    return {
      source: {
        datetime,
        tz: resolvedFrom,
        offset: fromOffsetStr,
      },
      target: {
        datetime: formatLocalDatetime(targetDate),
        tz: resolvedTo,
        offset: formatOffset(toOffsetMin),
      },
      utc_equivalent: utcDate.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
  }
}

// --- Init/accessor pattern ---

let _service: TimezoneService | undefined;

export function initTimezoneService(): void {
  _service = new TimezoneService();
}

export function getTimezoneService(): TimezoneService {
  if (!_service)
    throw new Error('TimezoneService not initialized — call initTimezoneService() in setup()');
  return _service;
}
