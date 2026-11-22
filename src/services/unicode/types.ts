/**
 * @fileoverview Unicode lookup domain types: the query readings, the per-code-point
 * record, and the whole-input summary.
 * @module services/unicode/types
 */

import type { NameAlias } from './unicode-tables.js';

/** How a query is read; `auto` picks `code_point` or `text` from the query itself. */
export const LOOKUP_MODES = ['auto', 'text', 'code_point', 'decimal'] as const;
export type LookupMode = (typeof LOOKUP_MODES)[number];

/** The reading actually applied to a query. */
export type InterpretedAs = Exclude<LookupMode, 'auto'>;

/** Unicode basic code point type (Unicode Standard §2.4, Table 2-3). */
export const CODE_POINT_TYPES = [
  'graphic',
  'format',
  'control',
  'private_use',
  'surrogate',
  'noncharacter',
  'reserved',
] as const;
export type CodePointType = (typeof CODE_POINT_TYPES)[number];

/** A query read into the code points it names, before any lookup. */
export interface ParsedQuery {
  codePoints: number[];
  interpretedAs: InterpretedAs;
  /** Authored notices about the reading (never caller text). */
  notices: string[];
}

export interface NormalizationStrings {
  nfc: string[];
  nfd: string[];
  nfkc: string[];
  nfkd: string[];
}

export interface CodePointRecord {
  aliases: NameAlias[];
  block: string | null;
  category: string;
  category_name: string;
  /** The character itself when display-safe, otherwise null. */
  char: string | null;
  cluster_index: number;
  code_point: string;
  code_point_type: CodePointType;
  decimal: number;
  index: number;
  is_bidi_control: boolean;
  is_default_ignorable: boolean;
  is_invisible: boolean;
  is_whitespace: boolean;
  label: string | null;
  name: string | null;
  normalization: NormalizationStrings;
  script: string;
  utf8: string | null;
  utf16: string;
  utf16_offset: number;
}

/** Facts about the whole input, independent of the page. */
export interface UnicodeSummary {
  bidi_control_indices: number[];
  code_point_count: number;
  grapheme_cluster_count: number;
  invisible_indices: number[];
  utf8_length: number | null;
  utf16_length: number;
  well_formed: boolean;
}

export interface InspectResult {
  codePoints: CodePointRecord[];
  nextOffset: number | null;
  /** Authored notices about the page (limit clamp, offset past the end). */
  notices: string[];
  summary: UnicodeSummary;
  truncated: boolean;
}
