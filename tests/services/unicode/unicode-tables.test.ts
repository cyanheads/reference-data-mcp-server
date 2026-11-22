/**
 * @fileoverview Tests for the Unicode table decoder. Every expected value is a literal read from
 * the UCD 18.0.0 source files (DerivedName.txt, NameAliases.txt, DerivedGeneralCategory.txt,
 * Scripts.txt, PropList.txt, DerivedCoreProperties.txt, GraphemeBreakProperty.txt,
 * emoji-data.txt, Blocks.txt, PropertyValueAliases.txt, NormalizationTest.txt), never from the
 * decoder's own output.
 * @module tests/services/unicode/unicode-tables.test
 */

import { readFileSync } from 'node:fs';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  type CodePointProperties,
  loadUnicodeTables,
  UNICODE_VERSION,
  type UnicodeTables,
} from '@/services/unicode/unicode-tables.js';

const MAX_CODE_POINT = 0x10ffff;
const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** The eight NR2 prefixes `DerivedName.txt` 18.0.0 uses (its `*` lines). */
const DERIVED_NAME_PREFIXES = [
  'CJK UNIFIED IDEOGRAPH-',
  'CJK COMPATIBILITY IDEOGRAPH-',
  'EGYPTIAN HIEROGLYPH-',
  'TANGUT IDEOGRAPH-',
  'KHITAN SMALL SCRIPT CHARACTER-',
  'JURCHEN CHARACTER-',
  'NUSHU CHARACTER-',
  'SMALL SEAL CHARACTER-',
];

let tables: UnicodeTables;
beforeAll(() => {
  tables = loadUnicodeTables();
});

const hex = (cp: number): string => cp.toString(16).toUpperCase().padStart(4, '0');

/** The prefix when `name` is the NR2 form of `cp` (prefix + its own hex), else null. */
function derivedPrefix(cp: number, name: string): string | null {
  return DERIVED_NAME_PREFIXES.find((prefix) => name === `${prefix}${hex(cp)}`) ?? null;
}

/** The leading JSDoc block of a generated module, with comment markers stripped and lines joined. */
function headerOf(module: string): string {
  const source = readFileSync(
    new URL(`../../../src/data/unicode/${module}.ts`, import.meta.url),
    'utf8',
  );
  const block = source.slice(0, source.indexOf('*/'));
  return block
    .split('\n')
    .map((line) => line.replace(/^\s*\/?\*+\s?/, ''))
    .join(' ');
}

/** The integer the header states before `label`, e.g. "35,351 stored names" → 35351. */
function statedCount(header: string, label: string): number {
  const match = new RegExp(`([\\d,]+)[ -]${label}`).exec(header);
  if (!match?.[1]) throw new Error(`Header states no count for "${label}": ${header}`);
  return Number(match[1].replaceAll(',', ''));
}

function properties(overrides: Partial<CodePointProperties>): CodePointProperties {
  return {
    bidiControl: false,
    defaultIgnorable: false,
    extendedPictographic: false,
    generalCategory: 'Cn',
    graphemeClusterBreak: 'Other',
    indicConjunctBreak: 'None',
    noncharacter: false,
    script: 'Unknown',
    whiteSpace: false,
    ...overrides,
  };
}

describe('UNICODE_VERSION', () => {
  it('is the bundled UCD version', () => {
    expect(UNICODE_VERSION).toBe('18.0.0');
  });
});

describe('name', () => {
  it.each([
    [0x0020, 'SPACE'],
    [0x00a0, 'NO-BREAK SPACE'],
    [0x0558, 'MODIFIER LETTER ARMENIAN SMALL EH'],
    [0x1680, 'OGHAM SPACE MARK'],
    [0x200b, 'ZERO WIDTH SPACE'],
    [0x202e, 'RIGHT-TO-LEFT OVERRIDE'],
    [0x2800, 'BRAILLE PATTERN BLANK'],
    [0x3164, 'HANGUL FILLER'],
    [0xfeff, 'ZERO WIDTH NO-BREAK SPACE'],
    [0x1e9b, 'LATIN SMALL LETTER LONG S WITH DOT ABOVE'],
    [0x1f600, 'GRINNING FACE'],
  ])('code point %i has its stored name', (cp, name) => {
    expect(tables.name(cp)).toBe(name);
  });

  it('reads the first and last code point of a run of stored names', () => {
    expect(tables.name(0x001f)).toBeNull();
    expect(tables.name(0x0020)).toBe('SPACE');
    expect(tables.name(0x007e)).toBe('TILDE');
    expect(tables.name(0x007f)).toBeNull();
  });

  it.each([
    [0xac00, 'HANGUL SYLLABLE GA'],
    [0xac01, 'HANGUL SYLLABLE GAG'],
    [0xd7a3, 'HANGUL SYLLABLE HIH'],
  ])('derives the Hangul syllable name of code point %i (NR1)', (cp, name) => {
    expect(tables.name(cp)).toBe(name);
  });

  it.each([
    [0x4e00, 'CJK UNIFIED IDEOGRAPH-4E00'],
    [0x9fff, 'CJK UNIFIED IDEOGRAPH-9FFF'],
    [0x3d000, 'SMALL SEAL CHARACTER-3D000'],
    [0x3fc3f, 'SMALL SEAL CHARACTER-3FC3F'],
    [0x18cff, 'KHITAN SMALL SCRIPT CHARACTER-18CFF'],
    [0x18d00, 'TANGUT IDEOGRAPH-18D00'],
  ])('derives the range name of code point %i (NR2), range ends included', (cp, name) => {
    expect(tables.name(cp)).toBe(name);
  });

  it.each([
    [0x0000, 'control'],
    [0x0009, 'control'],
    [0x0378, 'reserved'],
    [0xd800, 'surrogate'],
    [0xe000, 'private use'],
    [0xfffe, 'noncharacter'],
    [0x3fc40, 'reserved, just past the Seal range'],
    [0x50000, 'reserved, outside every block'],
    [MAX_CODE_POINT, 'noncharacter, the last code point'],
  ])('is null for code point %i (%s)', (cp) => {
    expect(tables.name(cp)).toBeNull();
  });
});

describe('aliases', () => {
  it.each([
    [
      0x0000,
      [
        { alias: 'NULL', type: 'control' },
        { alias: 'NUL', type: 'abbreviation' },
      ],
    ],
    [
      0x0009,
      [
        { alias: 'CHARACTER TABULATION', type: 'control' },
        { alias: 'HORIZONTAL TABULATION', type: 'control' },
        { alias: 'HT', type: 'abbreviation' },
        { alias: 'TAB', type: 'abbreviation' },
      ],
    ],
    [
      0x0080,
      [
        { alias: 'PADDING CHARACTER', type: 'figment' },
        { alias: 'PAD', type: 'abbreviation' },
      ],
    ],
    [0x01a2, [{ alias: 'LATIN CAPITAL LETTER GHA', type: 'correction' }]],
    [0x200b, [{ alias: 'ZWSP', type: 'abbreviation' }]],
    [0x202e, [{ alias: 'RLO', type: 'abbreviation' }]],
    [
      0xfeff,
      [
        { alias: 'BYTE ORDER MARK', type: 'alternate' },
        { alias: 'BOM', type: 'abbreviation' },
        { alias: 'ZWNBSP', type: 'abbreviation' },
      ],
    ],
  ])('code point %i lists its NameAliases.txt entries in file order', (cp, aliases) => {
    expect(tables.aliases(cp)).toEqual(aliases);
  });

  it('keeps the stored name beside the aliases (U+01A2 has a correction alias)', () => {
    expect(tables.name(0x01a2)).toBe('LATIN CAPITAL LETTER OI');
  });

  it('is empty for a code point without aliases', () => {
    expect(tables.aliases(0x0041)).toEqual([]);
    expect(tables.aliases(MAX_CODE_POINT)).toEqual([]);
  });

  it('returns a fresh array on every call', () => {
    tables.aliases(0x200b).pop();
    expect(tables.aliases(0x200b)).toEqual([{ alias: 'ZWSP', type: 'abbreviation' }]);
  });
});

describe('properties', () => {
  it.each<[number, Partial<CodePointProperties>]>([
    [0x0000, { generalCategory: 'Cc', script: 'Common', graphemeClusterBreak: 'Control' }],
    [
      0x0009,
      {
        generalCategory: 'Cc',
        script: 'Common',
        graphemeClusterBreak: 'Control',
        whiteSpace: true,
      },
    ],
    [0x00a0, { generalCategory: 'Zs', script: 'Common', whiteSpace: true }],
    [0x0378, {}],
    [0x0558, { generalCategory: 'Lm', script: 'Armenian' }],
    [0x0915, { generalCategory: 'Lo', script: 'Devanagari', indicConjunctBreak: 'Consonant' }],
    [
      0x094d,
      {
        generalCategory: 'Mn',
        script: 'Devanagari',
        graphemeClusterBreak: 'Extend',
        indicConjunctBreak: 'Linker',
      },
    ],
    [0x1680, { generalCategory: 'Zs', script: 'Ogham', whiteSpace: true }],
    [
      0x200b,
      {
        generalCategory: 'Cf',
        script: 'Common',
        graphemeClusterBreak: 'Control',
        defaultIgnorable: true,
      },
    ],
    [
      0x202e,
      {
        generalCategory: 'Cf',
        script: 'Common',
        graphemeClusterBreak: 'Control',
        defaultIgnorable: true,
        bidiControl: true,
      },
    ],
    [0x2800, { generalCategory: 'So', script: 'Braille' }],
    [0x3164, { generalCategory: 'Lo', script: 'Hangul', defaultIgnorable: true }],
    [0x4e00, { generalCategory: 'Lo', script: 'Han' }],
    [0xd800, { generalCategory: 'Cs' }],
    [0xe000, { generalCategory: 'Co' }],
    [0xfffe, { noncharacter: true }],
    [
      0x1f1e6,
      { generalCategory: 'So', script: 'Common', graphemeClusterBreak: 'Regional_Indicator' },
    ],
    [0x1f600, { generalCategory: 'So', script: 'Common', extendedPictographic: true }],
    [0x3d000, { generalCategory: 'Lo', script: 'Seal' }],
    [MAX_CODE_POINT, { noncharacter: true }],
  ])('code point %i', (cp, expected) => {
    expect(tables.properties(cp)).toEqual(properties(expected));
  });

  it('reads the first and last code point of a run (0041..005A Lu Latin)', () => {
    expect(tables.properties(0x0040)).toMatchObject({ generalCategory: 'Po', script: 'Common' });
    expect(tables.properties(0x0041)).toMatchObject({ generalCategory: 'Lu', script: 'Latin' });
    expect(tables.properties(0x005a)).toMatchObject({ generalCategory: 'Lu', script: 'Latin' });
    expect(tables.properties(0x005b)).toMatchObject({ generalCategory: 'Ps', script: 'Common' });
  });

  it('returns a frozen object', () => {
    expect(Object.isFrozen(tables.properties(0x0041))).toBe(true);
  });
});

describe('categoryName', () => {
  it.each([
    ['Cc', 'Control'],
    ['Cf', 'Format'],
    ['Cn', 'Unassigned'],
    ['Co', 'Private_Use'],
    ['Cs', 'Surrogate'],
    ['Lu', 'Uppercase_Letter'],
    ['Mn', 'Nonspacing_Mark'],
    ['Zs', 'Space_Separator'],
  ])('%s → %s (PropertyValueAliases.txt long alias)', (short, long) => {
    expect(tables.categoryName(short)).toBe(long);
  });

  it('names all 30 General_Category values that occur', () => {
    const seen = new Set<string>();
    for (let cp = 0; cp <= MAX_CODE_POINT; cp++) seen.add(tables.properties(cp).generalCategory);
    expect(seen.size).toBe(30);
    for (const gc of seen) expect(tables.categoryName(gc)).toMatch(/^[A-Z][a-z]+(_[A-Z][a-z]+)*$/);
  });

  it.each(['L', 'LC', 'Cx', ''])(
    'throws for %j, which is not a single-category short alias',
    (value) => {
      expect(() => tables.categoryName(value)).toThrow(
        expect.objectContaining({ code: JsonRpcErrorCode.InternalError }),
      );
    },
  );
});

describe('block', () => {
  it.each([
    [0x0000, 'Basic Latin'],
    [0x007f, 'Basic Latin'],
    [0x0080, 'Latin-1 Supplement'],
    [0x0378, 'Greek and Coptic'],
    [0x4e00, 'CJK Unified Ideographs'],
    [0xd800, 'High Surrogates'],
    [0xe000, 'Private Use Area'],
    [0xfeff, 'Arabic Presentation Forms-B'],
    [0xfffe, 'Specials'],
    [0x3d000, 'Seal'],
    [0x3fc3f, 'Seal'],
    [0x100000, 'Supplementary Private Use Area-B'],
    [MAX_CODE_POINT, 'Supplementary Private Use Area-B'],
  ])('code point %i is in %s', (cp, block) => {
    expect(tables.block(cp)).toBe(block);
  });

  it.each([0x3fc40, 0x50000, 0xdffff])('is null for code point %i, outside every block', (cp) => {
    expect(tables.block(cp)).toBeNull();
  });
});

describe('normalization', () => {
  it.each([
    [0x0558, { nfc: [0x0558], nfd: [0x0558], nfkc: [0x0567], nfkd: [0x0567] }],
    [0x00a0, { nfc: [0x00a0], nfd: [0x00a0], nfkc: [0x0020], nfkd: [0x0020] }],
    [0x1e9b, { nfc: [0x1e9b], nfd: [0x017f, 0x0307], nfkc: [0x1e61], nfkd: [0x0073, 0x0307] }],
    [0x2126, { nfc: [0x03a9], nfd: [0x03a9], nfkc: [0x03a9], nfkd: [0x03a9] }],
    [0x212b, { nfc: [0x00c5], nfd: [0x0041, 0x030a], nfkc: [0x00c5], nfkd: [0x0041, 0x030a] }],
    [0x3164, { nfc: [0x3164], nfd: [0x3164], nfkc: [0x1160], nfkd: [0x1160] }],
    [0xfb01, { nfc: [0xfb01], nfd: [0xfb01], nfkc: [0x0066, 0x0069], nfkd: [0x0066, 0x0069] }],
  ])('code point %i matches its NormalizationTest.txt Part 1 row', (cp, forms) => {
    expect(tables.normalization(cp)).toEqual(forms);
  });

  it('expands U+FDFA to 18 code points under NFKC and NFKD', () => {
    const expanded = [
      0x0635, 0x0644, 0x0649, 0x0020, 0x0627, 0x0644, 0x0644, 0x0647, 0x0020, 0x0639, 0x0644,
      0x064a, 0x0647, 0x0020, 0x0648, 0x0633, 0x0644, 0x0645,
    ];
    expect(tables.normalization(0xfdfa)).toEqual({
      nfc: [0xfdfa],
      nfd: [0xfdfa],
      nfkc: expanded,
      nfkd: expanded,
    });
  });

  it.each([
    [0xac00, [0x1100, 0x1161]],
    [0xac01, [0x1100, 0x1161, 0x11a8]],
    [0xd7a3, [0x1112, 0x1175, 0x11c2]],
  ])(
    'computes Hangul syllable code point %i: decomposed under NFD/NFKD, itself under NFC/NFKC',
    (cp, jamo) => {
      expect(tables.normalization(cp)).toEqual({ nfc: [cp], nfd: jamo, nfkc: [cp], nfkd: jamo });
    },
  );

  it.each([0x0041, 0x0301, 0xd800, 0x50000, MAX_CODE_POINT])(
    'maps code point %i, which Part 1 does not list, to itself in every form',
    (cp) => {
      expect(tables.normalization(cp)).toEqual({ nfc: [cp], nfd: [cp], nfkc: [cp], nfkd: [cp] });
    },
  );

  it('returns fresh arrays on every call', () => {
    tables.normalization(0x212b).nfd.pop();
    expect(tables.normalization(0x212b).nfd).toEqual([0x0041, 0x030a]);
  });
});

describe('code point range', () => {
  const lookups = ['aliases', 'block', 'name', 'normalization', 'properties'] as const;

  it.each(lookups)('%s answers U+0000 and U+10FFFF without throwing', (lookup) => {
    expect(() => tables[lookup](0)).not.toThrow();
    expect(() => tables[lookup](MAX_CODE_POINT)).not.toThrow();
  });

  it.each(
    lookups.flatMap((lookup) => [-1, 0x110000, 1.5, Number.NaN].map((cp) => [lookup, cp] as const)),
  )('%s throws InternalError for %s', (lookup, cp) => {
    expect(() => tables[lookup](cp)).toThrow(
      expect.objectContaining({ code: JsonRpcErrorCode.InternalError, data: { codePoint: cp } }),
    );
  });
});

describe('generated module headers state the decoded entry counts', () => {
  it('names.ts: stored names, runs, derived-name ranges, aliases', () => {
    const header = headerOf('names');
    let stored = 0;
    let storedRuns = 0;
    let derivedRanges = 0;
    let aliases = 0;
    let aliasedCodePoints = 0;
    let previous: string | null = null;
    for (let cp = 0; cp <= MAX_CODE_POINT; cp++) {
      const name = tables.name(cp);
      const hangul = cp >= HANGUL_FIRST && cp <= HANGUL_LAST;
      const kind = name === null || hangul ? null : (derivedPrefix(cp, name) ?? 'stored');
      if (kind === 'stored') stored++;
      if (kind !== null && kind !== previous) {
        if (kind === 'stored') storedRuns++;
        else derivedRanges++;
      }
      previous = kind;
      const count = tables.aliases(cp).length;
      aliases += count;
      if (count > 0) aliasedCodePoints++;
    }
    expect(stored).toBe(statedCount(header, 'stored names'));
    expect(storedRuns).toBe(statedCount(header, 'runs'));
    expect(derivedRanges).toBe(statedCount(header, 'derived-name ranges'));
    expect(aliases).toBe(statedCount(header, 'aliases'));
    expect(aliasedCodePoints).toBe(statedCount(header, 'code points'));
  });

  it('properties.ts: runs, property tuples, blocks', () => {
    const header = headerOf('properties');
    const tuples = new Set<CodePointProperties>();
    let runs = 0;
    let blocks = 0;
    let previous: CodePointProperties | undefined;
    let previousBlock: string | null = null;
    for (let cp = 0; cp <= MAX_CODE_POINT; cp++) {
      const current = tables.properties(cp);
      if (current !== previous) runs++;
      tuples.add(current);
      previous = current;
      const block = tables.block(cp);
      if (block !== null && block !== previousBlock) blocks++;
      previousBlock = block;
    }
    expect(runs).toBe(statedCount(header, 'runs'));
    expect(tuples.size).toBe(statedCount(header, 'distinct property tuples'));
    expect(blocks).toBe(statedCount(header, 'blocks'));
  });

  it('normalization.ts: code points other than Hangul syllables with a changed form', () => {
    const header = headerOf('normalization');
    let changed = 0;
    for (let cp = 0; cp <= MAX_CODE_POINT; cp++) {
      if (cp >= HANGUL_FIRST && cp <= HANGUL_LAST) continue;
      const { nfc, nfd, nfkc, nfkd } = tables.normalization(cp);
      if ([nfc, nfd, nfkc, nfkd].some((form) => form.length !== 1 || form[0] !== cp)) changed++;
    }
    expect(changed).toBe(statedCount(header, 'code points other than Hangul syllables'));
  });
});

describe('loadUnicodeTables — a malformed table fails fast', () => {
  type Module = Record<string, unknown>;
  const cases: {
    module: string;
    patch: (original: Module) => Module;
    table: string;
    field: string;
  }[] = [
    {
      module: '@/data/unicode/names.js',
      patch: () => ({ NAME_CODES: '"' }),
      table: 'names',
      field: 'NAME_CODES',
    },
    {
      module: '@/data/unicode/names.js',
      patch: ({ NAME_RUNS }) => ({ NAME_RUNS: String(NAME_RUNS).replace(/,[^,]*$/, '') }),
      table: 'names',
      field: 'NAME_RUNS',
    },
    {
      module: '@/data/unicode/names.js',
      patch: ({ NAME_ALIAS_TYPES }) => ({ NAME_ALIAS_TYPES: `${NAME_ALIAS_TYPES},nickname` }),
      table: 'names',
      field: 'NAME_ALIAS_TYPES',
    },
    {
      module: '@/data/unicode/properties.js',
      patch: ({ PROPERTY_RUNS }) => ({ PROPERTY_RUNS: `${PROPERTY_RUNS};1,zzz` }),
      table: 'properties',
      field: 'PROPERTY_RUNS',
    },
    {
      module: '@/data/unicode/properties.js',
      patch: ({ GRAPHEME_CLUSTER_BREAKS }) => ({
        GRAPHEME_CLUSTER_BREAKS: String(GRAPHEME_CLUSTER_BREAKS).replace('ZWJ', 'Zwj'),
      }),
      table: 'properties',
      field: 'GRAPHEME_CLUSTER_BREAKS',
    },
    {
      module: '@/data/unicode/properties.js',
      patch: ({ BLOCKS }) => ({ BLOCKS: `0,1,Overlap;${BLOCKS}` }),
      table: 'properties',
      field: 'BLOCKS',
    },
    {
      module: '@/data/unicode/normalization.js',
      patch: () => ({ UCD_VERSION: '17.0.0' }),
      table: 'normalization',
      field: 'UCD_VERSION',
    },
    {
      module: '@/data/unicode/normalization.js',
      patch: ({ NORMALIZATION_FORMS }) => ({ NORMALIZATION_FORMS: `${NORMALIZATION_FORMS};1:,,` }),
      table: 'normalization',
      field: 'NORMALIZATION_FORMS',
    },
  ];

  afterEach(() => {
    vi.resetModules();
  });

  it.each(cases)('$table.$field', async ({ module, patch, table, field }) => {
    vi.resetModules();
    vi.doMock(module, async (importOriginal) => {
      const original = await importOriginal<Module>();
      return { ...original, ...patch(original) };
    });
    const fresh = await import('@/services/unicode/unicode-tables.js');
    vi.doUnmock(module);
    expect(() => fresh.loadUnicodeTables()).toThrow(
      expect.objectContaining({
        code: JsonRpcErrorCode.InternalError,
        data: { table, field },
      }),
    );
  });
});
