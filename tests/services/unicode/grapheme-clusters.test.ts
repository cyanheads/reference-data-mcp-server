/**
 * @fileoverview Tests for the UAX #29 extended grapheme cluster segmenter: every case of the
 * Unicode 18.0.0 conformance file `GraphemeBreakTest.txt`, hand-derived sequences that carry
 * rule state across several code points, and a linear-time bound.
 * @module tests/services/unicode/grapheme-clusters.test
 */

import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { assignClusterIndices } from '@/services/unicode/grapheme-clusters.js';
import { loadUnicodeTables, type UnicodeTables } from '@/services/unicode/unicode-tables.js';

const FIXTURE = readFileSync(
  new URL('../../fixtures/unicode/GraphemeBreakTest-18.0.0.txt', import.meta.url),
  'utf8',
);

interface ConformanceCase {
  codePoints: number[];
  /** Cluster index of each code point, read from the file's `÷` (break) and `×` (no break) marks. */
  expected: number[];
  line: number;
  source: string;
}

/** Parses `÷ 0020 × 0308 ÷ …` lines; throws on any line that does not alternate mark, code point. */
function parseConformanceCases(text: string): ConformanceCase[] {
  const cases: ConformanceCase[] = [];
  text.split('\n').forEach((raw, i) => {
    const source = (raw.split('#', 1)[0] ?? '').trim();
    if (!source) return;
    const tokens = source.split(/\s+/);
    const codePoints: number[] = [];
    const expected: number[] = [];
    let cluster = 0;
    tokens.forEach((token, t) => {
      const isMark = t % 2 === 0;
      if (isMark !== (token === '÷' || token === '×')) {
        throw new Error(`Line ${i + 1}: unexpected token "${token}"`);
      }
      if (isMark) {
        if (token === '÷' && codePoints.length > 0) cluster++;
        return;
      }
      if (!/^[0-9A-F]{4,6}$/.test(token)) {
        throw new Error(`Line ${i + 1}: bad code point "${token}"`);
      }
      codePoints.push(Number.parseInt(token, 16));
      expected.push(cluster);
    });
    if (tokens[0] !== '÷' || tokens.at(-1) !== '÷' || codePoints.length === 0) {
      throw new Error(`Line ${i + 1}: a case must open and close with a break`);
    }
    cases.push({ codePoints, expected, line: i + 1, source });
  });
  return cases;
}

const CASES = parseConformanceCases(FIXTURE);

let tables: UnicodeTables;
beforeAll(() => {
  tables = loadUnicodeTables();
});

describe('assignClusterIndices — GraphemeBreakTest.txt 18.0.0', () => {
  it('reads the 18.0.0 conformance file and all 853 of its cases', () => {
    expect(FIXTURE.split('\n', 1)[0]).toBe('# GraphemeBreakTest-18.0.0.txt');
    expect(CASES).toHaveLength(853);
  });

  it.each(CASES)('line $line: $source', ({ codePoints, expected }) => {
    expect(assignClusterIndices(codePoints, tables)).toEqual(expected);
  });
});

describe('assignClusterIndices — state carried across several code points', () => {
  it('returns an empty list for an empty sequence', () => {
    expect(assignClusterIndices([], tables)).toEqual([]);
  });

  it('pairs a run of seven regional indicators left to right (GB12/GB13)', () => {
    const flags = [0x1f1fa, 0x1f1f8, 0x1f1ec, 0x1f1e7, 0x1f1e6, 0x1f1fa, 0x1f1e8];
    expect(assignClusterIndices(flags, tables)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });

  it('joins pictographs through Extend and ZWJ repeatedly (GB9, GB11)', () => {
    // MAN, skin tone (Extend), ZWJ, WOMAN, ZWJ, GIRL, ZWJ, BOY
    const family = [0x1f468, 0x1f3fb, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466];
    expect(assignClusterIndices(family, tables)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('stops GB11 once a non-pictograph intervenes', () => {
    // MAN, ZWJ, "a", ZWJ, WOMAN: "a" breaks (GB999) and the second ZWJ follows no pictograph
    expect(assignClusterIndices([0x1f468, 0x200d, 0x61, 0x200d, 0x1f469], tables)).toEqual([
      0, 0, 1, 1, 2,
    ]);
  });

  it('chains conjuncts across several viramas and a ZWJ (GB9c)', () => {
    // KA, VIRAMA (Linker), TA, VIRAMA, ZWJ (InCB Extend), YA
    expect(assignClusterIndices([0x915, 0x94d, 0x924, 0x94d, 0x200d, 0x92f], tables)).toEqual([
      0, 0, 0, 0, 0, 0,
    ]);
  });

  it('disarms GB9c when a non-conjunct code point follows the virama', () => {
    // KA, VIRAMA, "a", TA
    expect(assignClusterIndices([0x915, 0x94d, 0x61, 0x924], tables)).toEqual([0, 0, 1, 2]);
  });

  it('segments surrogate code points as Grapheme_Cluster_Break=Other', () => {
    // GraphemeBreakProperty.txt lists no surrogate: adjacent ones break (GB999), a mark joins (GB9)
    expect(assignClusterIndices([0xd83d, 0xde00, 0x301], tables)).toEqual([0, 1, 1]);
  });
});

/** Smallest size timed; every larger size is a doubling of it, up to 64×. */
const TIMING_BASE = 5_000;
const TIMING_MAX = 320_000;
/** Code points of work per measurement: small inputs are timed as a batch of calls. */
const TIMING_BATCH = 40_000;
const TIMING_SAMPLES = 3;
const TIMING_PAIRS = 3;
/** Thread CPU ceiling, in microseconds, for one call on a `TIMING_MAX`-code-point input. */
const TIMING_MAX_CALL_MICROS = 500_000;

const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));

/** Inputs of `n` code points that keep each piece of carried state live for the whole run. */
const TIMING_SHAPES: [string, (n: number) => number[]][] = [
  ['a run of regional indicators', (n) => new Array<number>(n).fill(0x1f1e6)],
  ['Extend after a pictograph', (n) => [0x1f600, ...new Array<number>(n - 1).fill(0x1f3fb)]],
  [
    'InCB Linker and Extend after a consonant',
    (n) => [0x915, ...Array.from({ length: n - 1 }, (_, i) => (i % 2 ? 0x200d : 0x94d))],
  ],
  ['a run of ZWJ', (n) => new Array<number>(n).fill(0x200d)],
  [
    'pictographs joined by ZWJ',
    (n) => Array.from({ length: n }, (_, i) => (i % 2 ? 0x200d : 0x1f468)),
  ],
  ['one long line ending in a break', (n) => ascii(`${'x'.repeat(n - 2)}\ny`)],
  ['line breaks throughout', (n) => ascii('  \r\n'.repeat(n / 4))],
];

describe('assignClusterIndices — timing', () => {
  /** Least thread CPU time of one call, in microseconds, over several batched measurements. */
  const leastMicros = (codePoints: number[]): number => {
    const calls = Math.ceil(TIMING_BATCH / codePoints.length);
    let least = Number.POSITIVE_INFINITY;
    for (let sample = 0; sample < TIMING_SAMPLES; sample++) {
      const start = process.threadCpuUsage();
      for (let call = 0; call < calls; call++) assignClusterIndices(codePoints, tables);
      const { user, system } = process.threadCpuUsage(start);
      least = Math.min(least, (user + system) / calls);
    }
    return least;
  };

  it.each(TIMING_SHAPES)(
    'grows linearly on %s from 5k to 320k code points',
    (_, shape) => {
      const base = shape(TIMING_BASE);
      let growth = 1;
      for (let size = TIMING_BASE * 2; size <= TIMING_MAX; size *= 2) {
        const input = shape(size);
        expect(input).toHaveLength(size);
        growth = Number.POSITIVE_INFINITY;
        for (let pair = 0; pair < TIMING_PAIRS; pair++) {
          growth = Math.min(growth, leastMicros(input) / leastMicros(base));
        }
        // Linear growth is size / base; allow 4× that before the next doubling runs.
        expect(growth).toBeLessThan((size / TIMING_BASE) * 4);
      }
      expect(growth).toBeLessThan(256);
      expect(leastMicros(shape(TIMING_MAX))).toBeLessThan(TIMING_MAX_CALL_MICROS);
    },
    0,
  );
});
