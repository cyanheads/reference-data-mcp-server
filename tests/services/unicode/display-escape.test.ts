/**
 * @fileoverview Tests for the display-safe rule and the escapes that stand in for code points
 * that would not display safely.
 * @module tests/services/unicode/display-escape.test
 */

import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import {
  charDisplay,
  codePointEscape,
  codePointHex,
  codePointsOf,
  codeSpan,
  escapeCallerText,
  escapeCallerToken,
  isDisplaySafe,
} from '@/services/unicode/display-escape.js';
import type { CodePointType } from '@/services/unicode/types.js';

const markdown = new MarkdownIt('commonmark');

/** The inline tokens a CommonMark parse makes of `text` as one paragraph. */
function inlineTokens(text: string) {
  return markdown.parse(text, {}).flatMap((token) => token.children ?? []);
}

describe('isDisplaySafe', () => {
  it.each<{
    example: string;
    type: CodePointType;
    generalCategory: string;
    ignorable: boolean;
    safe: boolean;
  }>([
    { example: 'U+0041 A', type: 'graphic', generalCategory: 'Lu', ignorable: false, safe: true },
    {
      example: 'U+00E9 e acute',
      type: 'graphic',
      generalCategory: 'Ll',
      ignorable: false,
      safe: true,
    },
    {
      example: 'U+05D0 alef (strong RTL)',
      type: 'graphic',
      generalCategory: 'Lo',
      ignorable: false,
      safe: true,
    },
    {
      example: 'U+1F600 emoji',
      type: 'graphic',
      generalCategory: 'So',
      ignorable: false,
      safe: true,
    },
    {
      example: 'U+0030 digit',
      type: 'graphic',
      generalCategory: 'Nd',
      ignorable: false,
      safe: true,
    },
    {
      example: 'U+2800 braille blank',
      type: 'graphic',
      generalCategory: 'So',
      ignorable: false,
      safe: true,
    },
    {
      example: 'U+0301 combining acute',
      type: 'graphic',
      generalCategory: 'Mn',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+0903 spacing mark',
      type: 'graphic',
      generalCategory: 'Mc',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+20DD enclosing circle',
      type: 'graphic',
      generalCategory: 'Me',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+0020 space',
      type: 'graphic',
      generalCategory: 'Zs',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+00A0 no-break space',
      type: 'graphic',
      generalCategory: 'Zs',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+3164 Hangul filler',
      type: 'graphic',
      generalCategory: 'Lo',
      ignorable: true,
      safe: false,
    },
    {
      example: 'U+FE0F variation selector',
      type: 'graphic',
      generalCategory: 'Mn',
      ignorable: true,
      safe: false,
    },
    {
      example: 'U+200B zero width space',
      type: 'format',
      generalCategory: 'Cf',
      ignorable: true,
      safe: false,
    },
    { example: 'U+202E RLO', type: 'format', generalCategory: 'Cf', ignorable: true, safe: false },
    {
      example: 'U+2028 line separator',
      type: 'format',
      generalCategory: 'Zl',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+2029 paragraph separator',
      type: 'format',
      generalCategory: 'Zp',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+0000 NUL',
      type: 'control',
      generalCategory: 'Cc',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+E000 private use',
      type: 'private_use',
      generalCategory: 'Co',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+D800 surrogate',
      type: 'surrogate',
      generalCategory: 'Cs',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+FFFE noncharacter',
      type: 'noncharacter',
      generalCategory: 'Cn',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+0378 reserved',
      type: 'reserved',
      generalCategory: 'Cn',
      ignorable: false,
      safe: false,
    },
    {
      example: 'U+2065 reserved ignorable',
      type: 'reserved',
      generalCategory: 'Cn',
      ignorable: true,
      safe: false,
    },
  ])('$example → $safe', ({ type, generalCategory, ignorable, safe }) => {
    expect(isDisplaySafe(type, { generalCategory, defaultIgnorable: ignorable })).toBe(safe);
  });
});

describe('codePointsOf', () => {
  it.each([
    ['BMP text', `a${String.fromCodePoint(0x200b)}b`, [0x61, 0x200b, 0x62]],
    ['a surrogate pair as one code point', String.fromCodePoint(0x1f600), [0x1f600]],
    ['the largest code point', String.fromCodePoint(0x10ffff), [0x10ffff]],
    ['a lone high surrogate', `${String.fromCharCode(0xd800)}x`, [0xd800, 0x78]],
    ['a high surrogate at the end', `x${String.fromCharCode(0xdbff)}`, [0x78, 0xdbff]],
    ['a lone low surrogate', `${String.fromCharCode(0xdc00)}x`, [0xdc00, 0x78]],
    ['reversed surrogates', String.fromCharCode(0xdc00, 0xd800), [0xdc00, 0xd800]],
    [
      'two high surrogates then a low',
      String.fromCharCode(0xd800, 0xd83d, 0xde00),
      [0xd800, 0x1f600],
    ],
    ['the empty string', '', []],
  ])('%s', (_label, text, codePoints) => {
    expect(codePointsOf(text)).toEqual(codePoints);
  });
});

describe('codePointHex and codePointEscape', () => {
  it.each([
    [0x0, '0000', '\\u{0000}'],
    [0x41, '0041', '\\u{0041}'],
    [0x200b, '200B', '\\u{200B}'],
    [0xfeff, 'FEFF', '\\u{FEFF}'],
    [0x1f600, '1F600', '\\u{1F600}'],
    [0x10ffff, '10FFFF', '\\u{10FFFF}'],
  ])('%i → %s, %s', (codePoint, hex, escaped) => {
    expect(codePointHex(codePoint)).toBe(hex);
    expect(codePointEscape(codePoint)).toBe(escaped);
  });
});

describe('escapeCallerText', () => {
  it.each([
    ['controls', 'line\tone\nline two', 'line\\u{0009}one\\u{000A}line two'],
    ['line and paragraph separators', 'a\u2028b\u2029c', 'a\\u{2028}b\\u{2029}c'],
    ['a format character', 'a\u00adb', 'a\\u{00AD}b'],
    [
      'default-ignorable combining and supplementary characters',
      'a\ufe0f\u{e0100}',
      'a\\u{FE0F}\\u{E0100}',
    ],
    ['a reserved default-ignorable', 'a\u2065b', 'a\\u{2065}b'],
    ['visible text, spaces and combining marks', ' Café e\u0301 😀 ', ' Café e\u0301 😀 '],
    ['the empty string', '', ''],
  ])('renders %s', (_label, input, expected) => {
    expect(escapeCallerText(input)).toBe(expected);
  });

  it('keeps long visible fragments whole', () => {
    expect(escapeCallerText('Café '.repeat(12))).toBe('Café '.repeat(12));
  });
});

describe('escapeCallerToken', () => {
  it.each([
    ['printable ASCII', 'U+110000', 'U+110000'],
    ['an HTML reference', '&#x200B;', '&#x200B;'],
    ['the printable bounds', '!~', '!~'],
    ['an RLO', `${String.fromCodePoint(0x202e)}x`, '\\u{202E}x'],
    ['a zero width space', String.fromCodePoint(0x200b), '\\u{200B}'],
    ['a NUL and a DEL', String.fromCodePoint(0x00, 0x7f), '\\u{0000}\\u{007F}'],
    ['a space', ' ', '\\u{0020}'],
    ['a no-break space', String.fromCodePoint(0xa0), '\\u{00A0}'],
    ['a display-safe non-ASCII letter', String.fromCodePoint(0xe9), '\\u{00E9}'],
    ['an emoji as one code point', String.fromCodePoint(0x1f600), '\\u{1F600}'],
    ['a lone high surrogate', String.fromCharCode(0xd800), '\\u{D800}'],
    ['a lone low surrogate', String.fromCharCode(0xdc00), '\\u{DC00}'],
  ])('%s', (_label, token, shown) => {
    expect(escapeCallerToken(token)).toBe(shown);
  });

  it('keeps a 40-code-point token whole', () => {
    expect(escapeCallerToken('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('cuts a 41-code-point token to 40 code points and an ellipsis', () => {
    expect(escapeCallerToken('a'.repeat(41))).toBe(`${'a'.repeat(40)}…`);
  });

  it('counts an emoji as one code point when cutting', () => {
    const token = `${'a'.repeat(39)}${String.fromCodePoint(0x1f600)}b`;
    expect(escapeCallerToken(token)).toBe(`${'a'.repeat(39)}\\u{1F600}…`);
  });

  it('never returns a character outside printable ASCII apart from the ellipsis', () => {
    const token = String.fromCodePoint(0x202e, 0x200b, 0x0, 0x301, 0xa0, 0x2028).repeat(10);
    const shown = escapeCallerToken(token);
    expect(shown.endsWith('…')).toBe(true);
    expect(/^[\x21-\x7e]*$/.test(shown.slice(0, -1))).toBe(true);
  });
});

describe('codeSpan and charDisplay', () => {
  it.each([
    ['A', '`A`'],
    ['`', '`` ` ``'],
    ['a`b', '``a`b``'],
    ['``', '``` `` ```'],
    ['\\u{200B}', '`\\u{200B}`'],
  ])('%s → %s', (text, span) => {
    expect(codeSpan(text)).toBe(span);
  });

  it.each([
    ['a letter', 'A'],
    ['a backtick', '`'],
    ['a run of backticks', 'a``b'],
    ['a number sign', '#'],
    ['an asterisk', '*'],
    ['a low line', '_'],
    ['a vertical line', '|'],
    ['a less-than sign', '<'],
    ['an ampersand', '&'],
    ['an entity-shaped text', '&amp;'],
    ['a backslash', '\\'],
    ['a strong right-to-left letter', String.fromCodePoint(0x5d0)],
    ['an emoji', String.fromCodePoint(0x1f600)],
    ['an escape', '\\u{202E}'],
  ])('a CommonMark parse reads %s back exactly', (_label, text) => {
    const tokens = inlineTokens(`x ${codeSpan(text)} y`);
    expect(
      tokens.filter((token) => token.type === 'code_inline').map((token) => token.content),
    ).toEqual([text]);
  });

  it('shows the glyph when char holds it', () => {
    expect(charDisplay('A', 0x41)).toBe('`A`');
  });

  it('shows the escape when char is null', () => {
    expect(charDisplay(null, 0x200b)).toBe('`\\u{200B}`');
    expect(charDisplay(null, 0xd800)).toBe('`\\u{D800}`');
  });
});
