/**
 * @fileoverview Decodes the generated Unicode data modules (`src/data/unicode/`) into lookup
 * tables: character names (stored, Hangul syllable NR1, ideograph-range NR2), name aliases,
 * per-code-point properties, blocks, and normalization forms. Every answer comes from the
 * bundled Unicode Character Database; the runtime's own Unicode support is never consulted, so
 * Bun and Node answer identically.
 * @module services/unicode/unicode-tables
 */

import { internalError } from '@cyanheads/mcp-ts-core/errors';
import {
  DERIVED_NAME_RANGES,
  JAMO_SHORT_NAMES,
  NAME_ALIAS_TYPES,
  NAME_ALIASES,
  NAME_CODE_ALPHABET,
  NAME_CODE_WIDTHS,
  NAME_CODES,
  NAME_RUNS,
  NAME_WORDS,
  UCD_VERSION as NAMES_UCD_VERSION,
} from '../../data/unicode/names.js';
import {
  NORMALIZATION_FORMS,
  UCD_VERSION as NORMALIZATION_UCD_VERSION,
} from '../../data/unicode/normalization.js';
import {
  BLOCKS,
  GENERAL_CATEGORIES,
  GRAPHEME_CLUSTER_BREAKS,
  INDIC_CONJUNCT_BREAKS,
  UCD_VERSION as PROPERTIES_UCD_VERSION,
  PROPERTY_FLAGS,
  PROPERTY_RUNS,
  PROPERTY_TUPLES,
  SCRIPTS,
} from '../../data/unicode/properties.js';

/** Version of the bundled Unicode Character Database. */
export const UNICODE_VERSION: string = PROPERTIES_UCD_VERSION;

const GRAPHEME_CLUSTER_BREAK_VALUES = [
  'Other',
  'CR',
  'LF',
  'Control',
  'Extend',
  'ZWJ',
  'Regional_Indicator',
  'Prepend',
  'SpacingMark',
  'L',
  'V',
  'T',
  'LV',
  'LVT',
] as const;
const INDIC_CONJUNCT_BREAK_VALUES = ['None', 'Linker', 'Consonant', 'Extend'] as const;
const NAME_ALIAS_TYPE_VALUES = [
  'correction',
  'control',
  'alternate',
  'figment',
  'abbreviation',
] as const;

/** Grapheme_Cluster_Break property value (UAX #29); `Other` for code points the file omits. */
export type GraphemeClusterBreak = (typeof GRAPHEME_CLUSTER_BREAK_VALUES)[number];

/** Indic_Conjunct_Break property value; `None` for code points the file omits. */
export type IndicConjunctBreak = (typeof INDIC_CONJUNCT_BREAK_VALUES)[number];

/** The character properties bundled for one code point. */
export interface CodePointProperties {
  bidiControl: boolean;
  defaultIgnorable: boolean;
  extendedPictographic: boolean;
  /** General_Category short alias, e.g. `Cf`. */
  generalCategory: string;
  graphemeClusterBreak: GraphemeClusterBreak;
  indicConjunctBreak: IndicConjunctBreak;
  noncharacter: boolean;
  /** Script property value as written in `Scripts.txt` (`Old_Italic`); `Unknown` when unlisted. */
  script: string;
  whiteSpace: boolean;
}

/** One `NameAliases.txt` entry. */
export interface NameAlias {
  alias: string;
  type: (typeof NAME_ALIAS_TYPE_VALUES)[number];
}

/** The four normalization forms of one code point, as code point sequences. */
export interface NormalizationForms {
  nfc: number[];
  nfd: number[];
  nfkc: number[];
  nfkd: number[];
}

/**
 * Lookups over the bundled Unicode Character Database. Each accepts any integer from 0 to
 * 0x10FFFF, surrogates and unassigned code points included, and throws only for a value
 * outside that range.
 */
export interface UnicodeTables {
  /** Name aliases in `NameAliases.txt` order; `[]` when the code point has none. */
  aliases(codePoint: number): NameAlias[];
  /** `Blocks.txt` block name; null outside every block (property value `No_Block`). */
  block(codePoint: number): string | null;
  /** General_Category long alias for a short alias (`Cf` → `Format`); throws for any other value. */
  categoryName(generalCategory: string): string;
  /** Unicode Name: stored, Hangul syllable (NR1), or range-derived (NR2); null when it has none. */
  name(codePoint: number): string | null;
  /** NFC, NFD, NFKC, and NFKD of the code point; the code point itself in every form when unlisted. */
  normalization(codePoint: number): NormalizationForms;
  /** Bundled properties of the code point: one shared, frozen object per distinct property set. */
  properties(codePoint: number): CodePointProperties;
}

const MAX_CODE_POINT = 0x10ffff;
const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JAMO_L_BASE = 0x1100;
const JAMO_V_BASE = 0x1161;
const JAMO_T_BASE = 0x11a7;
const JAMO_L_COUNT = 19;
const JAMO_V_COUNT = 21;
const JAMO_T_COUNT = 28;
const JAMO_VT_COUNT = JAMO_V_COUNT * JAMO_T_COUNT;

/**
 * Decodes all three data modules and returns their lookups. Validates every table while it
 * decodes, so a malformed or mismatched table fails here rather than at lookup time. Each call
 * decodes afresh: call it once at startup and share the result.
 * @throws McpError (InternalError) with `data.table` and `data.field` naming the defective table.
 */
export function loadUnicodeTables(): UnicodeTables {
  if (NAMES_UCD_VERSION !== PROPERTIES_UCD_VERSION) {
    malformed(
      'names',
      'UCD_VERSION',
      `${NAMES_UCD_VERSION} differs from ${PROPERTIES_UCD_VERSION}`,
    );
  }
  if (NORMALIZATION_UCD_VERSION !== PROPERTIES_UCD_VERSION) {
    malformed(
      'normalization',
      'UCD_VERSION',
      `${NORMALIZATION_UCD_VERSION} differs from ${PROPERTIES_UCD_VERSION}`,
    );
  }
  const name = decodeNames();
  const aliases = decodeAliases();
  const { properties, categoryName } = decodeProperties();
  const block = decodeBlocks();
  const normalization = decodeNormalization();
  return {
    aliases: (codePoint) => aliases(checkCodePoint(codePoint)),
    block: (codePoint) => block(checkCodePoint(codePoint)),
    categoryName,
    name: (codePoint) => name(checkCodePoint(codePoint)),
    normalization: (codePoint) => normalization(checkCodePoint(codePoint)),
    properties: (codePoint) => properties(checkCodePoint(codePoint)),
  };
}

function decodeNames(): (codePoint: number) => string | null {
  const table = 'names';
  const alphabetLength = NAME_CODE_ALPHABET.length;
  const digitOf = new Int8Array(128).fill(-1);
  for (let i = 0; i < alphabetLength; i++) {
    const unit = NAME_CODE_ALPHABET.charCodeAt(i);
    if (unit <= 0x20 || unit >= 0x7f || digitOf[unit] !== -1) {
      malformed(
        table,
        'NAME_CODE_ALPHABET',
        `character ${i} is not a unique printable ASCII character`,
      );
    }
    digitOf[unit] = i;
  }
  const widths = NAME_CODE_WIDTHS.split(',').map((w) =>
    parseNumber(w, 10, table, 'NAME_CODE_WIDTHS'),
  );
  const [one = 0, two = 0, three = 0] = widths;
  if (widths.length !== 3 || one + two + three !== alphabetLength) {
    malformed(
      table,
      'NAME_CODE_WIDTHS',
      `widths must be three counts summing to ${alphabetLength}`,
    );
  }
  const words = NAME_WORDS.split('_');
  const twoBase = one;
  const threeBase = one + two * alphabetLength;
  const digit = (code: string, pos: number): number => {
    const value = pos < code.length ? (digitOf[code.charCodeAt(pos)] ?? -1) : -1;
    if (value < 0) malformed(table, 'NAME_CODES', `invalid word code "${code}"`);
    return value;
  };

  const storedNames = NAME_CODES.split(' ').map((code, n) => {
    const parts: string[] = [];
    let pos = 0;
    while (pos < code.length) {
      const lead = digit(code, pos);
      let index: number;
      if (lead < one) {
        index = lead;
        pos += 1;
      } else if (lead < one + two) {
        index = twoBase + (lead - one) * alphabetLength + digit(code, pos + 1);
        pos += 2;
      } else {
        index =
          threeBase +
          (lead - one - two) * alphabetLength * alphabetLength +
          digit(code, pos + 1) * alphabetLength +
          digit(code, pos + 2);
        pos += 3;
      }
      const word = words[index];
      if (word === undefined) malformed(table, 'NAME_CODES', `word ${index} is out of range`);
      parts.push(word);
    }
    if (parts.length === 0) malformed(table, 'NAME_CODES', `name ${n} is empty`);
    return parts.join(' ');
  });

  const runFields = NAME_RUNS.split(',');
  const runStarts = new Int32Array(runFields.length);
  const runLengths = new Int32Array(runFields.length);
  const runOrdinals = new Int32Array(runFields.length);
  let runEnd = 0;
  let ordinal = 0;
  runFields.forEach((field, i) => {
    const [gapText = '', lengthText = ''] = field.split(':');
    const gap = parseNumber(gapText, 36, table, 'NAME_RUNS');
    const length = parseNumber(lengthText, 36, table, 'NAME_RUNS');
    if ((i > 0 && gap === 0) || length === 0)
      malformed(table, 'NAME_RUNS', `run ${i} is empty or adjacent`);
    runStarts[i] = runEnd + gap;
    runLengths[i] = length;
    runOrdinals[i] = ordinal;
    runEnd += gap + length;
    ordinal += length;
  });
  if (ordinal !== storedNames.length || runEnd - 1 > MAX_CODE_POINT) {
    malformed(
      table,
      'NAME_RUNS',
      `runs cover ${ordinal} names ending at ${runEnd - 1}, expected ${storedNames.length}`,
    );
  }

  const jamo = JAMO_SHORT_NAMES.split('|').map((group) => group.split(','));
  const [jamoL = [], jamoV = [], jamoT = []] = jamo;
  if (
    jamo.length !== 3 ||
    jamoL.length !== JAMO_L_COUNT ||
    jamoV.length !== JAMO_V_COUNT ||
    jamoT.length !== JAMO_T_COUNT
  ) {
    malformed(table, 'JAMO_SHORT_NAMES', 'expected 19, 21, and 28 short names');
  }

  const derived = parseRangeList(DERIVED_NAME_RANGES, table, 'DERIVED_NAME_RANGES');

  return (codePoint) => {
    const run = floorIndex(runStarts, codePoint);
    if (run >= 0) {
      const offset = codePoint - at(runStarts, run);
      if (offset < at(runLengths, run)) return at(storedNames, at(runOrdinals, run) + offset);
    }
    if (codePoint >= HANGUL_FIRST && codePoint <= HANGUL_LAST) {
      const s = codePoint - HANGUL_FIRST;
      const l = at(jamoL, Math.floor(s / JAMO_VT_COUNT));
      const v = at(jamoV, Math.floor((s % JAMO_VT_COUNT) / JAMO_T_COUNT));
      const t = at(jamoT, s % JAMO_T_COUNT);
      return `HANGUL SYLLABLE ${l}${v}${t}`;
    }
    const range = derived.find(codePoint);
    return range === null ? null : `${range}${hex(codePoint)}`;
  };
}

function decodeAliases(): (codePoint: number) => NameAlias[] {
  const table = 'names';
  const types = NAME_ALIAS_TYPES.split(',').map((type) => {
    if (!isOneOf(NAME_ALIAS_TYPE_VALUES, type))
      malformed(table, 'NAME_ALIAS_TYPES', `unknown type "${type}"`);
    return type;
  });
  const byCodePoint = new Map<number, readonly NameAlias[]>();
  let previous = -1;
  for (const entry of NAME_ALIASES.split(';')) {
    const [cpText = '', list = ''] = entry.split(':');
    const codePoint = parseNumber(cpText, 36, table, 'NAME_ALIASES');
    if (codePoint <= previous || codePoint > MAX_CODE_POINT || list === '') {
      malformed(table, 'NAME_ALIASES', `entry for ${hex(codePoint)} is out of order or empty`);
    }
    previous = codePoint;
    const aliases = list.split('|').map((item) => {
      const type = types[parseNumber(item.slice(0, 1), 10, table, 'NAME_ALIASES')];
      const alias = item.slice(1);
      if (type === undefined || alias === '')
        malformed(table, 'NAME_ALIASES', `bad alias "${item}"`);
      return Object.freeze({ alias, type });
    });
    byCodePoint.set(codePoint, aliases);
  }
  return (codePoint) => [...(byCodePoint.get(codePoint) ?? [])];
}

function decodeProperties(): Pick<UnicodeTables, 'categoryName' | 'properties'> {
  const table = 'properties';
  const longNames = new Map<string, string>();
  const categories = GENERAL_CATEGORIES.split(',').map((pair) => {
    const [short = '', long = ''] = pair.split(':');
    if (short === '' || long === '' || longNames.has(short)) {
      malformed(table, 'GENERAL_CATEGORIES', `bad entry "${pair}"`);
    }
    longNames.set(short, long);
    return short;
  });
  const scripts = SCRIPTS.split(',');
  const graphemeBreaks = GRAPHEME_CLUSTER_BREAKS.split(',').map((value) => {
    if (!isOneOf(GRAPHEME_CLUSTER_BREAK_VALUES, value)) {
      malformed(table, 'GRAPHEME_CLUSTER_BREAKS', `unknown value "${value}"`);
    }
    return value;
  });
  const conjunctBreaks = INDIC_CONJUNCT_BREAKS.split(',').map((value) => {
    if (!isOneOf(INDIC_CONJUNCT_BREAK_VALUES, value)) {
      malformed(table, 'INDIC_CONJUNCT_BREAKS', `unknown value "${value}"`);
    }
    return value;
  });
  const flagNames = PROPERTY_FLAGS.split(',');
  const flagBit = (flag: string): number => {
    const bit = flagNames.indexOf(flag);
    if (bit < 0) malformed(table, 'PROPERTY_FLAGS', `missing ${flag}`);
    return 1 << bit;
  };
  const whiteSpace = flagBit('White_Space');
  const defaultIgnorable = flagBit('Default_Ignorable_Code_Point');
  const bidiControl = flagBit('Bidi_Control');
  const extendedPictographic = flagBit('Extended_Pictographic');
  const noncharacter = flagBit('Noncharacter_Code_Point');
  if (flagNames.length !== 5) malformed(table, 'PROPERTY_FLAGS', 'expected exactly 5 flags');

  const tuples = PROPERTY_TUPLES.split(';').map((tuple): CodePointProperties => {
    const [gc, script, gcb, incb, flags] = tuple
      .split('.')
      .map((field) => parseNumber(field, 36, table, 'PROPERTY_TUPLES'));
    const generalCategory = categories[gc ?? -1];
    const scriptName = scripts[script ?? -1];
    const graphemeClusterBreak = graphemeBreaks[gcb ?? -1];
    const indicConjunctBreak = conjunctBreaks[incb ?? -1];
    if (
      generalCategory === undefined ||
      scriptName === undefined ||
      graphemeClusterBreak === undefined ||
      indicConjunctBreak === undefined ||
      flags === undefined ||
      flags >= 1 << flagNames.length
    ) {
      malformed(table, 'PROPERTY_TUPLES', `bad tuple "${tuple}"`);
    }
    return Object.freeze({
      bidiControl: (flags & bidiControl) !== 0,
      defaultIgnorable: (flags & defaultIgnorable) !== 0,
      extendedPictographic: (flags & extendedPictographic) !== 0,
      generalCategory,
      graphemeClusterBreak,
      indicConjunctBreak,
      noncharacter: (flags & noncharacter) !== 0,
      script: scriptName,
      whiteSpace: (flags & whiteSpace) !== 0,
    });
  });

  const runFields = PROPERTY_RUNS.split(';');
  const runStarts = new Int32Array(runFields.length);
  const runTuples: CodePointProperties[] = [];
  let start = 0;
  runFields.forEach((field, i) => {
    const [deltaText = '', tupleText = ''] = field.split(',');
    const delta = parseNumber(deltaText, 36, table, 'PROPERTY_RUNS');
    const tuple = tuples[parseNumber(tupleText, 36, table, 'PROPERTY_RUNS')];
    start += delta;
    if ((i === 0) !== (delta === 0) || start > MAX_CODE_POINT || tuple === undefined) {
      malformed(table, 'PROPERTY_RUNS', `run ${i} ("${field}") is out of order or names no tuple`);
    }
    runStarts[i] = start;
    runTuples.push(tuple);
  });

  return {
    categoryName: (generalCategory) => {
      const long = longNames.get(generalCategory);
      if (long === undefined) {
        throw internalError('Unknown General_Category short alias.', { generalCategory });
      }
      return long;
    },
    properties: (codePoint) => at(runTuples, floorIndex(runStarts, codePoint)),
  };
}

function decodeBlocks(): (codePoint: number) => string | null {
  const blocks = parseRangeList(BLOCKS, 'properties', 'BLOCKS');
  return (codePoint) => blocks.find(codePoint);
}

function decodeNormalization(): (codePoint: number) => NormalizationForms {
  const table = 'normalization';
  const field = 'NORMALIZATION_FORMS';
  const rows = NORMALIZATION_FORMS.split(';');
  const rowCodePoints = new Int32Array(rows.length);
  const rowForms: (readonly number[])[][] = [];
  let codePoint = 0;
  rows.forEach((row, i) => {
    const [deltaText = '', formsText = ''] = row.split(':');
    const delta = parseNumber(deltaText, 36, table, field);
    codePoint += delta;
    if (delta === 0 || codePoint > MAX_CODE_POINT)
      malformed(table, field, `row ${i} is out of order`);
    const forms: (readonly number[])[] = [];
    for (const form of formsText.split(',')) {
      const previous = forms.at(-1);
      if (form === '^' && previous !== undefined) forms.push(previous);
      else if (form === '') forms.push([codePoint]);
      else {
        forms.push(
          form.split('.').map((cp) => {
            const value = parseNumber(cp, 36, table, field);
            if (value > MAX_CODE_POINT) malformed(table, field, `row ${i} names ${value}`);
            return value;
          }),
        );
      }
    }
    if (forms.length !== 4) malformed(table, field, `row ${i} has ${forms.length} forms`);
    rowCodePoints[i] = codePoint;
    rowForms.push(forms);
  });

  return (cp) => {
    const row = floorIndex(rowCodePoints, cp);
    if (row >= 0 && rowCodePoints[row] === cp) {
      const [nfc = [], nfd = [], nfkc = [], nfkd = []] = at(rowForms, row);
      return { nfc: [...nfc], nfd: [...nfd], nfkc: [...nfkc], nfkd: [...nfkd] };
    }
    if (cp >= HANGUL_FIRST && cp <= HANGUL_LAST) {
      const s = cp - HANGUL_FIRST;
      const t = s % JAMO_T_COUNT;
      const decomposed = [
        JAMO_L_BASE + Math.floor(s / JAMO_VT_COUNT),
        JAMO_V_BASE + Math.floor((s % JAMO_VT_COUNT) / JAMO_T_COUNT),
      ];
      if (t > 0) decomposed.push(JAMO_T_BASE + t);
      return { nfc: [cp], nfd: decomposed, nfkc: [cp], nfkd: [...decomposed] };
    }
    return { nfc: [cp], nfd: [cp], nfkc: [cp], nfkd: [cp] };
  };
}

/**
 * Parses `start,end,label` entries (base-36 bounds, `;`-separated), sorted and non-overlapping,
 * into a lookup returning the label of the range containing a code point, or null.
 */
function parseRangeList(
  text: string,
  table: string,
  field: string,
): { find(codePoint: number): string | null } {
  const entries = text.split(';');
  const starts = new Int32Array(entries.length);
  const ends = new Int32Array(entries.length);
  const labels: string[] = [];
  let previousEnd = -1;
  entries.forEach((entry, i) => {
    const [startText = '', endText = '', label = ''] = entry.split(',');
    const start = parseNumber(startText, 36, table, field);
    const end = parseNumber(endText, 36, table, field);
    if (start <= previousEnd || end < start || end > MAX_CODE_POINT || label === '') {
      malformed(table, field, `entry ${i} ("${entry}") is out of order or unlabeled`);
    }
    starts[i] = start;
    ends[i] = end;
    labels.push(label);
    previousEnd = end;
  });
  return {
    find(codePoint) {
      const i = floorIndex(starts, codePoint);
      return i >= 0 && codePoint <= at(ends, i) ? at(labels, i) : null;
    },
  };
}

/** Index of the last element of ascending `starts` that is ≤ `value`; -1 when none is. */
function floorIndex(starts: Int32Array, value: number): number {
  let low = 0;
  let high = starts.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    if (at(starts, mid) <= value) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return found;
}

/** Element `i` of an array the caller has bounds-checked; throws if the check was wrong. */
function at<T>(items: ArrayLike<T>, i: number): T {
  const item = items[i];
  if (item === undefined) throw internalError(`Unicode table index ${i} is out of bounds.`);
  return item;
}

function parseNumber(text: string, radix: 10 | 36, table: string, field: string): number {
  const pattern = radix === 10 ? /^[0-9]+$/ : /^[0-9a-z]+$/;
  if (!pattern.test(text)) malformed(table, field, `"${text}" is not a base-${radix} number`);
  return Number.parseInt(text, radix);
}

function isOneOf<const T extends string>(values: readonly T[], value: string): value is T {
  return values.some((v) => v === value);
}

function checkCodePoint(codePoint: number): number {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) {
    throw internalError('Code point is outside 0 to 0x10FFFF.', { codePoint });
  }
  return codePoint;
}

function hex(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, '0');
}

function malformed(table: string, field: string, detail: string): never {
  throw internalError(
    `Bundled Unicode table ${table}.${field} is malformed: ${detail}. Regenerate it with \`bun run generate:unicode\`.`,
    { table, field },
  );
}
