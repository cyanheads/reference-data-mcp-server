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

/**
 * Tokens dropped before relatedness scoring: common English stopwords plus
 * "constant" — a domain-generic term in ~14 of 32 names, so scoring on it would
 * relate every "X constant" to every other with no physical meaning. Only true
 * noise words belong here; domain terms (vacuum, molar, planck, …) stay scorable.
 */
const RELATED_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'constant',
  'for',
  'in',
  'is',
  'of',
  'the',
  'to',
]);

/**
 * Tokenize a constant name for relatedness scoring: lowercase, split on
 * non-alphanumerics, keep tokens of length ≥ 3, and drop common stopwords.
 */
function nameTokens(name: string): Set<string> {
  const tokens = new Set<string>();
  for (const token of name.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length >= 3 && !RELATED_STOPWORDS.has(token)) tokens.add(token);
  }
  return tokens;
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

    for (const [i, c] of constants.entries()) {
      this.aliasIndex.set(c.name.toLowerCase(), i);
      this.aliasIndex.set(c.symbol.toLowerCase(), i);
      for (const alias of c.aliases) {
        this.aliasIndex.set(alias.toLowerCase(), i);
      }
      // Case-sensitive entry for the canonical symbol ONLY — this backs the exact_symbol
      // branch, whose sole job is disambiguating symbols that differ only by case (e.g. "G"
      // gravitational constant vs "g" standard gravity, whose "g" alias resolves through the
      // case-insensitive index below). Aliases are deliberately excluded: a mixed-case name
      // alias (e.g. "Rydberg constant") resolving here would be mislabeled exact_symbol, when
      // it is an exact_name hit. It resolves case-insensitively below instead. See #38.
      this.caseSensitiveIndex.set(c.symbol, i);
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

    // Sort by score descending; the top-scoring candidate is the primary match.
    candidates.sort((a, b) => b.score - a.score);
    const primary = candidates[0];
    if (!primary) return;
    const relatedIdxs = candidates.slice(1, 4).map((c) => c.idx);
    return this.buildResult(primary.idx, relatedIdxs, 'fuzzy');
  }

  /**
   * Find up to 3 related constants for a primary index by whole-token overlap on the
   * constant name. Scoring is set intersection over name tokens (split on
   * non-alphanumerics, lowercased, length ≥ 3, common stopwords dropped); symbols and
   * aliases are deliberately excluded, since their short 1–2 char forms produced
   * substring false positives. An empty result is valid and preferred over noise.
   */
  private findRelated(primaryIdx: number): number[] {
    const primary = this.all[primaryIdx];
    if (!primary) return [];
    const primaryTokens = nameTokens(primary.name);
    if (primaryTokens.size === 0) return [];

    const related: Array<{ idx: number; score: number }> = [];
    for (const [i, c] of this.all.entries()) {
      if (i === primaryIdx) continue;
      let score = 0;
      for (const token of nameTokens(c.name)) {
        if (primaryTokens.has(token)) score++;
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
    const c = this.all[idx];
    if (!c) throw new Error(`Constant index ${idx} is out of range.`);
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
