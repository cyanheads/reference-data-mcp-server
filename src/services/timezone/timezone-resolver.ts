/**
 * @fileoverview Resolves exact timezone IDs and complete city or IANA location names.
 * @module services/timezone/timezone-resolver
 */

import type { getTimeZones } from '@vvo/tzdb';
import { countries } from 'countries-list';

const UTC_ALIASES = new Set(['utc', 'gmt', 'etc/utc', 'etc/gmt']);
const SIGNED_SHORTHAND = /^(?:gmt|utc)\s*[+-]\s*\d/i;

function stripMarks(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '');
}

function foldLocation(text: string): string {
  return stripMarks(text)
    .replace(/[.'’‘]/g, '')
    .replace(/[_\-\s]+/g, ' ')
    .trim();
}

function locationSegment(id: string): string | undefined {
  const slash = id.lastIndexOf('/');
  return slash === -1 || id.startsWith('Etc/') ? undefined : id.slice(slash + 1).toLowerCase();
}

function addCandidate(index: Map<string, Set<string>>, key: string, id: string): void {
  const existing = index.get(key);
  if (existing) existing.add(id);
  else index.set(key, new Set([id]));
}

/** Recovery for unrecognized queries that plausibly name a country or an offset. */
export function timezoneRecovery(query: string): string | undefined {
  const trimmed = query.trim();
  if (SIGNED_SHORTHAND.test(trimmed)) {
    return 'Use an exact IANA ID such as Etc/GMT-5 for UTC+05:00. Etc/GMT IDs use inverted signs.';
  }
  if (Object.hasOwn(countries, trimmed.toUpperCase())) {
    return 'Use ref_timezone_lookup in country mode, then pass the exact IANA ID for the location.';
  }
  return undefined;
}

/** Indexes location names without treating tzdb groups as historical offset aliases. */
export class TimezoneResolver {
  private readonly ids = new Map<string, string>();
  private readonly cities = new Map<string, Set<string>>();
  private readonly unaccentedCities = new Map<string, Set<string>>();
  private readonly segments = new Map<string, Set<string>>();
  private readonly locations = new Map<string, Set<string>>();

  constructor(rows: ReturnType<typeof getTimeZones>) {
    const runtimeIds = Intl.supportedValuesOf('timeZone');
    for (const id of runtimeIds) {
      this.ids.set(id.toLowerCase(), id);
      const segment = locationSegment(id);
      if (segment) addCandidate(this.segments, segment, id);
    }
    for (const { name, group } of rows) {
      const key = name.toLowerCase();
      if (!this.ids.has(key)) this.ids.set(key, name);
      // Jamaica and Singapore also have standalone links named for their primary zone.
      const city = name.slice(name.lastIndexOf('/') + 1);
      if (group.includes(city)) this.ids.set(city.toLowerCase(), name);
    }
    for (const id of this.ids.values()) {
      const segment = locationSegment(id);
      if (segment) addCandidate(this.locations, foldLocation(segment), id);
    }
    for (const { name, group, mainCities } of rows) {
      const members = new Map<string, Set<string>>();
      const links = new Map<string, Set<string>>();
      for (const id of group) {
        const segment = locationSegment(id);
        if (segment)
          addCandidate(this.ids.has(id.toLowerCase()) ? members : links, foldLocation(segment), id);
      }
      const segment = locationSegment(name);
      const primary = segment && foldLocation(segment);
      for (const city of mainCities) {
        const exact = city.toLowerCase().normalize('NFC');
        const folded = foldLocation(exact);
        const candidates = members.get(folded) ?? links.get(folded);
        const member = candidates?.size === 1 ? candidates.values().next().value : undefined;
        const id = folded !== primary && member ? (this.exactId(member) ?? name) : name;
        addCandidate(this.cities, exact, id);
        addCandidate(this.unaccentedCities, stripMarks(exact), id);
      }
    }
  }

  private cataloguedId(lower: string): string | undefined {
    return UTC_ALIASES.has(lower) ? 'UTC' : this.ids.get(lower);
  }

  private runtimeId(query: string, allowOffset: boolean): string | undefined {
    if (SIGNED_SHORTHAND.test(query) || (!allowOffset && !/^[a-z]/i.test(query))) return undefined;
    // Intl's enumeration omits valid links and, on some runtimes, named fixed-offset zones.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: query });
      return query;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return undefined;
    }
  }

  /** Resolves exact named IDs for resource reads. Numeric offsets are conversion-only. */
  exactId(query: string): string | undefined {
    return this.cataloguedId(query.toLowerCase()) ?? this.runtimeId(query, false);
  }

  /** Returns the distinct candidates at the strongest exact spelling or location match. */
  candidates(query: string, allowOffset = false): string[] {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    const exact = this.cataloguedId(lower);
    if (exact) return [exact];

    const normalized = lower.normalize('NFC');
    const cities = this.cities.get(normalized) ?? this.unaccentedCities.get(stripMarks(normalized));
    if (cities) return [...cities].sort();
    const segment = this.segments.get(lower);
    if (segment) return [...segment].sort();
    const location = this.locations.get(foldLocation(lower));
    // The folded fallback is useful only for a distinct location, e.g. "St. Lucia".
    if (location?.size === 1) return [...location];

    // Standalone legacy links can share a place name, e.g. Kwajalein. Keep exact place
    // matches ahead of aliases that the existing catalog did not recognize as IDs.
    const id = this.runtimeId(query, allowOffset);
    return id ? [id] : [];
  }
}
