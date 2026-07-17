/**
 * @fileoverview Timezone service — IANA timezone lookup, offset computation, and conversion.
 * Core offsets use Node.js Intl API; supplementary metadata from @vvo/tzdb.
 * @module services/timezone/timezone-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import { getTimeZones } from '@vvo/tzdb';
import type { ConversionResult, TimezoneRecord } from './types.js';

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

/** Check if DST is active by comparing current offset to standard (January) offset */
function isDstActive(
  ianaId: string,
  at?: Date,
): { dst_active: boolean; standard_offset_minutes: number } {
  const date = at ?? new Date();
  // January is reliably non-DST in the Northern Hemisphere; July in Southern
  const jan = new Date(date.getFullYear(), 0, 15); // Jan 15
  const jul = new Date(date.getFullYear(), 6, 15); // Jul 15
  const janOffset = getIntlOffsetMinutes(ianaId, jan);
  const julOffset = getIntlOffsetMinutes(ianaId, jul);

  // Standard offset is the smaller (more negative) one — southern hemispheres flip this
  const standard_offset_minutes = Math.min(janOffset, julOffset);
  const current = getIntlOffsetMinutes(ianaId, date);
  const dst_active = current !== standard_offset_minutes;
  return { dst_active, standard_offset_minutes };
}

export class TimezoneService {
  private readonly byIana: Map<
    string,
    { cities: string[]; countries: string[]; alternates: string[] }
  > = new Map();
  private readonly byCountry: Map<string, string[]> = new Map();
  private readonly byCity: Map<string, string> = new Map(); // lowercase city name → IANA id
  private readonly allIanaIds: string[];

  constructor() {
    // Load tzdb supplementary metadata
    const tzList = getTimeZones();

    // Build indexes
    for (const tz of tzList) {
      const { name, mainCities, countryCode, group } = tz;
      // Each entry in tzdb is one primary IANA ID
      this.byIana.set(name, {
        cities: mainCities,
        countries: [countryCode],
        alternates: group.filter((g) => g !== name),
      });

      // Country → [iana ids]
      const existing = this.byCountry.get(countryCode) ?? [];
      existing.push(name);
      this.byCountry.set(countryCode, existing);

      // City → iana id
      for (const city of mainCities) {
        this.byCity.set(city.toLowerCase(), name);
        // Also store simplified versions (remove diacritics approximation)
        const simplified = city
          .toLowerCase()
          .replace(/[àáâãäå]/g, 'a')
          .replace(/[èéêë]/g, 'e')
          .replace(/[ìíîï]/g, 'i')
          .replace(/[òóôõö]/g, 'o')
          .replace(/[ùúûü]/g, 'u')
          .replace(/[ñ]/g, 'n')
          .replace(/[ç]/g, 'c');
        if (simplified !== city.toLowerCase()) {
          this.byCity.set(simplified, name);
        }
      }
    }

    // All IANA IDs from the runtime (superset of tzdb entries)
    this.allIanaIds = Intl.supportedValuesOf('timeZone');
  }

  /** Check whether an IANA ID is valid by attempting to use it with Intl */
  private isValidIana(ianaId: string): boolean {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: ianaId });
      return true;
    } catch {
      return false;
    }
  }

  /** Public wrapper for resolveIanaId — used by tool handlers for pre-validation */
  resolveIanaIdPublic(query: string): string | null {
    return this.resolveIanaId(query);
  }

  /** Public wrapper for isValidIana — used by tool handlers for pre-validation */
  isValidIanaPublic(ianaId: string): boolean {
    return this.isValidIana(ianaId);
  }

  /** Get timezones for a country code (alpha2) */
  getTimezonesByCountry(countryCode: string): string[] {
    return this.byCountry.get(countryCode.toUpperCase()) ?? [];
  }

  /** Resolve a query to an IANA timezone ID, or throw */
  private resolveIanaId(query: string): string | null {
    // Reject empty or whitespace-only strings — startsWith('') matches everything
    if (!query.trim()) return null;

    // Handle UTC and GMT aliases — valid IANA identifiers not in tzdb or Intl.supportedValuesOf
    const utcAliases: Record<string, string> = {
      utc: 'UTC',
      gmt: 'UTC',
      'etc/utc': 'UTC',
      'etc/gmt': 'UTC',
    };
    const utcAlias = utcAliases[query.toLowerCase()];
    if (utcAlias) return utcAlias;

    // Exact IANA match (case-insensitive)
    const queryLower = query.toLowerCase();
    const exactMatch = this.allIanaIds.find((id) => id.toLowerCase() === queryLower);
    if (exactMatch) return exactMatch;

    // Check if it's a timezone name in tzdb
    const tzdbMatch = [...this.byIana.keys()].find((id) => id.toLowerCase() === queryLower);
    if (tzdbMatch) return tzdbMatch;

    // City match
    const cityMatch = this.byCity.get(queryLower);
    if (cityMatch) return cityMatch;

    // Partial IANA ID match (e.g., "Tokyo" → "Asia/Tokyo")
    const partialIana = this.allIanaIds.find((id) => {
      const parts = id.split('/');
      return parts.some(
        (p) => p.toLowerCase() === queryLower || p.toLowerCase().startsWith(queryLower),
      );
    });
    if (partialIana) return partialIana;

    return null;
  }

  buildRecord(ianaId: string, at?: Date): TimezoneRecord {
    const date = at ?? new Date();
    const { dst_active, standard_offset_minutes } = isDstActive(ianaId, date);
    const current_offset_minutes = getIntlOffsetMinutes(ianaId, date);

    const meta = this.byIana.get(ianaId);

    // Get abbreviations for summer and winter
    const jan = new Date(date.getFullYear(), 0, 15);
    const jul = new Date(date.getFullYear(), 6, 15);
    const janAbbr = getIntlAbbreviation(ianaId, jan);
    const julAbbr = getIntlAbbreviation(ianaId, jul);
    const dstAbbr =
      janAbbr !== julAbbr
        ? current_offset_minutes > standard_offset_minutes
          ? julAbbr
          : janAbbr
        : null;
    const stdAbbr =
      janAbbr !== julAbbr
        ? standard_offset_minutes <= getIntlOffsetMinutes(ianaId, jan)
          ? janAbbr
          : julAbbr
        : janAbbr;

    return {
      iana_id: ianaId,
      current_offset_hours: Math.round(current_offset_minutes * 100) / 6000, // minutes → hours with 2 decimal precision
      standard_offset_hours: Math.round(standard_offset_minutes * 100) / 6000,
      dst_active,
      dst_abbreviation: dst_active ? dstAbbr : null,
      standard_abbreviation: stdAbbr,
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
          return;
        }
      } else {
        return tzIds.map((id) => this.buildRecord(id, at));
      }
    }

    // IANA / partial name lookup
    const ianaId = this.resolveIanaId(query);
    if (!ianaId) {
      return;
    }
    return [this.buildRecord(ianaId, at)];
  }

  convert(datetime: string, fromTz: string, toTz: string, ctx: Context): ConversionResult {
    ctx.log.debug('Timezone convert', { datetime, fromTz, toTz });

    // Resolve timezone IDs — pre-validated by the handler before delegating here
    const resolvedFrom = this.resolveIanaId(fromTz) ?? fromTz;
    const resolvedTo = this.resolveIanaId(toTz) ?? toTz;

    // Parse the input datetime as local time in the source timezone
    // ISO 8601 local format: "2026-05-24T15:30:00" — format pre-validated by the handler
    const match = datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) {
      throw new Error(
        `Datetime "${datetime}" does not match the expected ISO 8601 local format (YYYY-MM-DDTHH:mm:ss).`,
      );
    }
    const [, year = 0, month = 1, day = 1, hour = 0, minute = 0, second = 0] = match.map(Number);

    // Build the UTC timestamp by interpreting the local datetime in the source timezone.
    // Two-step approach: initial estimate, then refine with the offset at the refined UTC time.
    // This handles DST transitions (spring-forward) where the naive first-pass offset is wrong.
    const approxUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const approxDate = new Date(approxUtcMs);
    const firstOffsetMin = getIntlOffsetMinutes(resolvedFrom, approxDate);
    const refinedUtcMs = approxUtcMs - firstOffsetMin * 60000;
    const refinedDate = new Date(refinedUtcMs);
    const fromOffsetMin = getIntlOffsetMinutes(resolvedFrom, refinedDate);
    const utcMs = approxUtcMs - fromOffsetMin * 60000;
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
