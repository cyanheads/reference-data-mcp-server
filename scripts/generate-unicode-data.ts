#!/usr/bin/env bun
/**
 * @fileoverview Generates the bundled Unicode data modules (`src/data/unicode/names.ts`,
 * `properties.ts`, `normalization.ts`) and the grapheme-break test fixture
 * (`tests/fixtures/unicode/GraphemeBreakTest-<version>.txt`) from the Unicode Character Database,
 * then checks that the shipped decoder (`src/services/unicode/unicode-tables.ts`) reproduces the
 * source files for every code point. Exits non-zero when any check fails.
 *
 * Source files are read from `.cache/ucd-<version>/` and downloaded from unicode.org only when
 * missing there. To move to a new Unicode version, change `UCD_VERSION`, run the script, then run
 * the tests.
 *
 * @example
 * // bun run generate:unicode
 *
 * @module scripts/generate-unicode-data
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { UnicodeTables } from '../src/services/unicode/unicode-tables.js';

/** Unicode Character Database version the generated modules carry. */
const UCD_VERSION = '18.0.0';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT_DIR, '.cache', `ucd-${UCD_VERSION}`);
const SOURCE_URL = `https://www.unicode.org/Public/${UCD_VERSION}/ucd/`;
const DATA_DIR = join(ROOT_DIR, 'src', 'data', 'unicode');
const FIXTURE_FILE = join(
  ROOT_DIR,
  'tests',
  'fixtures',
  'unicode',
  `GraphemeBreakTest-${UCD_VERSION}.txt`,
);
const DOWNLOAD_TIMEOUT_MS = 60_000;
const CODE_POINT_COUNT = 0x110000;
const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
/** Biome's `lineWidth`; generated lines are laid out the way Biome formats them. */
const LINE_WIDTH = 100;
/** Mismatches printed per failing check. */
const SAMPLE_LIMIT = 10;

/** UCD source files, by path under `SOURCE_URL`. Basenames are unique, so the cache is flat. */
const SOURCES = {
  blocks: 'Blocks.txt',
  derivedCoreProperties: 'DerivedCoreProperties.txt',
  derivedName: 'extracted/DerivedName.txt',
  emojiData: 'emoji/emoji-data.txt',
  generalCategory: 'extracted/DerivedGeneralCategory.txt',
  graphemeBreakProperty: 'auxiliary/GraphemeBreakProperty.txt',
  graphemeBreakTest: 'auxiliary/GraphemeBreakTest.txt',
  jamo: 'Jamo.txt',
  nameAliases: 'NameAliases.txt',
  normalizationTest: 'NormalizationTest.txt',
  propertyValueAliases: 'PropertyValueAliases.txt',
  propList: 'PropList.txt',
  scripts: 'Scripts.txt',
} as const;
type Source = keyof typeof SOURCES;

/** Word-code alphabet: printable ASCII except the characters a quoted literal would escape. */
const NAME_CODE_ALPHABET = Array.from({ length: 0x7e - 0x20 }, (_, i) =>
  String.fromCharCode(0x21 + i),
)
  .filter((c) => !`"'\\\`$`.includes(c))
  .join('');
/** Alphabet characters that open a 1-, 2-, and 3-character word code, in that order. */
const NAME_CODE_WIDTHS = [56, 26, 7] as const;
/** Binary properties packed into each property tuple; bit i is the i-th name. */
const PROPERTY_FLAGS = [
  'White_Space',
  'Default_Ignorable_Code_Point',
  'Bidi_Control',
  'Extended_Pictographic',
  'Noncharacter_Code_Point',
] as const;
type Flag = (typeof PROPERTY_FLAGS)[number];

interface Range {
  end: number;
  label: string;
  start: number;
}

interface Alias {
  alias: string;
  type: string;
}

/** Everything the modules encode, parsed straight from the UCD files. */
interface Ucd {
  aliases: Map<number, Alias[]>;
  blocks: Range[];
  derivedNameRanges: Range[];
  flags: Record<Flag, Uint8Array>;
  /** General_Category short alias → long alias, as `PropertyValueAliases.txt` lists them. */
  gcLongNames: Map<string, string>;
  generalCategory: string[];
  graphemeClusterBreak: string[];
  indicConjunctBreak: string[];
  /** Short names of the leading consonants, vowels, and trailing consonants (T[0] is empty). */
  jamo: [string[], string[], string[]];
  /** Every individually listed `DerivedName.txt` entry, Hangul syllables included. */
  listedNames: Map<number, string>;
  /** `NormalizationTest.txt` Part 1: code point → [NFC, NFD, NFKC, NFKD]. */
  normalization: Map<number, number[][]>;
  script: string[];
}

interface Constant {
  doc: string;
  name: string;
  value: string;
}

interface ModuleContent {
  constants: Constant[];
  summary: string;
}

await downloadMissingSources();
const ucd = parseUcd((source) => readFileSync(cachePath(source), 'utf8'));
mkdirSync(DATA_DIR, { recursive: true });
writeModule('names', namesModule(ucd));
writeModule('properties', propertiesModule(ucd));
writeModule('normalization', normalizationModule(ucd));
mkdirSync(dirname(FIXTURE_FILE), { recursive: true });
copyFileSync(cachePath('graphemeBreakTest'), FIXTURE_FILE);
console.log(`wrote ${relative(ROOT_DIR, FIXTURE_FILE)}`);

const { loadUnicodeTables } = await import('../src/services/unicode/unicode-tables.js');
process.exit(verify(ucd, loadUnicodeTables()) ? 0 : 1);

// ── Sources ─────────────────────────────────────────────────────────────────

function cachePath(source: Source): string {
  return join(CACHE_DIR, basename(SOURCES[source]));
}

async function downloadMissingSources(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  for (const path of Object.values(SOURCES)) {
    const file = join(CACHE_DIR, basename(path));
    if (existsSync(file)) continue;
    const url = `${SOURCE_URL}${path}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`Download of ${url} failed: HTTP ${response.status}.`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    console.log(`downloaded ${url}`);
  }
}

// ── Parsing ─────────────────────────────────────────────────────────────────

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Missing ${what}.`);
  return value;
}

/** Data lines of a UCD file: comments stripped, `;`-separated fields trimmed. */
function dataLines(text: string): string[][] {
  const rows: string[][] = [];
  for (const raw of text.split('\n')) {
    const line = (raw.split('#', 1)[0] ?? '').trim();
    if (line) rows.push(line.split(';').map((field) => field.trim()));
  }
  return rows;
}

function parseHex(text: string | undefined): number {
  if (text === undefined || !/^[0-9A-F]{4,6}$/.test(text)) {
    throw new Error(`"${text}" is not a code point.`);
  }
  return Number.parseInt(text, 16);
}

/** `XXXX` or `XXXX..YYYY` → [start, end]. */
function parseRange(field: string | undefined): [number, number] {
  const [start, end = start] = (field ?? '').split('..');
  return [parseHex(start), parseHex(end)];
}

/** Dense per-code-point values of a ranged property; `select` picks the value from a line. */
function rangedValues(
  text: string,
  fallback: string,
  select: (fields: string[]) => string | undefined,
): string[] {
  const values = new Array<string>(CODE_POINT_COUNT).fill(fallback);
  let listed = 0;
  for (const fields of dataLines(text)) {
    const value = select(fields);
    if (value === undefined) continue;
    const [start, end] = parseRange(fields[0]);
    values.fill(value, start, end + 1);
    listed++;
  }
  if (listed === 0) throw new Error('No values found; the source file format has changed.');
  return values;
}

function binaryProperty(text: string, name: string): Uint8Array {
  const set = new Uint8Array(CODE_POINT_COUNT);
  for (const fields of dataLines(text)) {
    if (fields[1] !== name) continue;
    const [start, end] = parseRange(fields[0]);
    set.fill(1, start, end + 1);
  }
  if (!set.includes(1)) throw new Error(`No code point has ${name}.`);
  return set;
}

function parseUcd(read: (source: Source) => string): Ucd {
  const listedNames = new Map<number, string>();
  const derivedNameRanges: Range[] = [];
  for (const [field, name = ''] of dataLines(read('derivedName'))) {
    const [start, end] = parseRange(field);
    if (name.endsWith('*')) derivedNameRanges.push({ start, end, label: name.slice(0, -1) });
    else if (start === end && name) listedNames.set(start, name);
    else throw new Error(`Unexpected DerivedName.txt entry "${field}; ${name}".`);
  }

  const jamoShortNames = new Map(
    dataLines(read('jamo')).map(([field, short = '']): [number, string] => [
      parseHex(field),
      short,
    ]),
  );
  const jamoRange = (first: number, last: number): string[] =>
    Array.from({ length: last - first + 1 }, (_, i) =>
      required(jamoShortNames.get(first + i), `Jamo.txt U+${hex(first + i)}`),
    );

  const aliases = new Map<number, Alias[]>();
  for (const [field, alias = '', type = ''] of dataLines(read('nameAliases'))) {
    const codePoint = parseHex(field);
    aliases.set(codePoint, [...(aliases.get(codePoint) ?? []), { alias, type }]);
  }

  const normalization = new Map<number, number[][]>();
  let part = '';
  for (const raw of read('normalizationTest').split('\n')) {
    if (raw.startsWith('@Part')) {
      part = raw.slice(1, 6);
      continue;
    }
    const line = (raw.split('#', 1)[0] ?? '').trim();
    if (!line || part !== 'Part1') continue;
    const [source = [], ...forms] = line
      .split(';')
      .slice(0, 5)
      .map((column) => column.trim().split(' ').map(parseHex));
    const [codePoint] = source;
    if (source.length !== 1 || codePoint === undefined || forms.length !== 4) {
      throw new Error(`Unexpected NormalizationTest.txt Part 1 line "${line}".`);
    }
    normalization.set(codePoint, forms);
  }

  const propList = read('propList');
  return {
    aliases,
    blocks: dataLines(read('blocks')).map(([field, label = '']): Range => {
      const [start, end] = parseRange(field);
      return { start, end, label };
    }),
    derivedNameRanges,
    flags: {
      White_Space: binaryProperty(propList, 'White_Space'),
      Default_Ignorable_Code_Point: binaryProperty(
        read('derivedCoreProperties'),
        'Default_Ignorable_Code_Point',
      ),
      Bidi_Control: binaryProperty(propList, 'Bidi_Control'),
      Extended_Pictographic: binaryProperty(read('emojiData'), 'Extended_Pictographic'),
      Noncharacter_Code_Point: binaryProperty(propList, 'Noncharacter_Code_Point'),
    },
    gcLongNames: new Map(
      dataLines(read('propertyValueAliases'))
        .filter(([property]) => property === 'gc')
        .map(([, short = '', long = '']): [string, string] => [short, long]),
    ),
    generalCategory: rangedValues(read('generalCategory'), 'Cn', (f) => f[1]),
    graphemeClusterBreak: rangedValues(read('graphemeBreakProperty'), 'Other', (f) => f[1]),
    indicConjunctBreak: rangedValues(read('derivedCoreProperties'), 'None', (f) =>
      f[1] === 'InCB' ? f[2] : undefined,
    ),
    jamo: [
      jamoRange(0x1100, 0x1112),
      jamoRange(0x1161, 0x1175),
      ['', ...jamoRange(0x11a8, 0x11c2)],
    ],
    listedNames,
    normalization,
    script: rangedValues(read('scripts'), 'Unknown', (f) => f[1]),
  };
}

// ── Encoding ────────────────────────────────────────────────────────────────

function base36(value: number): string {
  return value.toString(36);
}

/** Distinct values in order of first appearance, each mapped to its index. */
function vocabulary(values: Iterable<string>): Map<string, number> {
  const indices = new Map<string, number>();
  for (const value of values) if (!indices.has(value)) indices.set(value, indices.size);
  return indices;
}

function wordCode(index: number): string {
  const base = NAME_CODE_ALPHABET.length;
  const [one, two, three] = NAME_CODE_WIDTHS;
  const digit = (d: number): string => NAME_CODE_ALPHABET.charAt(d);
  if (index < one) return digit(index);
  let rest = index - one;
  if (rest < two * base) return digit(one + Math.floor(rest / base)) + digit(rest % base);
  rest -= two * base;
  if (rest >= three * base * base) {
    throw new Error(`Word index ${index} exceeds the word-code capacity.`);
  }
  return (
    digit(one + two + Math.floor(rest / (base * base))) +
    digit(Math.floor(rest / base) % base) +
    digit(rest % base)
  );
}

function namesModule(data: Ucd): ModuleContent {
  const stored = [...data.listedNames]
    .filter(([codePoint]) => codePoint < HANGUL_FIRST || codePoint > HANGUL_LAST)
    .sort((a, b) => a[0] - b[0]);
  const frequency = new Map<string, number>();
  for (const [, name] of stored) {
    for (const word of name.split(' ')) {
      if (!word) throw new Error(`Name "${name}" has an empty word.`);
      frequency.set(word, (frequency.get(word) ?? 0) + 1);
    }
  }
  const words = [...frequency].sort((a, b) => b[1] - a[1]).map(([word]) => word);
  const wordIndex = new Map(words.map((word, i): [string, number] => [word, i]));
  const codes = stored.map(([, name]) =>
    name
      .split(' ')
      .map((word) => wordCode(required(wordIndex.get(word), `word ${word}`)))
      .join(''),
  );

  const runs: [number, number][] = [];
  for (const [codePoint] of stored) {
    const last = runs.at(-1);
    if (last && last[0] + last[1] === codePoint) last[1]++;
    else runs.push([codePoint, 1]);
  }
  let runEnd = 0;
  const runText = runs.map(([start, length]) => {
    const gap = start - runEnd;
    runEnd = start + length;
    return `${base36(gap)}:${base36(length)}`;
  });

  const aliasTypes = vocabulary([...data.aliases.values()].flat().map((a) => a.type));
  const aliasText = [...data.aliases]
    .sort((a, b) => a[0] - b[0])
    .map(([codePoint, list]) => {
      const items = list.map((a) => `${required(aliasTypes.get(a.type), a.type)}${a.alias}`);
      return `${base36(codePoint)}:${items.join('|')}`;
    });
  const aliasCount = [...data.aliases.values()].reduce((n, list) => n + list.length, 0);

  return {
    summary: `Unicode character names and name aliases: ${count(stored.length)} stored names in ${count(runs.length)} runs, encoded over a ${count(words.length)}-word dictionary; ${count(data.derivedNameRanges.length)} derived-name ranges (rule NR2); Jamo short names for Hangul syllables (rule NR1); ${count(aliasCount)} aliases on ${count(data.aliases.size)} code points.`,
    constants: [
      {
        name: 'NAME_CODE_ALPHABET',
        doc: 'Characters of a word code, in digit order.',
        value: NAME_CODE_ALPHABET,
      },
      {
        name: 'NAME_CODE_WIDTHS',
        doc: 'How many alphabet characters open a 1-, 2-, and 3-character word code.',
        value: NAME_CODE_WIDTHS.join(','),
      },
      {
        name: 'NAME_WORDS',
        doc: 'Words of the stored names, most frequent first, space-separated.',
        value: words.join(' '),
      },
      {
        name: 'NAME_CODES',
        doc: 'One code per stored name in code point order: the word codes of its words, concatenated. Space-separated.',
        value: codes.join(' '),
      },
      {
        name: 'NAME_RUNS',
        doc: 'Runs of consecutive code points with a stored name, as base-36 `gap:length` (gap from the end of the previous run), comma-separated.',
        value: runText.join(','),
      },
      {
        name: 'DERIVED_NAME_RANGES',
        doc: 'Ranges named by rule NR2 (prefix + hexadecimal code point), as base-36 `start,end,prefix`, semicolon-separated.',
        value: data.derivedNameRanges
          .map((r) => `${base36(r.start)},${base36(r.end)},${r.label}`)
          .join(';'),
      },
      {
        name: 'JAMO_SHORT_NAMES',
        doc: 'Jamo short names for rule NR1: leading consonants, vowels, and trailing consonants (the first empty), each comma-separated, groups separated by `|`.',
        value: data.jamo.map((group) => group.join(',')).join('|'),
      },
      {
        name: 'NAME_ALIAS_TYPES',
        doc: 'Name alias types, indexed by the digit that opens each alias.',
        value: [...aliasTypes.keys()].join(','),
      },
      {
        name: 'NAME_ALIASES',
        doc: 'Name aliases in file order, as base-36 `codePoint:` + `|`-separated `<type digit><alias>`, semicolon-separated.',
        value: aliasText.join(';'),
      },
    ],
  };
}

function propertiesModule(data: Ucd): ModuleContent {
  const categories = vocabulary(data.generalCategory);
  const scripts = vocabulary(data.script);
  const graphemeBreaks = vocabulary(data.graphemeClusterBreak);
  const conjunctBreaks = vocabulary(data.indicConjunctBreak);
  const indexOf = (values: Map<string, number>, list: string[], codePoint: number): number =>
    required(values.get(required(list[codePoint], 'value')), 'vocabulary entry');
  const tuples = new Map<string, number>();
  const runs: string[] = [];
  let previousKey = '';
  let previousStart = 0;
  for (let codePoint = 0; codePoint < CODE_POINT_COUNT; codePoint++) {
    let flags = 0;
    PROPERTY_FLAGS.forEach((flag, bit) => {
      flags |= (data.flags[flag][codePoint] ?? 0) << bit;
    });
    const key = [
      indexOf(categories, data.generalCategory, codePoint),
      indexOf(scripts, data.script, codePoint),
      indexOf(graphemeBreaks, data.graphemeClusterBreak, codePoint),
      indexOf(conjunctBreaks, data.indicConjunctBreak, codePoint),
      flags,
    ]
      .map(base36)
      .join('.');
    if (key === previousKey) continue;
    if (!tuples.has(key)) tuples.set(key, tuples.size);
    runs.push(`${base36(codePoint - previousStart)},${base36(required(tuples.get(key), key))}`);
    previousKey = key;
    previousStart = codePoint;
  }

  const categoryText = [...categories.keys()].map(
    (short) => `${short}:${required(data.gcLongNames.get(short), `gc ${short}`)}`,
  );

  return {
    summary: `Unicode character properties for every code point (General_Category, Script, Grapheme_Cluster_Break, Indic_Conjunct_Break, and the binary properties ${PROPERTY_FLAGS.join(', ')}) as ${count(runs.length)} runs over ${count(tuples.size)} distinct property tuples; and ${count(data.blocks.length)} blocks.`,
    constants: [
      {
        name: 'GENERAL_CATEGORIES',
        doc: 'General_Category values as `short:long` aliases, comma-separated, indexed by tuple field 0.',
        value: categoryText.join(','),
      },
      {
        name: 'SCRIPTS',
        doc: 'Script values, comma-separated, indexed by tuple field 1.',
        value: [...scripts.keys()].join(','),
      },
      {
        name: 'GRAPHEME_CLUSTER_BREAKS',
        doc: 'Grapheme_Cluster_Break values, comma-separated, indexed by tuple field 2.',
        value: [...graphemeBreaks.keys()].join(','),
      },
      {
        name: 'INDIC_CONJUNCT_BREAKS',
        doc: 'Indic_Conjunct_Break values, comma-separated, indexed by tuple field 3.',
        value: [...conjunctBreaks.keys()].join(','),
      },
      {
        name: 'PROPERTY_FLAGS',
        doc: 'Binary properties of tuple field 4, a bitmask: bit i is the i-th name.',
        value: PROPERTY_FLAGS.join(','),
      },
      {
        name: 'PROPERTY_TUPLES',
        doc: 'Distinct property tuples, as base-36 `category.script.graphemeBreak.conjunctBreak.flags`, semicolon-separated.',
        value: [...tuples.keys()].join(';'),
      },
      {
        name: 'PROPERTY_RUNS',
        doc: 'Runs of code points sharing a tuple, covering U+0000 to U+10FFFF, as base-36 `delta,tuple` (delta from the previous run start), semicolon-separated.',
        value: runs.join(';'),
      },
      {
        name: 'BLOCKS',
        doc: 'Blocks in code point order, as base-36 `start,end,name`, semicolon-separated.',
        value: data.blocks.map((b) => `${base36(b.start)},${base36(b.end)},${b.label}`).join(';'),
      },
    ],
  };
}

function normalizationModule(data: Ucd): ModuleContent {
  const rows: string[] = [];
  let previous = 0;
  for (const [codePoint, forms] of [...data.normalization].sort((a, b) => a[0] - b[0])) {
    if (codePoint >= HANGUL_FIRST && codePoint <= HANGUL_LAST) continue;
    const fields = forms.map((form) =>
      form.length === 1 && form[0] === codePoint ? '' : form.map(base36).join('.'),
    );
    const compact = fields.map((field, i) =>
      i > 0 && field !== '' && field === fields[i - 1] ? '^' : field,
    );
    rows.push(`${base36(codePoint - previous)}:${compact.join(',')}`);
    previous = codePoint;
  }
  return {
    summary: `Unicode normalization forms (NFC, NFD, NFKC, NFKD) of the ${count(rows.length)} code points other than Hangul syllables that NormalizationTest.txt Part 1 lists. The decoder computes Hangul syllables; every other code point normalizes to itself.`,
    constants: [
      {
        name: 'NORMALIZATION_FORMS',
        doc: 'Rows in code point order, as base-36 `delta:nfc,nfd,nfkc,nfkd` (delta from the previous row); each form is `.`-separated code points, empty when it is the code point itself, `^` when it equals the form before it. Semicolon-separated.',
        value: rows.join(';'),
      },
    ],
  };
}

// ── Output ──────────────────────────────────────────────────────────────────

function count(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Greedy word wrap into lines of at most `width` characters. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function jsdoc(text: string): string {
  const single = `/** ${text} */`;
  if (single.length <= LINE_WIDTH) return single;
  return ['/**', ...wrap(text, LINE_WIDTH - 3).map((l) => ` * ${l}`), ' */'].join('\n');
}

function moduleSource(module: string, { summary, constants }: ModuleContent): string {
  const paragraphs = [
    `@fileoverview ${summary}`,
    `Generated by scripts/generate-unicode-data.ts from the Unicode Character Database ${UCD_VERSION}. Do not edit by hand: change the generator and run \`bun run generate:unicode\`.`,
    'Data © Unicode, Inc. For terms of use and license, see https://www.unicode.org/terms_of_use.html',
  ];
  const header = paragraphs.map((p) =>
    wrap(p, LINE_WIDTH - 3)
      .map((l) => ` * ${l}`)
      .join('\n'),
  );
  const parts = [`/**\n${header.join('\n *\n')}\n * @module data/unicode/${module}\n */`];
  const all: Constant[] = [
    {
      name: 'UCD_VERSION',
      doc: 'Unicode Character Database version of this data.',
      value: UCD_VERSION,
    },
    ...constants,
  ];
  for (const { name, doc, value } of all) {
    if (/['\\\n\r]/.test(value)) {
      throw new Error(`${module}.${name} holds a character a quoted literal must escape.`);
    }
    const declaration = `export const ${name}: string = '${value}';`;
    const statement =
      declaration.length <= LINE_WIDTH
        ? declaration
        : `export const ${name}: string =\n  '${value}';`;
    parts.push(`${jsdoc(doc)}\n${statement}`);
  }
  return `${parts.join('\n\n')}\n`;
}

function writeModule(module: string, content: ModuleContent): void {
  const file = join(DATA_DIR, `${module}.ts`);
  const source = moduleSource(module, content);
  writeFileSync(file, source);
  const raw = count(Buffer.byteLength(source));
  const gzipped = count(gzipSync(source, { level: 9 }).length);
  console.log(`wrote ${relative(ROOT_DIR, file)}: ${raw} bytes, ${gzipped} gzipped`);
}

// ── Verification ────────────────────────────────────────────────────────────

function hex(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, '0');
}

/** Runs `compare` for every code point; prints the outcome and returns whether all matched. */
function check(label: string, compare: (codePoint: number) => string | null): boolean {
  const samples: string[] = [];
  let failures = 0;
  for (let codePoint = 0; codePoint < CODE_POINT_COUNT; codePoint++) {
    const mismatch = compare(codePoint);
    if (mismatch === null) continue;
    failures++;
    if (samples.length < SAMPLE_LIMIT) samples.push(`  U+${hex(codePoint)}: ${mismatch}`);
  }
  if (failures === 0) {
    console.log(`ok   ${label}: all ${count(CODE_POINT_COUNT)} code points match`);
    return true;
  }
  console.log(`FAIL ${label}: ${count(failures)} code points differ\n${samples.join('\n')}`);
  return false;
}

function differ(field: string, expected: unknown, actual: unknown): string | null {
  const e = JSON.stringify(expected);
  const a = JSON.stringify(actual);
  return e === a ? null : `${field} expected ${e}, got ${a}`;
}

/** The three self-checks: names, normalization, and properties/blocks/aliases. */
function verify(data: Ucd, tables: UnicodeTables): boolean {
  const derivedName = (codePoint: number): string | null => {
    const range = data.derivedNameRanges.find((r) => codePoint >= r.start && codePoint <= r.end);
    return range ? `${range.label}${hex(codePoint)}` : null;
  };
  const namesOk = check('names vs DerivedName.txt (stored, NR1, NR2)', (codePoint) =>
    differ(
      'name',
      data.listedNames.get(codePoint) ?? derivedName(codePoint),
      tables.name(codePoint),
    ),
  );

  let hangulRows = 0;
  for (const codePoint of data.normalization.keys()) {
    if (codePoint >= HANGUL_FIRST && codePoint <= HANGUL_LAST) hangulRows++;
  }
  console.log(
    `     NormalizationTest.txt Part 1: ${count(data.normalization.size)} rows, ${count(data.normalization.size - hangulRows)} in the table and ${count(hangulRows)} Hangul syllables computed`,
  );
  const normalizationOk = check(
    'normalization vs NormalizationTest.txt Part 1 (unlisted = unchanged)',
    (codePoint) => {
      const [nfc, nfd, nfkc, nfkd] = data.normalization.get(codePoint) ?? [
        [codePoint],
        [codePoint],
        [codePoint],
        [codePoint],
      ];
      return differ('forms', { nfc, nfd, nfkc, nfkd }, tables.normalization(codePoint));
    },
  );

  const blockOf = new Array<string | null>(CODE_POINT_COUNT).fill(null);
  for (const b of data.blocks) blockOf.fill(b.label, b.start, b.end + 1);
  const propertiesOk = check('properties, blocks, and aliases vs their UCD files', (codePoint) => {
    const p = tables.properties(codePoint);
    const flag = (f: Flag): boolean => data.flags[f][codePoint] === 1;
    const expected = {
      generalCategory: data.generalCategory[codePoint],
      script: data.script[codePoint],
      graphemeClusterBreak: data.graphemeClusterBreak[codePoint],
      indicConjunctBreak: data.indicConjunctBreak[codePoint],
      whiteSpace: flag('White_Space'),
      defaultIgnorable: flag('Default_Ignorable_Code_Point'),
      bidiControl: flag('Bidi_Control'),
      extendedPictographic: flag('Extended_Pictographic'),
      noncharacter: flag('Noncharacter_Code_Point'),
    };
    const actual = {
      generalCategory: p.generalCategory,
      script: p.script,
      graphemeClusterBreak: p.graphemeClusterBreak,
      indicConjunctBreak: p.indicConjunctBreak,
      whiteSpace: p.whiteSpace,
      defaultIgnorable: p.defaultIgnorable,
      bidiControl: p.bidiControl,
      extendedPictographic: p.extendedPictographic,
      noncharacter: p.noncharacter,
    };
    return (
      differ('properties', expected, actual) ??
      differ(
        'categoryName',
        data.gcLongNames.get(p.generalCategory),
        tables.categoryName(p.generalCategory),
      ) ??
      differ('block', blockOf[codePoint], tables.block(codePoint)) ??
      differ('aliases', data.aliases.get(codePoint) ?? [], tables.aliases(codePoint))
    );
  });

  return namesOk && normalizationOk && propertiesOk;
}
