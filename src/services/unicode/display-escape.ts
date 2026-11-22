/**
 * @fileoverview Display safety for code points, and the `\u{XXXX}` escape that stands in for a
 * code point that would not display safely — in format() text and in error messages.
 * @module services/unicode/display-escape
 */

import type { CodePointType } from './types.js';
import { type CodePointProperties, getUnicodeProperties } from './unicode-tables.js';

/** Graphic categories that still render as nothing, or onto a neighbour, when shown alone. */
const UNSAFE_GRAPHIC_CATEGORIES = new Set(['Mn', 'Mc', 'Me', 'Zs']);

const ESCAPED_TEXT_CATEGORIES = new Set(['Cc', 'Cf', 'Zl', 'Zp']);

/** Error messages show at most this many code points of a caller token. */
const MAX_SHOWN_CODE_POINTS = 40;

/**
 * True when the code point can be shown as itself: graphic, not a combining mark or a space, and not
 * default-ignorable. Every control, format, bidi control, line or paragraph separator, variation
 * selector, tag, Hangul filler, private-use, surrogate, noncharacter, and reserved code point fails.
 */
export function isDisplaySafe(
  type: CodePointType,
  properties: Pick<CodePointProperties, 'defaultIgnorable' | 'generalCategory'>,
): boolean {
  return (
    type === 'graphic' &&
    !UNSAFE_GRAPHIC_CATEGORIES.has(properties.generalCategory) &&
    !properties.defaultIgnorable
  );
}

/** Uppercase hex of a code point, at least 4 digits: the digits of `U+XXXX`. */
export function codePointHex(codePoint: number): string {
  return codePoint.toString(16).toUpperCase().padStart(4, '0');
}

/** `\u{XXXX}`, a notation `by: "code_point"` reads back to the same code point. */
export function codePointEscape(codePoint: number): string {
  return `\\u{${codePointHex(codePoint)}}`;
}

/** Escape nondisplayable caller characters in prose while preserving visible text and spacing. */
export function escapeCallerText(text: string): string {
  let escaped = '';
  for (const codePoint of codePointsOf(text)) {
    if (codePoint >= 0x20 && codePoint <= 0x7e) {
      escaped += String.fromCharCode(codePoint);
      continue;
    }
    const { defaultIgnorable, generalCategory } = getUnicodeProperties(codePoint);
    escaped +=
      defaultIgnorable || ESCAPED_TEXT_CATEGORIES.has(generalCategory)
        ? codePointEscape(codePoint)
        : String.fromCodePoint(codePoint);
  }
  return escaped;
}

/** Quote a filter value so literal backslashes and quotes remain distinct from display escapes. */
export function quoteCallerFilter(text: string): string {
  return `"${escapeCallerText(text.replaceAll('\\', '\\\\').replaceAll('"', '\\"'))}"`;
}

/**
 * The code points of `text` in order, decoded from UTF-16 the way `for…of` iterates a string: a
 * well-formed surrogate pair is one code point and a lone surrogate is one of its own.
 */
export function codePointsOf(text: string): number[] {
  const codePoints: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    const next = text.charCodeAt(i + 1);
    if (unit >= 0xd800 && unit <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      codePoints.push(0x10000 + ((unit - 0xd800) << 10) + (next - 0xdc00));
      i++;
    } else {
      codePoints.push(unit);
    }
  }
  return codePoints;
}

/**
 * A caller token as an error message shows it: printable ASCII (U+0021–U+007E) as written, every
 * other code point as `\u{XXXX}`, cut to its first 40 code points followed by `…` when longer.
 */
export function escapeCallerToken(token: string): string {
  const codePoints = codePointsOf(token);
  const shown = codePoints
    .slice(0, MAX_SHOWN_CODE_POINTS)
    .map((codePoint) =>
      codePoint >= 0x21 && codePoint <= 0x7e
        ? String.fromCharCode(codePoint)
        : codePointEscape(codePoint),
    )
    .join('');
  return codePoints.length > MAX_SHOWN_CODE_POINTS ? `${shown}…` : shown;
}

/**
 * `text` as a CommonMark code span that a parse reads back as exactly `text`, for a glyph or an
 * escape: the fence is one backtick longer than the longest backtick run inside, and a space pads
 * text that starts or ends with a backtick.
 */
export function codeSpan(text: string): string {
  let longestRun = 0;
  let run = 0;
  for (const char of text) {
    run = char === '`' ? run + 1 : 0;
    if (run > longestRun) longestRun = run;
  }
  const fence = '`'.repeat(longestRun + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** A record's character for `content[]`: the glyph when `char` holds it, otherwise the escape. */
export function charDisplay(char: string | null, codePoint: number): string {
  return codeSpan(char ?? codePointEscape(codePoint));
}
