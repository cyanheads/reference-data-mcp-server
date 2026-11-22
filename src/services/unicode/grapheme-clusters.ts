/**
 * @fileoverview Extended grapheme cluster segmentation (UAX #29, Unicode 18.0 rules) over a code
 * point sequence, driven only by the bundled Grapheme_Cluster_Break, Indic_Conjunct_Break, and
 * Extended_Pictographic properties. One left-to-right pass; constant work per code point.
 * @module services/unicode/grapheme-clusters
 */

import type { CodePointProperties, UnicodeTables } from './unicode-tables.js';

/** Where the text before the current position stands in rule GB11's `ExtPict Extend* ZWJ`. */
type EmojiState = 'none' | 'pictographic' | 'zwj';

/**
 * Extended grapheme cluster index for each code point of the sequence, counting from 0. Code
 * points that share an index form one user-perceived character. Surrogate code points are
 * Grapheme_Cluster_Break=Other (the property file lists none), so two in a row break apart and a
 * combining mark after one joins it.
 */
export function assignClusterIndices(
  codePoints: readonly number[],
  tables: UnicodeTables,
): number[] {
  const clusters: number[] = [];
  let cluster = 0;
  let previous: CodePointProperties | undefined;
  /** Regional_Indicator code points immediately before the current position (GB12/GB13). */
  let regionalIndicators = 0;
  let emoji: EmojiState = 'none';
  /** The text before the current position ends `InCB=Linker [InCB=Extend InCB=Linker]*` (GB9c). */
  let linkerArmed = false;

  for (const codePoint of codePoints) {
    const current = tables.properties(codePoint);
    if (
      previous !== undefined &&
      breaksBetween(previous, current, regionalIndicators, emoji, linkerArmed)
    ) {
      cluster++;
    }
    clusters.push(cluster);

    regionalIndicators =
      current.graphemeClusterBreak === 'Regional_Indicator' ? regionalIndicators + 1 : 0;
    emoji = advanceEmoji(emoji, current);
    const incb = current.indicConjunctBreak;
    linkerArmed = incb === 'Linker' || (linkerArmed && incb === 'Extend');
    previous = current;
  }
  return clusters;
}

function advanceEmoji(state: EmojiState, current: CodePointProperties): EmojiState {
  if (current.extendedPictographic) return 'pictographic';
  if (state !== 'pictographic') return 'none';
  if (current.graphemeClusterBreak === 'Extend') return 'pictographic';
  return current.graphemeClusterBreak === 'ZWJ' ? 'zwj' : 'none';
}

/** UAX #29 rules GB3–GB999 between two adjacent code points; the first rule that applies decides. */
function breaksBetween(
  a: CodePointProperties,
  b: CodePointProperties,
  regionalIndicators: number,
  emoji: EmojiState,
  linkerArmed: boolean,
): boolean {
  const before = a.graphemeClusterBreak;
  const after = b.graphemeClusterBreak;
  if (before === 'CR' && after === 'LF') return false; // GB3
  if (before === 'Control' || before === 'CR' || before === 'LF') return true; // GB4
  if (after === 'Control' || after === 'CR' || after === 'LF') return true; // GB5
  if (before === 'L' && (after === 'L' || after === 'V' || after === 'LV' || after === 'LVT')) {
    return false; // GB6
  }
  if ((before === 'LV' || before === 'V') && (after === 'V' || after === 'T')) return false; // GB7
  if ((before === 'LVT' || before === 'T') && after === 'T') return false; // GB8
  if (after === 'Extend' || after === 'ZWJ') return false; // GB9
  if (after === 'SpacingMark') return false; // GB9a
  if (before === 'Prepend') return false; // GB9b
  if (linkerArmed && b.indicConjunctBreak === 'Consonant') return false; // GB9c
  if (emoji === 'zwj' && b.extendedPictographic) return false; // GB11
  if (before === 'Regional_Indicator' && after === 'Regional_Indicator') {
    return regionalIndicators % 2 === 0; // GB12, GB13: pair indicators left to right
  }
  return true; // GB999
}
