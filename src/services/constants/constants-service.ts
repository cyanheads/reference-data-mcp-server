/**
 * @fileoverview Physical constants service — CODATA 2022 lookup.
 * @module services/constants/constants-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import type { PhysicalConstant } from '../../data/physical-constants.js';
import { constants, DATASET_VERSION } from '../../data/physical-constants.js';

export type { PhysicalConstant };
export { DATASET_VERSION };

export type MatchStrategy = 'exact_symbol' | 'exact_name' | 'fuzzy';

export interface ConstantResult {
  codata_id: string | null;
  description: string;
  exact: boolean;
  match_strategy: MatchStrategy;
  name: string;
  related: Array<{ name: string; symbol: string }>;
  symbol: string;
  uncertainty: number | null;
  uncertainty_relative: string | null;
  unit: string;
  value: number;
}

export class ConstantsService {
  private readonly all: PhysicalConstant[];
  // Map from alias/name → constant index
  private readonly aliasIndex: Map<string, number>;

  // Case-sensitive index for symbols — uppercase G vs lowercase g must resolve differently
  private readonly caseSensitiveIndex: Map<string, number>;

  constructor() {
    this.all = constants;
    this.aliasIndex = new Map();
    this.caseSensitiveIndex = new Map();

    for (let i = 0; i < constants.length; i++) {
      const c = constants[i]!;
      this.aliasIndex.set(c.name.toLowerCase(), i);
      this.aliasIndex.set(c.symbol.toLowerCase(), i);
      for (const alias of c.aliases) {
        this.aliasIndex.set(alias.toLowerCase(), i);
      }
      // Also store original-case entries for symbols/aliases where case matters
      this.caseSensitiveIndex.set(c.symbol, i);
      for (const alias of c.aliases) {
        // Only store if case differs from lowercase to avoid masking the general index
        if (alias !== alias.toLowerCase()) {
          this.caseSensitiveIndex.set(alias, i);
        }
      }
    }
  }

  lookup(query: string, ctx: Context): ConstantResult | undefined {
    ctx.log.debug('Constant lookup', { query });

    // Case-sensitive symbol match first (handles G vs g, F vs f, etc.)
    const caseExactIdx = this.caseSensitiveIndex.get(query);
    if (caseExactIdx != null) {
      return this.buildResult(caseExactIdx, this.findRelated(caseExactIdx), 'exact_symbol');
    }

    const queryLower = query.toLowerCase();

    // Exact case-insensitive match
    const exactIdx = this.aliasIndex.get(queryLower);
    if (exactIdx != null) {
      return this.buildResult(exactIdx, this.findRelated(exactIdx), 'exact_name');
    }

    // Partial/fuzzy match — find all candidates by scanning names and aliases
    const candidates: Array<{ idx: number; score: number }> = [];
    for (const [idx, c] of this.all.entries()) {
      const allNames = [c.name, c.symbol, ...c.aliases].map((n) => n.toLowerCase());
      // Score: starts-with > contains
      if (allNames.some((n) => n.startsWith(queryLower))) {
        candidates.push({ idx, score: 2 });
      } else if (allNames.some((n) => n.includes(queryLower))) {
        candidates.push({ idx, score: 1 });
      }
    }

    if (candidates.length === 0) {
      return;
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    const primary = candidates[0]!.idx;
    const relatedIdxs = candidates.slice(1, 4).map((c) => c.idx);
    return this.buildResult(primary, relatedIdxs, 'fuzzy');
  }

  /** Find up to 3 related constants for a given primary index by scanning for name/term overlap. */
  private findRelated(primaryIdx: number): number[] {
    const primary = this.all[primaryIdx]!;
    const primaryTerms = new Set([primary.name.toLowerCase(), primary.symbol.toLowerCase()]);

    const related: Array<{ idx: number; score: number }> = [];
    for (let i = 0; i < this.all.length; i++) {
      if (i === primaryIdx) continue;
      const c = this.all[i]!;
      const allTerms = [c.name, c.symbol, ...c.aliases].map((n) => n.toLowerCase());
      // Score by overlap: how many terms from primary appear in this entry's terms
      let score = 0;
      for (const term of primaryTerms) {
        if (allTerms.some((t) => t.includes(term) || term.includes(t))) score++;
      }
      if (score > 0) related.push({ idx: i, score });
    }
    related.sort((a, b) => b.score - a.score);
    return related.slice(0, 3).map((r) => r.idx);
  }

  private buildResult(
    idx: number,
    relatedIdxs: number[],
    matchStrategy: MatchStrategy,
  ): ConstantResult {
    const c = this.all[idx]!;
    return {
      name: c.name,
      symbol: c.symbol,
      value: c.value,
      unit: c.unit,
      uncertainty: c.uncertainty,
      uncertainty_relative: c.uncertainty_relative,
      description: c.description,
      codata_id: c.codata_id,
      exact: c.exact,
      match_strategy: matchStrategy,
      related: relatedIdxs
        .map((i) => this.all[i])
        .filter((c): c is PhysicalConstant => c != null)
        .map((c) => ({ name: c.name, symbol: c.symbol })),
    };
  }
}

// --- Init/accessor pattern ---

let _service: ConstantsService | undefined;

export function initConstantsService(): void {
  _service = new ConstantsService();
}

export function getConstantsService(): ConstantsService {
  if (!_service)
    throw new Error('ConstantsService not initialized — call initConstantsService() in setup()');
  return _service;
}
