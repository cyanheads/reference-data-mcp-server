/**
 * @fileoverview Tests for the Unicode lookup service: the query grammar and its errors, the
 * per-code-point records against values read from UCD 18.0.0, the whole-input summary, paging,
 * and the linear-time bound on every scan over caller text.
 * @module tests/services/unicode/unicode-service.test
 */

import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LookupMode } from '@/services/unicode/types.js';
import {
  getUnicodeService,
  initUnicodeService,
  parseQuery,
} from '@/services/unicode/unicode-service.js';

beforeAll(() => {
  initUnicodeService();
});

const N1 =
  'Inspected as literal text. To look up a code point instead, write it as U+ followed by its hexadecimal digits, or pass its decimal number with by "decimal".';

const cp = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

/** The error `run` throws, failing the test when it returns. */
function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected a throw.');
}

function lookup(query: string, by: LookupMode = 'auto', offset = 0, limit = 32) {
  return getUnicodeService().inspect(parseQuery(query, by).codePoints, offset, limit);
}

/** The single record a one-code-point query returns. */
function recordOf(query: string, by: LookupMode = 'code_point') {
  const [record, ...rest] = lookup(query, by).codePoints;
  expect(rest).toEqual([]);
  return record;
}

const same = (notation: string) => ({
  nfc: [notation],
  nfd: [notation],
  nfkc: [notation],
  nfkd: [notation],
});

describe('parseQuery — text', () => {
  it.each([
    ['letters around a zero width space', `a${cp(0x200b)}b`, [0x61, 0x200b, 0x62]],
    ['a single space, untrimmed', ' ', [0x20]],
    ['a lone surrogate then a letter', `${String.fromCharCode(0xd800)}x`, [0xd800, 0x78]],
    ['a surrogate pair as one code point', cp(0x1f600), [0x1f600]],
    ['code point notation, read literally', 'U+0041', [0x55, 0x2b, 0x30, 0x30, 0x34, 0x31]],
  ])('%s', (_label, query, codePoints) => {
    expect(parseQuery(query, 'text')).toEqual({ interpretedAs: 'text', codePoints, notices: [] });
  });
});

describe('parseQuery — code_point', () => {
  it.each([
    ['U+ uppercase', 'U+200B', [0x200b]],
    ['u+ lowercase', 'u+200b', [0x200b]],
    ['bare hex', '200B', [0x200b]],
    ['0x prefix', '0x200b', [0x200b]],
    ['0X prefix', '0X200B', [0x200b]],
    ['braced escape', '\\u{200B}', [0x200b]],
    ['braced escape, uppercase U', '\\U{200b}', [0x200b]],
    ['comma and space separators', 'U+0041, U+030A', [0x41, 0x30a]],
    ['surrogate code points stay code points', 'U+D83D U+DE00', [0xd83d, 0xde00]],
    ['one hex digit', '0', [0x0]],
    ['six hex digits', '10FFFF', [0x10ffff]],
    ['mixed forms', 'U+41 0x42 \\u{43} 44', [0x41, 0x42, 0x43, 0x44]],
    ['tabs, newlines, and runs of separators', '\tU+41,,\n\r U+42 ,', [0x41, 0x42]],
    ['a leading comma', ',U+0041', [0x41]],
    ['a trailing comma', 'U+0041,', [0x41]],
  ])('%s', (_label, query, codePoints) => {
    expect(parseQuery(query, 'code_point')).toEqual({
      interpretedAs: 'code_point',
      codePoints,
      notices: [],
    });
  });

  it.each([
    ['an HTML character reference', '&#x200B;'],
    ['an unbraced \\u escape', '\\u200B'],
    ['U+ with no digits', 'U+'],
    ['0x with no digits', '0x'],
    ['an empty brace escape', '\\u{}'],
    ['an unclosed brace escape', '\\u{41'],
    ['a non-hex letter', 'U+00G1'],
    ['a sign', '+41'],
    ['a no-break space inside the token', `U+${cp(0xa0)}41`],
  ])('rejects %s as malformed', (_label, query) => {
    expect(thrown(() => parseQuery(query, 'code_point'))).toMatchObject({
      code: JsonRpcErrorCode.ValidationError,
      message: expect.stringMatching(/^Token 1 \(.*\) is not a hexadecimal code point\.$/),
      data: { reason: 'invalid_code_point', token: 1 },
    });
  });
});

describe('parseQuery — decimal', () => {
  it.each([
    ['a decimal number', '8203', [0x200b]],
    ['two numbers', '65 768', [0x41, 0x300]],
    ['comma separated', '65,768', [0x41, 0x300]],
    ['zero', '0', [0x0]],
    ['the largest code point', '1114111', [0x10ffff]],
    ['seven digits with leading zeros', '0008203', [0x200b]],
    ['surrounding whitespace', '\t65\n', [0x41]],
  ])('%s', (_label, query, codePoints) => {
    expect(parseQuery(query, 'decimal')).toEqual({
      interpretedAs: 'decimal',
      codePoints,
      notices: [],
    });
  });

  it.each([
    ['a decimal point', '8203.0'],
    ['a minus sign', '-1'],
    ['a plus sign', '+1'],
    ['an exponent', '1e3'],
    ['hex', '0x41'],
    ['U+ notation', 'U+0041'],
  ])('rejects %s as malformed', (_label, query) => {
    expect(thrown(() => parseQuery(query, 'decimal'))).toMatchObject({
      code: JsonRpcErrorCode.ValidationError,
      message: expect.stringMatching(/^Token 1 \(.*\) is not a decimal code point\.$/),
      data: { reason: 'invalid_code_point', token: 1 },
    });
  });

  /**
   * A token of more than seven characters, all decimal digits, says how many it has; one with a
   * character that is not a decimal digit says it is not decimal, however long it is.
   */
  it.each([
    [
      'eight digits',
      '00008203',
      1,
      'Token 1 (00008203) has 8 decimal digits; a code point has at most 7.',
    ],
    [
      'eight digits as the second token',
      '65 00008203',
      2,
      'Token 2 (00008203) has 8 decimal digits; a code point has at most 7.',
    ],
    [
      'eight characters, one a letter',
      '000082a3',
      1,
      'Token 1 (000082a3) is not a decimal code point.',
    ],
    ['four characters, one a letter', '82a3', 1, 'Token 1 (82a3) is not a decimal code point.'],
  ])('says why %s does not read as a code point', (_label, query, token, message) => {
    const error = thrown(() => parseQuery(query, 'decimal'));
    expect(error).toMatchObject({ code: JsonRpcErrorCode.ValidationError, message });
    expect(error).toHaveProperty('data', { reason: 'invalid_code_point', token });
  });
});

describe('parseQuery — auto', () => {
  it.each<[string, string, 'text' | 'code_point', number[], string[]]>([
    ['one U+ token', 'U+200B', 'code_point', [0x200b], []],
    ['two U+ tokens', 'U+0041 U+030A', 'code_point', [0x41, 0x30a], []],
    ['mixed-case U+ tokens', 'u+0041 U+030a', 'code_point', [0x41, 0x30a], []],
    [
      'tabs and newlines between U+ tokens',
      'U+0041\tU+030A\nU+0042\r\nU+0043',
      'code_point',
      [0x41, 0x30a, 0x42, 0x43],
      [],
    ],
    ['commas between U+ tokens', 'U+0041,U+0042, U+0043', 'code_point', [0x41, 0x42, 0x43], []],
    ['U+ tokens inside surrounding whitespace', '  U+0041 \n', 'code_point', [0x41], []],
    ['five hex digits', 'U+1F600', 'code_point', [0x1f600], []],
    ['digits read as text, with the notice', '8203', 'text', [0x38, 0x32, 0x30, 0x33], [N1]],
    ['digits inside whitespace, with the notice', ' 42 ', 'text', [0x20, 0x34, 0x32, 0x20], [N1]],
    [
      '0x read as text, with the notice',
      '0x200B',
      'text',
      [...'0x200B'].map((c) => c.charCodeAt(0)),
      [N1],
    ],
    [
      'an unbraced \\u escape, with the notice',
      '\\u200B',
      'text',
      [...'\\u200B'].map((c) => c.charCodeAt(0)),
      [N1],
    ],
    [
      'a braced \\u escape, with the notice',
      '\\u{200B}',
      'text',
      [...'\\u{200B}'].map((c) => c.charCodeAt(0)),
      [N1],
    ],
    [
      'a hex character reference, with the notice',
      '&#x200B;',
      'text',
      [...'&#x200B;'].map((c) => c.charCodeAt(0)),
      [N1],
    ],
    [
      'a decimal character reference, with the notice',
      '&#8203;',
      'text',
      [...'&#8203;'].map((c) => c.charCodeAt(0)),
      [N1],
    ],
    [
      'a sentence starting with U+',
      'U+200B is a ZWSP',
      'text',
      [...'U+200B is a ZWSP'].map((c) => c.charCodeAt(0)),
      [],
    ],
    ['whitespace only', '   ', 'text', [0x20, 0x20, 0x20], []],
    ['a trailing comma', 'U+0041,', 'code_point', [0x41], []],
    ['a leading comma', ',U+0041', 'code_point', [0x41], []],
    ['a run of commas between U+ tokens', 'U+0041,,U+0042', 'code_point', [0x41, 0x42], []],
    ['U+ alone', 'U+', 'text', [0x55, 0x2b], []],
    ['U+ and a comma', 'U+,', 'text', [0x55, 0x2b, 0x2c], []],
    ['U+ and a non-hex letter', 'U+G', 'text', [0x55, 0x2b, 0x47], []],
    ['a U+ token then a word', 'U+0041 x', 'text', [...'U+0041 x'].map((c) => c.charCodeAt(0)), []],
    ['commas and a space only', ', ,', 'text', [0x2c, 0x20, 0x2c], []],
    ['bare hex', '200B', 'text', [0x32, 0x30, 0x30, 0x42], []],
    ['digits and a letter', '12a', 'text', [0x31, 0x32, 0x61], []],
    ['0x with no digits', '0x', 'text', [0x30, 0x78], []],
    ['a character reference with no digits', '&#;', 'text', [0x26, 0x23, 0x3b], []],
  ])('%s', (_label, query, interpretedAs, codePoints, notices) => {
    expect(parseQuery(query, 'auto')).toEqual({ interpretedAs, codePoints, notices });
  });

  /**
   * The notice tells the caller to write the code point as U+ and hex digits, or to pass its decimal
   * number with by "decimal". Each row follows that advice for one shape the notice fires on.
   */
  it.each<[string, string, string, LookupMode]>([
    ['0x hex', '0x200B', 'U+200B', 'auto'],
    ['a braced \\u escape', '\\u{200B}', 'U+200B', 'auto'],
    ['an unbraced \\u escape', '\\u200B', 'U+200B', 'auto'],
    ['a hex character reference', '&#x200B;', 'U+200B', 'auto'],
    ['a decimal character reference', '&#8203;', '8203', 'decimal'],
    ['a decimal number', '8203', '8203', 'decimal'],
  ])('the notice on %s gives advice that reaches the code point', (_label, query, advised, by) => {
    expect(parseQuery(query, 'auto')).toMatchObject({ interpretedAs: 'text', notices: [N1] });
    expect(parseQuery(advised, by)).toEqual({
      interpretedAs: by === 'auto' ? 'code_point' : by,
      codePoints: [0x200b],
      notices: [],
    });
  });

  it('reads an out-of-range U+ token as a code point and rejects it', () => {
    expect(thrown(() => parseQuery('U+110000', 'auto'))).toMatchObject({
      code: JsonRpcErrorCode.ValidationError,
      message: 'Token 1 (U+110000) is 1114112, above 1114111 (U+10FFFF), the largest code point.',
      data: { reason: 'invalid_code_point', token: 1 },
    });
  });

  it.each([
    ['U+0000041', 7],
    ['U+DEADBEEF', 8],
  ])('reads %s, more than six hex digits after U+, as notation and rejects it', (query, count) => {
    expect(thrown(() => parseQuery(query, 'auto'))).toMatchObject({
      code: JsonRpcErrorCode.ValidationError,
      message: `Token 1 (${query}) has ${count} hex digits; a code point has at most 6.`,
      data: { reason: 'invalid_code_point', token: 1 },
    });
  });

  it('names the over-long token by its position among U+ tokens', () => {
    expect(thrown(() => parseQuery('U+0041, U+0000042', 'auto'))).toMatchObject({
      message: 'Token 2 (U+0000042) has 7 hex digits; a code point has at most 6.',
      data: { reason: 'invalid_code_point', token: 2 },
    });
  });
});

describe('parseQuery — error messages', () => {
  it.each<[string, LookupMode]>([
    ['  ,  ', 'code_point'],
    [' \t\n', 'code_point'],
    [',', 'decimal'],
  ])('%j by %s holds no tokens', (query, by) => {
    const error = thrown(() => parseQuery(query, by));
    expect(error).toMatchObject({
      code: JsonRpcErrorCode.ValidationError,
      message: `by "${by}" needs at least one token; the query holds only spaces or commas.`,
    });
    expect(error).toHaveProperty('data', { reason: 'invalid_code_point' });
  });

  /**
   * A token whose digits are all hex but more than six says how many it has; one with a non-hex
   * digit says it is not hexadecimal, however long it is. Each prefix form is a row on the long side.
   */
  it.each([
    ['U+ and 8 hex digits', 'U+0001F600', 'has 8 hex digits; a code point has at most 6'],
    ['0x and 8 hex digits', '0x0000200B', 'has 8 hex digits; a code point has at most 6'],
    [
      'a braced escape of 7 hex digits',
      '\\u{0000041}',
      'has 7 hex digits; a code point has at most 6',
    ],
    ['7 bare hex digits', '0000041', 'has 7 hex digits; a code point has at most 6'],
    ['a non-hex letter', 'U+00G1', 'is not a hexadecimal code point'],
    ['a non-hex letter among 8 digits', 'U+0001F60G', 'is not a hexadecimal code point'],
  ])('says why %s does not read as a code point', (_label, query, why) => {
    const error = thrown(() => parseQuery(query, 'code_point'));
    expect(error).toMatchObject({
      code: JsonRpcErrorCode.ValidationError,
      message: `Token 1 (${query}) ${why}.`,
    });
    expect(error).toHaveProperty('data', { reason: 'invalid_code_point', token: 1 });
  });

  it('names the first bad token by its 1-based position', () => {
    expect(thrown(() => parseQuery('U+0041 U+0042 nope U+zz', 'code_point'))).toMatchObject({
      message: 'Token 3 (nope) is not a hexadecimal code point.',
      data: { reason: 'invalid_code_point', token: 3 },
    });
  });

  it('reports a malformed decimal token', () => {
    expect(thrown(() => parseQuery('65 8203.0', 'decimal'))).toMatchObject({
      message: 'Token 2 (8203.0) is not a decimal code point.',
      data: { reason: 'invalid_code_point', token: 2 },
    });
  });

  it('reports an out-of-range decimal token', () => {
    expect(thrown(() => parseQuery('1114112', 'decimal'))).toMatchObject({
      message: 'Token 1 (1114112) is 1114112, above 1114111 (U+10FFFF), the largest code point.',
      data: { reason: 'invalid_code_point', token: 1 },
    });
  });

  it('reports an out-of-range hex token in code_point mode', () => {
    expect(thrown(() => parseQuery('41 FFFFFF', 'code_point'))).toMatchObject({
      message: 'Token 2 (FFFFFF) is 16777215, above 1114111 (U+10FFFF), the largest code point.',
      data: { reason: 'invalid_code_point', token: 2 },
    });
  });

  it('escapes characters outside printable ASCII in the token it names', () => {
    const query = `U+${cp(0x202e)}41${String.fromCharCode(0xd800)}`;
    expect(thrown(() => parseQuery(query, 'code_point'))).toMatchObject({
      message: 'Token 1 (U+\\u{202E}41\\u{D800}) is not a hexadecimal code point.',
    });
  });

  it('cuts a long token to 40 code points', () => {
    expect(thrown(() => parseQuery('Z'.repeat(50), 'code_point'))).toMatchObject({
      message: `Token 1 (${'Z'.repeat(40)}…) is not a hexadecimal code point.`,
    });
  });
});

describe('inspect — records', () => {
  it('returns the full U+200B record', () => {
    expect(recordOf('U+200B')).toEqual({
      index: 0,
      utf16_offset: 0,
      cluster_index: 0,
      code_point: 'U+200B',
      char: null,
      decimal: 8203,
      name: 'ZERO WIDTH SPACE',
      label: null,
      aliases: [{ alias: 'ZWSP', type: 'abbreviation' }],
      category: 'Cf',
      category_name: 'Format',
      code_point_type: 'format',
      block: 'General Punctuation',
      script: 'Common',
      is_whitespace: false,
      is_default_ignorable: true,
      is_bidi_control: false,
      is_invisible: true,
      utf8: 'E2 80 8B',
      utf16: '200B',
      normalization: same('U+200B'),
    });
  });

  it.each([
    [
      'U+0000',
      {
        char: null,
        name: null,
        label: '<control-0000>',
        aliases: [
          { alias: 'NULL', type: 'control' },
          { alias: 'NUL', type: 'abbreviation' },
        ],
        category: 'Cc',
        category_name: 'Control',
        code_point_type: 'control',
        block: 'Basic Latin',
        is_invisible: true,
        utf8: '00',
        utf16: '0000',
      },
    ],
    [
      'U+0009',
      {
        char: null,
        name: null,
        label: '<control-0009>',
        aliases: [
          { alias: 'CHARACTER TABULATION', type: 'control' },
          { alias: 'HORIZONTAL TABULATION', type: 'control' },
          { alias: 'HT', type: 'abbreviation' },
          { alias: 'TAB', type: 'abbreviation' },
        ],
        is_whitespace: true,
        is_invisible: false,
      },
    ],
    [
      'U+0020',
      {
        char: null,
        name: 'SPACE',
        label: null,
        category: 'Zs',
        category_name: 'Space_Separator',
        is_whitespace: true,
        is_invisible: false,
      },
    ],
    [
      'U+0041',
      {
        char: 'A',
        name: 'LATIN CAPITAL LETTER A',
        category: 'Lu',
        category_name: 'Uppercase_Letter',
        script: 'Latin',
        code_point_type: 'graphic',
      },
    ],
    [
      'U+00A0',
      {
        char: null,
        name: 'NO-BREAK SPACE',
        aliases: [{ alias: 'NBSP', type: 'abbreviation' }],
        category: 'Zs',
        is_whitespace: true,
        is_invisible: true,
        utf8: 'C2 A0',
        normalization: { nfc: ['U+00A0'], nfd: ['U+00A0'], nfkc: ['U+0020'], nfkd: ['U+0020'] },
      },
    ],
    [
      'U+00E9',
      {
        char: cp(0xe9),
        name: 'LATIN SMALL LETTER E WITH ACUTE',
        normalization: {
          nfc: ['U+00E9'],
          nfd: ['U+0065', 'U+0301'],
          nfkc: ['U+00E9'],
          nfkd: ['U+0065', 'U+0301'],
        },
      },
    ],
    [
      'U+0301',
      {
        char: null,
        name: 'COMBINING ACUTE ACCENT',
        category: 'Mn',
        category_name: 'Nonspacing_Mark',
        code_point_type: 'graphic',
        script: 'Inherited',
        is_invisible: false,
      },
    ],
    [
      'U+0378',
      {
        char: null,
        name: null,
        label: '<reserved-0378>',
        aliases: [],
        category: 'Cn',
        category_name: 'Unassigned',
        code_point_type: 'reserved',
        block: 'Greek and Coptic',
        script: 'Unknown',
      },
    ],
    [
      'U+FFFE',
      {
        char: null,
        name: null,
        label: '<noncharacter-FFFE>',
        category: 'Cn',
        code_point_type: 'noncharacter',
        block: 'Specials',
        utf8: 'EF BF BE',
      },
    ],
    [
      'U+D800',
      {
        char: null,
        name: null,
        label: '<surrogate-D800>',
        category: 'Cs',
        category_name: 'Surrogate',
        code_point_type: 'surrogate',
        block: 'High Surrogates',
        utf8: null,
        utf16: 'D800',
        normalization: same('U+D800'),
      },
    ],
    [
      'U+E000',
      {
        char: null,
        name: null,
        label: '<private-use-E000>',
        category: 'Co',
        category_name: 'Private_Use',
        code_point_type: 'private_use',
        block: 'Private Use Area',
      },
    ],
    [
      'U+4E00',
      {
        char: cp(0x4e00),
        name: 'CJK UNIFIED IDEOGRAPH-4E00',
        category: 'Lo',
        category_name: 'Other_Letter',
        block: 'CJK Unified Ideographs',
        script: 'Han',
      },
    ],
    [
      'U+AC00',
      {
        name: 'HANGUL SYLLABLE GA',
        normalization: {
          nfc: ['U+AC00'],
          nfd: ['U+1100', 'U+1161'],
          nfkc: ['U+AC00'],
          nfkd: ['U+1100', 'U+1161'],
        },
      },
    ],
    [
      'U+AC01',
      {
        name: 'HANGUL SYLLABLE GAG',
        normalization: {
          nfc: ['U+AC01'],
          nfd: ['U+1100', 'U+1161', 'U+11A8'],
          nfkc: ['U+AC01'],
          nfkd: ['U+1100', 'U+1161', 'U+11A8'],
        },
      },
    ],
    [
      'U+D7A3',
      {
        name: 'HANGUL SYLLABLE HIH',
        normalization: {
          nfc: ['U+D7A3'],
          nfd: ['U+1112', 'U+1175', 'U+11C2'],
          nfkc: ['U+D7A3'],
          nfkd: ['U+1112', 'U+1175', 'U+11C2'],
        },
      },
    ],
    [
      'U+3D000',
      {
        char: cp(0x3d000),
        name: 'SMALL SEAL CHARACTER-3D000',
        category: 'Lo',
        block: 'Seal',
        script: 'Seal',
        utf8: 'F0 BD 80 80',
        utf16: 'D8B4 DC00',
      },
    ],
    [
      'U+0558',
      {
        name: 'MODIFIER LETTER ARMENIAN SMALL EH',
        category: 'Lm',
        normalization: { nfc: ['U+0558'], nfd: ['U+0558'], nfkc: ['U+0567'], nfkd: ['U+0567'] },
      },
    ],
    [
      'U+50000',
      {
        char: null,
        name: null,
        label: '<reserved-50000>',
        block: null,
        code_point_type: 'reserved',
        utf16: 'D900 DC00',
      },
    ],
    [
      'U+10FFFF',
      {
        char: null,
        label: '<noncharacter-10FFFF>',
        code_point_type: 'noncharacter',
        block: 'Supplementary Private Use Area-B',
        utf8: 'F4 8F BF BF',
        utf16: 'DBFF DFFF',
      },
    ],
    [
      'U+FEFF',
      {
        char: null,
        name: 'ZERO WIDTH NO-BREAK SPACE',
        block: 'Arabic Presentation Forms-B',
        aliases: [
          { alias: 'BYTE ORDER MARK', type: 'alternate' },
          { alias: 'BOM', type: 'abbreviation' },
          { alias: 'ZWNBSP', type: 'abbreviation' },
        ],
        is_invisible: true,
      },
    ],
    [
      'U+202E',
      {
        char: null,
        name: 'RIGHT-TO-LEFT OVERRIDE',
        aliases: [{ alias: 'RLO', type: 'abbreviation' }],
        is_bidi_control: true,
        is_default_ignorable: true,
        is_invisible: true,
      },
    ],
    [
      'U+3164',
      {
        char: null,
        name: 'HANGUL FILLER',
        code_point_type: 'graphic',
        is_default_ignorable: true,
        is_invisible: true,
        normalization: { nfc: ['U+3164'], nfd: ['U+3164'], nfkc: ['U+1160'], nfkd: ['U+1160'] },
      },
    ],
    ['U+2800', { char: cp(0x2800), name: 'BRAILLE PATTERN BLANK', is_invisible: false }],
    [
      'U+1680',
      {
        char: null,
        name: 'OGHAM SPACE MARK',
        category: 'Zs',
        is_whitespace: true,
        is_invisible: true,
      },
    ],
    ['U+200C', { name: 'ZERO WIDTH NON-JOINER', is_invisible: true }],
    ['U+200D', { name: 'ZERO WIDTH JOINER', script: 'Inherited', is_invisible: true }],
    ['U+2060', { name: 'WORD JOINER', is_invisible: true }],
    [
      'U+2028',
      {
        char: null,
        name: 'LINE SEPARATOR',
        category: 'Zl',
        code_point_type: 'format',
        is_whitespace: true,
        is_invisible: true,
      },
    ],
    [
      'U+212B',
      {
        name: 'ANGSTROM SIGN',
        normalization: {
          nfc: ['U+00C5'],
          nfd: ['U+0041', 'U+030A'],
          nfkc: ['U+00C5'],
          nfkd: ['U+0041', 'U+030A'],
        },
      },
    ],
    ['U+2126', { name: 'OHM SIGN', normalization: same('U+03A9') }],
    [
      'U+FB01',
      {
        name: 'LATIN SMALL LIGATURE FI',
        normalization: {
          nfc: ['U+FB01'],
          nfd: ['U+FB01'],
          nfkc: ['U+0066', 'U+0069'],
          nfkd: ['U+0066', 'U+0069'],
        },
      },
    ],
    [
      'U+1F600',
      {
        char: cp(0x1f600),
        name: 'GRINNING FACE',
        category: 'So',
        category_name: 'Other_Symbol',
        block: 'Emoticons',
        utf8: 'F0 9F 98 80',
        utf16: 'D83D DE00',
      },
    ],
    // Both sides of the UTF-8 two-to-three and three-to-four byte boundaries.
    [
      'U+07FF',
      {
        name: 'NKO TAMAN SIGN',
        aliases: [],
        category: 'Sc',
        category_name: 'Currency_Symbol',
        block: 'NKo',
        script: 'Nko',
        utf8: 'DF BF',
        utf16: '07FF',
        normalization: same('U+07FF'),
      },
    ],
    [
      'U+0800',
      {
        name: 'SAMARITAN LETTER ALAF',
        aliases: [],
        category: 'Lo',
        category_name: 'Other_Letter',
        block: 'Samaritan',
        script: 'Samaritan',
        utf8: 'E0 A0 80',
        utf16: '0800',
        normalization: same('U+0800'),
      },
    ],
    [
      'U+FFFD',
      {
        name: 'REPLACEMENT CHARACTER',
        aliases: [],
        category: 'So',
        category_name: 'Other_Symbol',
        block: 'Specials',
        script: 'Common',
        utf8: 'EF BF BD',
        utf16: 'FFFD',
        normalization: same('U+FFFD'),
      },
    ],
    [
      'U+10000',
      {
        name: 'LINEAR B SYLLABLE B008 A',
        aliases: [],
        category: 'Lo',
        category_name: 'Other_Letter',
        block: 'Linear B Syllabary',
        script: 'Linear_B',
        utf8: 'F0 90 80 80',
        utf16: 'D800 DC00',
        normalization: same('U+10000'),
      },
    ],
  ])('%s', (query, expected) => {
    expect(recordOf(query)).toMatchObject(expected);
  });

  it('gives U+FDFA an 18-code-point compatibility decomposition', () => {
    const expanded = [
      'U+0635',
      'U+0644',
      'U+0649',
      'U+0020',
      'U+0627',
      'U+0644',
      'U+0644',
      'U+0647',
      'U+0020',
      'U+0639',
      'U+0644',
      'U+064A',
      'U+0647',
      'U+0020',
      'U+0648',
      'U+0633',
      'U+0644',
      'U+0645',
    ];
    expect(recordOf('U+FDFA')?.normalization).toEqual({
      nfc: ['U+FDFA'],
      nfd: ['U+FDFA'],
      nfkc: expanded,
      nfkd: expanded,
    });
  });

  it('returns the same record for the character, its U+ notation, and its decimal value', () => {
    const viaCodePoint = recordOf('U+200B');
    expect(recordOf(cp(0x200b), 'text')).toEqual(viaCodePoint);
    expect(recordOf('8203', 'decimal')).toEqual(viaCodePoint);
  });
});

describe('inspect — summary and clusters', () => {
  it('groups e and a combining acute into one cluster', () => {
    const result = lookup('U+0065 U+0301');
    expect(result.codePoints.map((r) => [r.code_point, r.cluster_index, r.utf16_offset])).toEqual([
      ['U+0065', 0, 0],
      ['U+0301', 0, 1],
    ]);
    expect(result.summary.grapheme_cluster_count).toBe(1);
  });

  it('keeps the ZWJ family emoji in one cluster', () => {
    const result = lookup(cp(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467, 0x200d, 0x1f466));
    expect(result.codePoints.map((r) => r.cluster_index)).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result.codePoints.map((r) => r.utf16_offset)).toEqual([0, 2, 3, 5, 6, 8, 9]);
    expect(result.summary).toEqual({
      code_point_count: 7,
      grapheme_cluster_count: 1,
      utf16_length: 11,
      utf8_length: 25,
      well_formed: true,
      invisible_indices: [1, 3, 5],
      bidi_control_indices: [],
    });
    expect(result.codePoints[1]).toMatchObject({
      script: 'Inherited',
      is_invisible: true,
      char: null,
    });
  });

  it('pairs regional indicators', () => {
    const result = lookup(cp(0x1f1fa, 0x1f1f8, 0x1f1e6));
    expect(result.codePoints.map((r) => r.cluster_index)).toEqual([0, 0, 1]);
    expect(result.summary.grapheme_cluster_count).toBe(2);
  });

  it('finds the hidden zero width space in a sentence', () => {
    const result = lookup(`hello${cp(0x200b)} world`);
    expect(result.summary).toEqual({
      code_point_count: 12,
      grapheme_cluster_count: 12,
      utf16_length: 12,
      utf8_length: 14,
      well_formed: true,
      invisible_indices: [5],
      bidi_control_indices: [],
    });
    expect(result.codePoints[7]).toMatchObject({
      code_point: 'U+0077',
      utf16_offset: 7,
      cluster_index: 7,
    });
  });

  it('reports a lone surrogate as its own ill-formed cluster', () => {
    const result = lookup(`${String.fromCharCode(0xd800)}x`, 'text');
    expect(
      result.codePoints.map((r) => [r.code_point, r.code_point_type, r.cluster_index]),
    ).toEqual([
      ['U+D800', 'surrogate', 0],
      ['U+0078', 'graphic', 1],
    ]);
    expect(result.summary).toMatchObject({
      utf16_length: 2,
      utf8_length: null,
      well_formed: false,
    });
  });

  it('marks a surrogate code point from U+ notation not encodable', () => {
    expect(lookup('U+D800').summary).toMatchObject({ utf8_length: null, well_formed: false });
  });

  it('lists bidi controls and invisible code points over the whole input', () => {
    const text = `a${cp(0x202e)}b${cp(0x9, 0xa, 0xd, 0x20, 0xa0, 0x2066, 0x0)}`;
    const result = lookup(text, 'text', 0, 1);
    expect(result.codePoints).toHaveLength(1);
    expect(result.summary.bidi_control_indices).toEqual([1, 8]);
    expect(result.summary.invisible_indices).toEqual([1, 7, 8, 9]);
  });

  it('counts U+FFFF as one UTF-16 unit and U+10000 as two', () => {
    const result = lookup('U+FFFF U+10000 U+0041');
    expect(result.summary.utf16_length).toBe(4);
    expect(result.codePoints.map((r) => r.utf16_offset)).toEqual([0, 1, 3]);
  });
});

describe('inspect — paging', () => {
  const service = () => getUnicodeService();
  const as = Array.from({ length: 300 }, () => 0x61);

  it('returns the default 32 code points with a continuation', () => {
    const result = service().inspect(as, 0, 32);
    expect(result.codePoints.map((r) => r.index)).toEqual(Array.from({ length: 32 }, (_, i) => i));
    expect(result).toMatchObject({ truncated: true, nextOffset: 32, notices: [] });
    expect(result.summary.code_point_count).toBe(300);
  });

  it('returns one code point at limit 1', () => {
    const result = service().inspect(as, 5, 1);
    expect(result.codePoints.map((r) => r.index)).toEqual([5]);
    expect(result).toMatchObject({ truncated: true, nextOffset: 6, notices: [] });
  });

  it('clamps a limit above 128 with a notice', () => {
    const result = service().inspect(as, 0, 500);
    expect(result.codePoints).toHaveLength(128);
    expect(result).toMatchObject({
      truncated: true,
      nextOffset: 128,
      notices: ['limit 500 exceeds the cap of 128; this page holds at most 128 code points.'],
    });
  });

  it('accepts exactly 128 without a notice', () => {
    expect(service().inspect(as, 0, 128).notices).toEqual([]);
  });

  it('ends at the last index', () => {
    const result = service().inspect(as, 299, 32);
    expect(result.codePoints.map((r) => r.index)).toEqual([299]);
    expect(result).toMatchObject({ truncated: false, nextOffset: null, notices: [] });
  });

  it('returns a short final page', () => {
    const result = service().inspect(as, 288, 32);
    expect(result.codePoints.map((r) => r.index)).toEqual(
      Array.from({ length: 12 }, (_, i) => 288 + i),
    );
    expect(result).toMatchObject({ truncated: false, nextOffset: null });
  });

  it('ends a final page that holds exactly limit code points', () => {
    const result = service().inspect(as, 296, 4);
    expect(result.codePoints.map((r) => r.index)).toEqual([296, 297, 298, 299]);
    expect(result).toMatchObject({ truncated: false, nextOffset: null, notices: [] });
  });

  it.each([300, 301, 10_000])('returns an empty page with a notice at offset %i', (offset) => {
    const result = service().inspect(as, offset, 32);
    expect(result).toMatchObject({
      codePoints: [],
      truncated: false,
      nextOffset: null,
      notices: [
        `offset ${offset} is past the last code point (index 299); pass offset 0 to start from the beginning.`,
      ],
    });
    expect(result.summary.code_point_count).toBe(300);
  });

  it('orders the clamp notice before the offset notice', () => {
    expect(service().inspect(as, 400, 129).notices).toEqual([
      'limit 129 exceeds the cap of 128; this page holds at most 128 code points.',
      'offset 400 is past the last code point (index 299); pass offset 0 to start from the beginning.',
    ]);
  });

  it('keeps a grapheme cluster split across pages and the summary identical', () => {
    // e + U+0301 at indices 31–32 straddles the default page boundary.
    const codePoints = [...Array.from({ length: 31 }, () => 0x61), 0x65, 0x301, 0x62];
    const first = service().inspect(codePoints, 0, 32);
    const second = service().inspect(codePoints, 32, 32);
    expect(first.codePoints.at(-1)).toMatchObject({
      index: 31,
      code_point: 'U+0065',
      cluster_index: 31,
    });
    expect(
      second.codePoints.map((r) => [r.index, r.code_point, r.cluster_index, r.utf16_offset]),
    ).toEqual([
      [32, 'U+0301', 31, 32],
      [33, 'U+0062', 32, 33],
    ]);
    expect(second.summary).toEqual(first.summary);
    expect(first.summary.grapheme_cluster_count).toBe(33);
  });

  it('carries UTF-16 offsets across pages past astral code points', () => {
    const codePoints = [0x1f600, 0x41, 0x1f600, 0x42];
    const result = service().inspect(codePoints, 2, 2);
    expect(result.codePoints.map((r) => r.utf16_offset)).toEqual([3, 5]);
  });
});

describe('linear time over caller text', () => {
  const cpuMicros = () => {
    const usage = process.threadCpuUsage();
    return usage.user + usage.system;
  };

  /** Least per-call thread CPU time in µs over `rounds` batches of `calls` calls. */
  function leastPerCall(run: () => unknown, calls: number, rounds = 5): number {
    let least = Number.POSITIVE_INFINITY;
    for (let round = 0; round < rounds; round++) {
      const start = cpuMicros();
      for (let call = 0; call < calls; call++) run();
      least = Math.min(least, (cpuMicros() - start) / calls);
    }
    return least;
  }

  const BASE = 5_000;
  const callsFor = (size: number) => Math.max(1, Math.round(100_000 / size));

  /**
   * Doubles the input from 5k to 320k, re-timing the 5k input beside each size. The least of three
   * paired ratios must stay under 4× the size ratio at every step (256 over the full 64× span), so a
   * quadratic scan fails by 40k; the 320k call must stay under `maxMicros` of thread CPU.
   */
  function expectLinear(build: (size: number) => () => unknown, maxMicros: number) {
    const small = build(BASE);
    let largestMicros = 0;
    for (let size = BASE * 2; size <= BASE * 64; size *= 2) {
      const large = build(size);
      let ratio = Number.POSITIVE_INFINITY;
      for (let pair = 0; pair < 3; pair++) {
        const smallMicros = leastPerCall(small, callsFor(BASE));
        largestMicros = leastPerCall(large, callsFor(size));
        ratio = Math.min(ratio, largestMicros / Math.max(smallMicros, 1));
      }
      expect(ratio, `CPU growth from ${BASE} to ${size}`).toBeLessThan(4 * (size / BASE));
    }
    expect(largestMicros, `CPU µs at ${BASE * 64}`).toBeLessThan(maxMicros);
  }

  /** `unit` repeated to `size` UTF-16 code units. */
  const fill = (unit: string, size: number) =>
    unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
  const longLine = (size: number) => `${'x'.repeat(size)}\ny`;
  const breaksThroughout = (size: number) => fill('  \r\n', size);

  const parsing = (query: (size: number) => string, by: LookupMode) => (size: number) => {
    const text = query(size);
    return () => {
      try {
        return parseQuery(text, by);
      } catch (error) {
        return error;
      }
    };
  };

  it.each<[string, (size: number) => string, LookupMode]>([
    ['auto: one long line', longLine, 'auto'],
    ['auto: line breaks throughout', breaksThroughout, 'auto'],
    ['auto: valid U+ tokens to the end', (n) => fill('U+0041 ', n).trimEnd(), 'auto'],
    ['auto: U+ tokens failing at the last', (n) => `${fill('U+0041 ', n)}U+`, 'auto'],
    ['auto: one long U+ token, rejected', (n) => `U+${'f'.repeat(n)}`, 'auto'],
    ['auto: a digit run', (n) => '1'.repeat(n), 'auto'],
    ['auto: a digit run failing at the end', (n) => `${'1'.repeat(n)}x`, 'auto'],
    ['auto: 0x and a hex run', (n) => `0x${'f'.repeat(n)}`, 'auto'],
    ['auto: a braced escape around a hex run', (n) => `\\u{${'f'.repeat(n)}}`, 'auto'],
    ['auto: a character reference around a hex run', (n) => `&#x${'f'.repeat(n)};`, 'auto'],
    ['text: an emoji run', (n) => fill(cp(0x1f600), n), 'text'],
    ['text: lone surrogates', (n) => String.fromCharCode(0xd800).repeat(n), 'text'],
    ['code_point: one long line', longLine, 'code_point'],
    ['code_point: line breaks throughout', breaksThroughout, 'code_point'],
    [
      'code_point: valid tokens of every form',
      (n) => fill('U+41 0x42 \\u{43} 44,', n),
      'code_point',
    ],
    ['code_point: tokens failing at the last', (n) => `${fill('U+0041,', n)}zz`, 'code_point'],
    ['code_point: one long hex token', (n) => 'f'.repeat(n), 'code_point'],
    ['code_point: one long 0x token', (n) => `0x${'f'.repeat(n)}`, 'code_point'],
    ['code_point: one long braced escape', (n) => `\\u{${'f'.repeat(n)}}`, 'code_point'],
    ['code_point: one long escaped token', (n) => cp(0x202e).repeat(n), 'code_point'],
    ['decimal: one long line', longLine, 'decimal'],
    ['decimal: line breaks throughout', breaksThroughout, 'decimal'],
    ['decimal: valid tokens', (n) => fill('65 ', n), 'decimal'],
    ['decimal: one long digit run', (n) => '1'.repeat(n), 'decimal'],
  ])(
    'parseQuery stays linear — %s',
    (_label, query, by) => {
      expectLinear(parsing(query, by), 100_000);
    },
    0,
  );

  const inspecting = (text: (size: number) => string) => (size: number) => {
    const codePoints = parseQuery(text(size), 'text').codePoints;
    return () => getUnicodeService().inspect(codePoints, 0, 32);
  };

  it.each<[string, (size: number) => string]>([
    ['one long line', longLine],
    ['line breaks throughout', breaksThroughout],
    ['a ZWJ emoji chain', (n) => fill(cp(0x1f468, 0x200d), n)],
    ['regional indicators', (n) => fill(cp(0x1f1fa), n)],
    ['a base and a run of combining marks', (n) => `e${fill(cp(0x301), n)}`],
    ['an Indic conjunct chain', (n) => fill(cp(0x915, 0x94d), n)],
    ['Hangul jamo L V T', (n) => fill(cp(0x1100, 0x1161, 0x11a8), n)],
    ['invisible code points throughout', (n) => fill(cp(0x200b), n)],
    ['lone surrogates', (n) => String.fromCharCode(0xd800).repeat(n)],
  ])(
    'inspect stays linear — %s',
    (_label, text) => {
      expectLinear(inspecting(text), 500_000);
    },
    0,
  );
});
