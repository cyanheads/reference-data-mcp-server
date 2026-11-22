/**
 * @fileoverview Unicode lookup service: reads a query into code points (literal text, U+ notation,
 * or decimal numbers), then builds the whole-input summary and the records for one page from the
 * bundled Unicode Character Database tables.
 * @module services/unicode/unicode-service
 */

import { validationError } from '@cyanheads/mcp-ts-core/errors';
import { codePointHex, codePointsOf, escapeCallerToken, isDisplaySafe } from './display-escape.js';
import { assignClusterIndices } from './grapheme-clusters.js';
import type {
  CodePointRecord,
  CodePointType,
  InspectResult,
  LookupMode,
  NormalizationStrings,
  ParsedQuery,
} from './types.js';
import {
  type CodePointProperties,
  loadUnicodeTables,
  type NormalizationForms,
  type UnicodeTables,
} from './unicode-tables.js';

/** Records on one page at most; a larger `limit` is clamped with a notice. */
const PAGE_CAP = 128;

const MAX_CODE_POINT = 0x10ffff;
const MAX_HEX_DIGITS = 6;
const MAX_DECIMAL_DIGITS = 7;

/**
 * Advice that works for every shape `looksLikeCodePointNumber` flags: `by: "code_point"` rejects
 * the HTML character references and the unbraced backslash-u escape, so the notice names U+
 * notation (which auto reads) and `by: "decimal"` instead.
 */
const LITERAL_TEXT_NOTICE =
  'Inspected as literal text. To look up a code point instead, write it as U+ followed by its hexadecimal digits, or pass its decimal number with by "decimal".';

/** TAB, LF, CR, and SPACE: the separators every reader expects in text, never flagged invisible. */
const VISIBLE_SEPARATORS = new Set([0x09, 0x0a, 0x0d, 0x20]);

/** Code point label prefixes for the types that carry no Name (Unicode §4.8, Table 4-8). */
const LABEL_PREFIXES: Partial<Record<CodePointType, string>> = {
  control: 'control',
  private_use: 'private-use',
  surrogate: 'surrogate',
  noncharacter: 'noncharacter',
  reserved: 'reserved',
};

// --- Query grammar: hand scanners over UTF-16 code units, each linear; no regex sees caller text ---

const isAsciiWhitespace = (unit: number) =>
  unit === 0x09 || unit === 0x0a || unit === 0x0d || unit === 0x20;
const isSeparator = (unit: number) => isAsciiWhitespace(unit) || unit === 0x2c;
const isDecimalDigit = (unit: number) => unit >= 0x30 && unit <= 0x39;
const isHexDigit = (unit: number) =>
  isDecimalDigit(unit) || (unit >= 0x41 && unit <= 0x46) || (unit >= 0x61 && unit <= 0x66);
/** ASCII letter folded to lowercase; any other unit is left distinct from every letter. */
const lower = (unit: number) => unit | 0x20;

/** True when `text[start, end)` is non-empty and every unit satisfies `test`. */
function everyUnit(text: string, start: number, end: number, test: (unit: number) => boolean) {
  if (end <= start) return false;
  for (let i = start; i < end; i++) if (!test(text.charCodeAt(i))) return false;
  return true;
}

/** `text` without leading and trailing ASCII whitespace (TAB, LF, CR, SPACE). */
function trimAsciiWhitespace(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && isAsciiWhitespace(text.charCodeAt(start))) start++;
  while (end > start && isAsciiWhitespace(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}

/** The runs of `text` between separators (ASCII whitespace and commas). */
function splitTokens(text: string): string[] {
  const tokens: string[] = [];
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (isSeparator(text.charCodeAt(i))) {
      if (start !== -1) tokens.push(text.slice(start, i));
      start = -1;
    } else if (start === -1) {
      start = i;
    }
  }
  if (start !== -1) tokens.push(text.slice(start));
  return tokens;
}

/** The value of `text[start, end)` as 1–6 hex digits, or null. */
function hexDigits(text: string, start: number, end: number): number | null {
  if (end - start > MAX_HEX_DIGITS || !everyUnit(text, start, end, isHexDigit)) return null;
  return Number.parseInt(text.slice(start, end), 16);
}

/** `U+H…`, with `U` in either case. */
const isUPlusToken = (token: string) =>
  lower(token.charCodeAt(0)) === 0x75 && token.charCodeAt(1) === 0x2b;

/**
 * Where a `by: "code_point"` token's digits sit, as `[start, end)`: after `U+` or `0x`, inside
 * `\u{…}`, or the whole token when it has no prefix.
 */
function hexDigitSpan(token: string): [start: number, end: number] {
  const first = token.charCodeAt(0);
  const second = lower(token.charCodeAt(1));
  if (isUPlusToken(token) || (first === 0x30 && second === 0x78)) return [2, token.length];
  if (
    first === 0x5c &&
    second === 0x75 &&
    token.charCodeAt(2) === 0x7b &&
    token.charCodeAt(token.length - 1) === 0x7d
  ) {
    return [3, token.length - 1];
  }
  return [0, token.length];
}

/** A `by: "code_point"` token's value: `U+H…`, `0xH…`, `\u{H…}`, or bare `H…`, 1–6 hex digits. */
function hexTokenValue(token: string): number | null {
  const [start, end] = hexDigitSpan(token);
  return hexDigits(token, start, end);
}

/**
 * Why `token` does not read in `by`'s notation: more digits than a code point takes (six hex,
 * seven decimal) with every one a digit of that notation, or not a number in it at all.
 */
function unreadableReason(token: string, by: 'code_point' | 'decimal'): string {
  if (by === 'decimal') {
    return token.length > MAX_DECIMAL_DIGITS && everyUnit(token, 0, token.length, isDecimalDigit)
      ? `has ${token.length} decimal digits; a code point has at most ${MAX_DECIMAL_DIGITS}`
      : 'is not a decimal code point';
  }
  const [start, end] = hexDigitSpan(token);
  const digits = end - start;
  return digits > MAX_HEX_DIGITS && everyUnit(token, start, end, isHexDigit)
    ? `has ${digits} hex digits; a code point has at most ${MAX_HEX_DIGITS}`
    : 'is not a hexadecimal code point';
}

/** A `by: "decimal"` token's value: 1–7 decimal digits, nothing else. */
function decimalTokenValue(token: string): number | null {
  if (token.length > MAX_DECIMAL_DIGITS || !everyUnit(token, 0, token.length, isDecimalDigit)) {
    return null;
  }
  return Number(token);
}

/**
 * Auto mode's code point reading: at least one token, and every token `U+` followed by one or more
 * hex digits. The digit count and range are left to `readTokens`, so `U+0000041` fails as notation
 * rather than passing silently as text.
 */
function isUPlusNotation(tokens: readonly string[]): boolean {
  return (
    tokens.length > 0 &&
    tokens.every((token) => isUPlusToken(token) && everyUnit(token, 2, token.length, isHexDigit))
  );
}

/**
 * True when a query auto mode read as text still looks like a number naming a code point: `0xH+`,
 * `\uH+` or `\u{H+}`, an HTML character reference `&#xH+;` or `&#D+;`, or a run of digits.
 */
function looksLikeCodePointNumber(trimmed: string): boolean {
  const first = trimmed.charCodeAt(0);
  const second = trimmed.charCodeAt(1);
  if (first === 0x30 && lower(second) === 0x78) {
    return everyUnit(trimmed, 2, trimmed.length, isHexDigit);
  }
  if (first === 0x5c && lower(second) === 0x75) {
    const start = trimmed.charCodeAt(2) === 0x7b ? 3 : 2;
    const end = trimmed.endsWith('}') ? trimmed.length - 1 : trimmed.length;
    return everyUnit(trimmed, start, end, isHexDigit);
  }
  if (first === 0x26 && second === 0x23) {
    const start = lower(trimmed.charCodeAt(2)) === 0x78 ? 3 : 2;
    const end = trimmed.endsWith(';') ? trimmed.length - 1 : trimmed.length;
    return everyUnit(trimmed, start, end, isHexDigit);
  }
  return everyUnit(trimmed, 0, trimmed.length, isDecimalDigit);
}

/** Reads every token as a code point; one malformed or out-of-range token fails the whole call. */
function readTokens(tokens: readonly string[], by: 'code_point' | 'decimal'): number[] {
  if (tokens.length === 0) {
    throw validationError(
      `by "${by}" needs at least one token; the query holds only spaces or commas.`,
      { reason: 'invalid_code_point' },
    );
  }
  return tokens.map((token, i) => {
    const n = i + 1;
    const value = by === 'code_point' ? hexTokenValue(token) : decimalTokenValue(token);
    if (value === null) {
      throw validationError(
        `Token ${n} (${escapeCallerToken(token)}) ${unreadableReason(token, by)}.`,
        { reason: 'invalid_code_point', token: n },
      );
    }
    if (value > MAX_CODE_POINT) {
      throw validationError(
        `Token ${n} (${escapeCallerToken(token)}) is ${value}, above 1114111 (U+10FFFF), the largest code point.`,
        { reason: 'invalid_code_point', token: n },
      );
    }
    return value;
  });
}

/**
 * Reads `query` into the code points it names. Throws a `ValidationError` with reason
 * `invalid_code_point` (and the 1-based `token` when one is at fault) for malformed notation, a
 * query holding no tokens, or a value above U+10FFFF. Needs no tables.
 */
export function parseQuery(query: string, by: LookupMode): ParsedQuery {
  switch (by) {
    case 'text':
      return { interpretedAs: 'text', codePoints: codePointsOf(query), notices: [] };
    case 'code_point':
    case 'decimal':
      return { interpretedAs: by, codePoints: readTokens(splitTokens(query), by), notices: [] };
    case 'auto': {
      const trimmed = trimAsciiWhitespace(query);
      const tokens = splitTokens(trimmed);
      if (isUPlusNotation(tokens)) {
        return {
          interpretedAs: 'code_point',
          codePoints: readTokens(tokens, 'code_point'),
          notices: [],
        };
      }
      return {
        interpretedAs: 'text',
        codePoints: codePointsOf(query),
        notices: looksLikeCodePointNumber(trimmed) ? [LITERAL_TEXT_NOTICE] : [],
      };
    }
  }
}

// --- Record building ---

const utf16Length = (codePoint: number) => (codePoint < 0x10000 ? 1 : 2);
const hex2 = (byte: number) => byte.toString(16).toUpperCase().padStart(2, '0');
const notation = (codePoint: number) => `U+${codePointHex(codePoint)}`;

/** Unicode basic type from General_Category, with Noncharacter_Code_Point splitting Cn. */
function codePointType({ generalCategory, noncharacter }: CodePointProperties): CodePointType {
  switch (generalCategory) {
    case 'Cc':
      return 'control';
    case 'Cf':
    case 'Zl':
    case 'Zp':
      return 'format';
    case 'Co':
      return 'private_use';
    case 'Cs':
      return 'surrogate';
    case 'Cn':
      return noncharacter ? 'noncharacter' : 'reserved';
    default:
      return 'graphic';
  }
}

/** `<control-0009>` and kin; only types that carry no Name have a label. */
function codePointLabel(type: CodePointType, codePoint: number): string {
  const prefix = LABEL_PREFIXES[type];
  if (prefix === undefined) {
    throw new Error(`${notation(codePoint)} is ${type} but the bundled tables give it no name.`);
  }
  return `<${prefix}-${codePointHex(codePoint)}>`;
}

/** Default_Ignorable ∪ White_Space ∪ Cc, minus TAB, LF, CR, and SPACE. */
function isInvisible(codePoint: number, properties: CodePointProperties): boolean {
  return (
    (properties.defaultIgnorable || properties.whiteSpace || properties.generalCategory === 'Cc') &&
    !VISIBLE_SEPARATORS.has(codePoint)
  );
}

/** UTF-8 bytes by the standard bit layout; null for a surrogate, which UTF-8 cannot encode. */
function utf8Bytes(codePoint: number): number[] | null {
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null;
  if (codePoint < 0x80) return [codePoint];
  const tail = (shift: number) => 0x80 | ((codePoint >> shift) & 0x3f);
  if (codePoint < 0x800) return [0xc0 | (codePoint >> 6), tail(0)];
  if (codePoint < 0x10000) return [0xe0 | (codePoint >> 12), tail(6), tail(0)];
  return [0xf0 | (codePoint >> 18), tail(12), tail(6), tail(0)];
}

/** UTF-16 code units as 4-digit uppercase hex separated by a space; a surrogate is its own unit. */
function utf16Hex(codePoint: number): string {
  if (codePoint < 0x10000) return codePointHex(codePoint);
  const offset = codePoint - 0x10000;
  return `${codePointHex(0xd800 + (offset >> 10))} ${codePointHex(0xdc00 + (offset & 0x3ff))}`;
}

function normalizationStrings(forms: NormalizationForms): NormalizationStrings {
  return {
    nfc: forms.nfc.map(notation),
    nfd: forms.nfd.map(notation),
    nfkc: forms.nfkc.map(notation),
    nfkd: forms.nfkd.map(notation),
  };
}

export class UnicodeService {
  readonly #tables: UnicodeTables;

  constructor(tables: UnicodeTables) {
    this.#tables = tables;
  }

  /**
   * Summarizes every code point and builds full records for `[offset, offset + limit)`, with
   * `limit` clamped to 128. Grapheme clusters and the summary always cover the whole input; an
   * offset at or past the end returns an empty page with a notice.
   */
  inspect(codePoints: readonly number[], offset: number, limit: number): InspectResult {
    const total = codePoints.length;
    const pageSize = Math.min(limit, PAGE_CAP);
    const end = Math.min(offset + pageSize, total);
    const notices: string[] = [];
    if (limit > PAGE_CAP) {
      notices.push(
        `limit ${limit} exceeds the cap of ${PAGE_CAP}; this page holds at most ${PAGE_CAP} code points.`,
      );
    }
    if (offset >= total) {
      notices.push(
        `offset ${offset} is past the last code point (index ${total - 1}); pass offset 0 to start from the beginning.`,
      );
    }

    const clusters = assignClusterIndices(codePoints, this.#tables);
    const records: CodePointRecord[] = [];
    const invisibleIndices: number[] = [];
    const bidiControlIndices: number[] = [];
    let utf16Total = 0;
    let utf8Total: number | null = 0;

    for (const [index, codePoint] of codePoints.entries()) {
      const properties = this.#tables.properties(codePoint);
      if (isInvisible(codePoint, properties)) invisibleIndices.push(index);
      if (properties.bidiControl) bidiControlIndices.push(index);
      if (index >= offset && index < end) {
        const clusterIndex = clusters[index];
        if (clusterIndex === undefined) {
          throw new Error(`The grapheme segmenter assigned no cluster to code point ${index}.`);
        }
        records.push(this.#record(codePoint, properties, index, utf16Total, clusterIndex));
      }
      utf16Total += utf16Length(codePoint);
      const bytes = utf8Bytes(codePoint);
      utf8Total = bytes === null || utf8Total === null ? null : utf8Total + bytes.length;
    }

    const truncated = offset + records.length < total;
    return {
      summary: {
        code_point_count: total,
        grapheme_cluster_count: (clusters.at(-1) ?? -1) + 1,
        utf16_length: utf16Total,
        utf8_length: utf8Total,
        // Only a surrogate makes the UTF-8 length null, and only a surrogate makes text ill-formed.
        well_formed: utf8Total !== null,
        invisible_indices: invisibleIndices,
        bidi_control_indices: bidiControlIndices,
      },
      codePoints: records,
      truncated,
      nextOffset: truncated ? offset + records.length : null,
      notices,
    };
  }

  #record(
    codePoint: number,
    properties: CodePointProperties,
    index: number,
    utf16Offset: number,
    clusterIndex: number,
  ): CodePointRecord {
    const tables = this.#tables;
    const type = codePointType(properties);
    const name = tables.name(codePoint);
    return {
      index,
      utf16_offset: utf16Offset,
      cluster_index: clusterIndex,
      code_point: notation(codePoint),
      char: isDisplaySafe(type, properties) ? String.fromCodePoint(codePoint) : null,
      decimal: codePoint,
      name,
      label: name === null ? codePointLabel(type, codePoint) : null,
      aliases: tables.aliases(codePoint),
      category: properties.generalCategory,
      category_name: tables.categoryName(properties.generalCategory),
      code_point_type: type,
      block: tables.block(codePoint),
      script: properties.script,
      is_whitespace: properties.whiteSpace,
      is_default_ignorable: properties.defaultIgnorable,
      is_bidi_control: properties.bidiControl,
      is_invisible: isInvisible(codePoint, properties),
      utf8: utf8Bytes(codePoint)?.map(hex2).join(' ') ?? null,
      utf16: utf16Hex(codePoint),
      normalization: normalizationStrings(tables.normalization(codePoint)),
    };
  }
}

// --- Init/accessor pattern ---

let _service: UnicodeService | undefined;

/** Decodes the bundled Unicode tables once; throws on a malformed table. Call from setup(). */
export function initUnicodeService(): void {
  _service = new UnicodeService(loadUnicodeTables());
}

export function getUnicodeService(): UnicodeService {
  if (!_service) {
    throw new Error('UnicodeService not initialized — call initUnicodeService() in setup()');
  }
  return _service;
}
