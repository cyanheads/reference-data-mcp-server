/**
 * @fileoverview Elements service — periodic table lookup and search.
 * @module services/elements/elements-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import { DATASET_VERSION, elements } from '../../data/periodic-table.js';
import type { ElementRecord, ElementSummary } from './types.js';

export { DATASET_VERSION };

/**
 * International / IUPAC name spellings that diverge from the dataset's en-US forms, mapped
 * to the stored element's lowercase symbol. The periodic-table dataset stores American
 * spellings (Aluminum, Cesium, Sulfur); the en-GB / IUPAC-preferred variants are neither a
 * prefix nor a superset of them, so the fuzzy `startsWith` fallback cannot bridge the gap.
 * An explicit 3-entry map is right-sized — a per-element alias field would be disproportionate
 * for 3 of 118 rows (see issue #34).
 */
const NAME_ALIASES: Record<string, string> = {
  aluminium: 'al',
  caesium: 'cs',
  sulphur: 's',
};

export class ElementsService {
  private readonly byNumber: Map<number, ElementRecord>;
  private readonly bySymbol: Map<string, ElementRecord>;
  private readonly byName: Map<string, ElementRecord>;
  private readonly all: ElementRecord[];

  constructor() {
    this.byNumber = new Map();
    this.bySymbol = new Map();
    this.byName = new Map();
    this.all = elements as ElementRecord[];

    for (const el of this.all) {
      this.byNumber.set(el.number, el);
      this.bySymbol.set(el.symbol.toLowerCase(), el);
      this.byName.set(el.name.toLowerCase(), el);
    }
  }

  lookup(
    query: string | number,
    by: 'auto' | 'name' | 'symbol' | 'number',
    ctx: Context,
  ): ElementRecord | undefined {
    ctx.log.debug('Element lookup', { query, by });

    let result: ElementRecord | undefined;

    if (by === 'number' || (by === 'auto' && typeof query === 'number')) {
      const num = typeof query === 'number' ? query : parseInt(String(query), 10);
      if (!Number.isNaN(num)) result = this.byNumber.get(num);
    } else if (by === 'symbol') {
      result = this.bySymbol.get(String(query).toLowerCase());
    } else if (by === 'name') {
      result = this.resolveName(String(query));
    } else {
      // auto: try number, then symbol, then name
      const numQuery = typeof query === 'number' ? query : parseInt(String(query), 10);
      if (!Number.isNaN(numQuery)) result = this.byNumber.get(numQuery);
      if (!result) result = this.bySymbol.get(String(query).toLowerCase());
      if (!result) result = this.resolveName(String(query));
      // Fuzzy name match
      if (!result) {
        const lower = String(query).toLowerCase();
        for (const [name, el] of this.byName) {
          if (name.startsWith(lower)) {
            result = el;
            break;
          }
        }
      }
    }

    return result;
  }

  /**
   * Resolve a name query to a record: exact stored name first, then the international /
   * IUPAC spelling alias map. Consulted by both the `name` branch and the `auto` branch so
   * an alias resolves regardless of the explicit lookup mode.
   */
  private resolveName(query: string): ElementRecord | undefined {
    const lower = query.toLowerCase();
    const exact = this.byName.get(lower);
    if (exact) return exact;
    const aliasSymbol = NAME_ALIASES[lower];
    return aliasSymbol ? this.bySymbol.get(aliasSymbol) : undefined;
  }

  search(
    opts: {
      category?: string;
      group?: number;
      period?: number;
      atomic_number_range?: { min: number; max: number };
      atomic_mass_range?: { min: number; max: number };
    },
    ctx: Context,
  ): { results: ElementSummary[]; total_matches: number } {
    const { category, group, period, atomic_number_range, atomic_mass_range } = opts;

    if (
      !category &&
      group == null &&
      period == null &&
      !atomic_number_range &&
      !atomic_mass_range
    ) {
      return { results: [], total_matches: 0 };
    }

    ctx.log.debug('Element search', opts);

    const categoryLower = category?.toLowerCase();

    // Prefer exact match; fall back to substring if nothing found exactly.
    // This prevents "transition metal" from inadvertently matching "post-transition metal".
    const categoryFilter = categoryLower
      ? (() => {
          const exact = this.all.filter((el) => el.category.toLowerCase() === categoryLower);
          return exact.length > 0
            ? exact
            : this.all.filter((el) => el.category.toLowerCase().includes(categoryLower));
        })()
      : this.all;

    const matched = categoryFilter.filter((el) => {
      if (group != null && el.group !== group) return false;
      if (period != null && el.period !== period) return false;
      if (atomic_number_range) {
        if (el.number < atomic_number_range.min || el.number > atomic_number_range.max)
          return false;
      }
      if (atomic_mass_range && el.atomic_mass != null) {
        if (el.atomic_mass < atomic_mass_range.min || el.atomic_mass > atomic_mass_range.max)
          return false;
      }
      return true;
    });

    return {
      results: matched.map((el) => ({
        number: el.number,
        symbol: el.symbol,
        name: el.name,
        atomic_mass: el.atomic_mass,
        atomic_mass_estimated: el.atomic_mass_estimated,
        category: el.category,
      })),
      total_matches: matched.length,
    };
  }

  getByNumber(number: number): ElementRecord | undefined {
    return this.byNumber.get(number);
  }
}

// --- Init/accessor pattern ---

let _service: ElementsService | undefined;

export function initElementsService(): void {
  _service = new ElementsService();
}

export function getElementsService(): ElementsService {
  if (!_service)
    throw new Error('ElementsService not initialized — call initElementsService() in setup()');
  return _service;
}
