/**
 * @fileoverview Tests for the ref_unicode_lookup tool through the framework's contract runner:
 * input defaults and bounds, the parser and service wired to both response surfaces, every
 * invalid_code_point branch with its recovery hint, paging, CommonMark round-trips of format(), and
 * display safety. Record values are tabled once at the service seam
 * (tests/services/unicode/unicode-service.test.ts); this file proves the wiring.
 * @module tests/tools/ref-unicode-lookup.tool.test
 */

import { z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { runToolContract } from '@cyanheads/mcp-ts-core/testing';
import MarkdownIt from 'markdown-it';
import { beforeAll, describe, expect, it } from 'vitest';
import { refUnicodeLookup } from '@/mcp-server/tools/definitions/ref-unicode-lookup.tool.js';
import { initUnicodeService } from '@/services/unicode/unicode-service.js';

beforeAll(() => {
  initUnicodeService();
});

type Input = z.input<typeof refUnicodeLookup.input>;
type CallResult = Awaited<ReturnType<typeof runToolContract>>;

const SuccessSchema = refUnicodeLookup.output.extend({ notice: z.string().optional() });
type Success = z.infer<typeof SuccessSchema>;
type CodePointRecord = Success['code_points'][number];

const cp = (...codePoints: number[]) => String.fromCodePoint(...codePoints);

const RECOVERY =
  'With by "decimal", write each code point as decimal digits from 0 to 1114111; otherwise write it as U+ followed by 1 to 6 hex digits, from U+0000 to U+10FFFF. Separate code points with spaces or commas, or pass by "text" to inspect the characters as written.';
/** The hint's instruction for each `by`: a caller follows the one for the mode it sent. */
const DECIMAL_FORM = 'With by "decimal", write each code point as decimal digits from 0 to 1114111';
const HEX_FORM = 'U+ followed by 1 to 6 hex digits';
const ErrorHintSchema = z.object({
  error: z.object({
    data: z.object({
      reason: z.literal('invalid_code_point'),
      recovery: z.object({ hint: z.string() }),
    }),
  }),
});
const LITERAL_TEXT_NOTICE =
  'Inspected as literal text. To look up a code point instead, write it as U+ followed by its hexadecimal digits, or pass its decimal number with by "decimal".';
const clampNotice = (limit: number) =>
  `limit ${limit} exceeds the cap of 128; this page holds at most 128 code points.`;
const pastEndNotice = (offset: number, lastIndex: number) =>
  `offset ${offset} is past the last code point (index ${lastIndex}); pass offset 0 to start from the beginning.`;

function textBlocks(result: CallResult): string[] {
  return result.content.map((block) => {
    if (block.type !== 'text') throw new TypeError(`Expected a text block, got ${block.type}.`);
    return block.text;
  });
}

/** Runs a call expected to succeed; returns its output parsed by the tool's own output schema. */
async function lookup(input: Input) {
  const result = await runToolContract(refUnicodeLookup, input);
  expect(result.isError, textBlocks(result).join('\n')).toBeFalsy();
  return {
    result,
    data: SuccessSchema.parse(result.structuredContent),
    blocks: textBlocks(result),
  };
}

/** Runs a call expected to fail; returns the error envelope and the joined content[] text. */
async function lookupError(input: Input) {
  const result = await runToolContract(refUnicodeLookup, input);
  expect(result.isError).toBe(true);
  return { structured: result.structuredContent, text: textBlocks(result).join('\n') };
}

const markdown = new MarkdownIt('commonmark');
type MarkdownToken = ReturnType<typeof markdown.parse>[number];

/**
 * One inline token as a CommonMark parse reads it back: escapes and entities decoded, a code span
 * as `{code:…}`, a line break as a newline, strong emphasis dropped. Any other inline token appears
 * as `{type:…}`, so an equality check fails on it.
 */
function inlineText(token: MarkdownToken | undefined): string {
  return (token?.children ?? [])
    .map((child) => {
      switch (child.type) {
        case 'text':
          return child.content;
        case 'code_inline':
          return `{code:${child.content}}`;
        case 'softbreak':
        case 'hardbreak':
          return '\n';
        case 'strong_open':
        case 'strong_close':
          return '';
        default:
          return `{${child.type}:${child.content}}`;
      }
    })
    .join('');
}

/** Each heading and paragraph of `text`, read back as {@link inlineText} reads it. */
function rendered(text: string): string[] {
  return markdown
    .parse(text, {})
    .filter((token) => token.type === 'inline')
    .map(inlineText);
}

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');
const indexList = (indices: number[]) =>
  indices.length === 0 ? 'none' : `${indices.length} at index ${indices.join(', ')}`;

describe('refUnicodeLookup — input schema', () => {
  it('defaults by to auto, offset to 0, and limit to 32', () => {
    expect(refUnicodeLookup.input.parse({ query: 'a' })).toEqual({
      query: 'a',
      by: 'auto',
      offset: 0,
      limit: 32,
    });
  });

  it.each<[string, Input, string]>([
    ['an empty query', { query: '' }, 'query'],
    ['4,097 code points', { query: 'a'.repeat(4097) }, 'query'],
    ['4,097 emoji', { query: cp(0x1f600).repeat(4097) }, 'query'],
    ['limit 0', { query: 'a', limit: 0 }, 'limit'],
    ['a negative offset', { query: 'a', offset: -1 }, 'offset'],
    ['a fractional limit', { query: 'a', limit: 1.5 }, 'limit'],
  ])('rejects %s at the schema', async (_label, input, field) => {
    const { structured, text } = await lookupError(input);
    expect(structured).toMatchObject({
      error: {
        code: JsonRpcErrorCode.InvalidParams,
        data: { reason: 'invalid_arguments', issues: [{ path: [field] }] },
      },
    });
    expect(text).toContain(`Invalid arguments for tool ref_unicode_lookup: ${field}:`);
  });

  /** The schema measures the query in code points (Zod 4 string length), not UTF-16 units. */
  it('accepts 4,096 code points, an emoji counting as one', async () => {
    const { data } = await lookup({ query: cp(0x1f600).repeat(4096), limit: 1 });
    expect(data.summary).toMatchObject({ code_point_count: 4096, utf16_length: 8192 });
  });
});

describe('refUnicodeLookup — wiring', () => {
  it('returns the U+200B record on both surfaces, with no notice', async () => {
    const { result, blocks } = await lookup({ query: 'U+200B' });
    expect(result.structuredContent).toEqual({
      interpreted_as: 'code_point',
      unicode_version: '18.0.0',
      summary: {
        code_point_count: 1,
        grapheme_cluster_count: 1,
        utf16_length: 1,
        utf8_length: 3,
        well_formed: true,
        invisible_indices: [0],
        bidi_control_indices: [],
      },
      code_points: [
        {
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
          normalization: { nfc: ['U+200B'], nfd: ['U+200B'], nfkc: ['U+200B'], nfkd: ['U+200B'] },
        },
      ],
      truncated: false,
      next_offset: null,
    });
    expect(blocks).toEqual([
      [
        '# Unicode: 1 code point(s) in 1 grapheme cluster(s)',
        '**Interpreted as:** code_point · **Unicode:** 18.0.0',
        '**UTF-16 length:** 1 · **UTF-8 length:** 3 · **Well-formed:** Yes',
        '**Invisible:** 1 at index 0',
        '**Bidi controls:** none',
        '**Page:** code points 0–0 of 1 · **Truncated:** No · **Next offset:** none (last page)',
        '',
        '## [0] U+200B `\\u{200B}` — ZERO WIDTH SPACE',
        '**Category:** Cf (Format) · **Type:** format · **Block:** General Punctuation · **Script:** Common',
        '**Decimal:** 8203 · **UTF-8:** E2 80 8B · **UTF-16:** 200B · **UTF-16 offset:** 0 · **Cluster:** 0',
        '**Whitespace:** No · **Default-ignorable:** Yes · **Bidi control:** No · **Invisible:** Yes',
        '**NFC:** U+200B · **NFD:** U+200B · **NFKC:** U+200B · **NFKD:** U+200B',
        '**Aliases:** ZWSP (abbreviation)',
      ].join('\n'),
    ]);
  });

  it('reads "8203" in auto mode as four digits and says so on both surfaces', async () => {
    const { data, blocks } = await lookup({ query: '8203' });
    expect(data.interpreted_as).toBe('text');
    expect(data.code_points.map((record) => record.code_point)).toEqual([
      'U+0038',
      'U+0032',
      'U+0030',
      'U+0033',
    ]);
    expect(data.notice).toBe(LITERAL_TEXT_NOTICE);
    const [, trailer, ...rest] = blocks;
    expect(rest).toEqual([]);
    expect(markdown.parse(trailer ?? '', {}).map((token) => token.type)).toContain(
      'blockquote_open',
    );
    expect(rendered(trailer ?? '')).toEqual([LITERAL_TEXT_NOTICE]);
  });

  it('joins the reading notice and both page notices in that order', async () => {
    const { data, blocks } = await lookup({ query: '8203', offset: 4, limit: 500 });
    const notice = `${LITERAL_TEXT_NOTICE} ${clampNotice(500)} ${pastEndNotice(4, 3)}`;
    expect(data.notice).toBe(notice);
    expect(rendered(blocks[1] ?? '')).toEqual([notice]);
  });

  it('projects the list notice on both surfaces while retaining literal records and pagination', async () => {
    const { data, blocks } = await lookup({ query: '65 768', limit: 1, offset: 2 });
    expect(data).toMatchObject({
      interpreted_as: 'text',
      summary: { code_point_count: 6 },
      code_points: [{ index: 2, code_point: 'U+0020' }],
      truncated: true,
      next_offset: 3,
      notice: LITERAL_TEXT_NOTICE,
    });
    expect(blocks[0]).toContain('U+0020');
    expect(rendered(blocks[1] ?? '')).toEqual([LITERAL_TEXT_NOTICE]);
  });

  it.each<[string, Input, string, number | undefined]>([
    [
      'a query holding no tokens',
      { query: '  ,  ', by: 'code_point' },
      'by "code_point" needs at least one token; the query holds only spaces or commas.',
      undefined,
    ],
    [
      'a malformed hex token',
      { query: '&#x200B;', by: 'code_point' },
      'Token 1 (&#x200B;) is not a hexadecimal code point.',
      1,
    ],
    [
      'a U+ token with more than six hex digits, in auto mode',
      { query: 'U+0041 U+0000042' },
      'Token 2 (U+0000042) has 7 hex digits; a code point has at most 6.',
      2,
    ],
    [
      'a malformed decimal token',
      { query: '65 8203.0', by: 'decimal' },
      'Token 2 (8203.0) is not a decimal code point.',
      2,
    ],
    [
      'an out-of-range U+ token, in auto mode',
      { query: 'U+110000' },
      'Token 1 (U+110000) is 1114112, above 1114111 (U+10FFFF), the largest code point.',
      1,
    ],
  ])(
    'fails %s with invalid_code_point and its recovery hint',
    async (_label, input, message, token) => {
      const { structured, text } = await lookupError(input);
      expect(structured).toEqual({
        error: {
          code: JsonRpcErrorCode.ValidationError,
          message,
          data: {
            reason: 'invalid_code_point',
            ...(token === undefined ? {} : { token }),
            recovery: { hint: RECOVERY },
          },
        },
      });
      expect(rendered(text)).toEqual([
        `Error: ${message}`,
        `Recovery: ${RECOVERY}`,
        '(reason invalid_code_point)',
      ]);
    },
  );

  /**
   * A recipe per way to reach invalid_code_point: the failing call's hint, on both surfaces, carries
   * the instruction for the mode it was sent in, and the corrected call that follows it keeps `by`
   * and succeeds.
   */
  it.each<[string, Input, string, Input, string[]]>([
    [
      'by decimal: a malformed token',
      { query: '8203.0', by: 'decimal' },
      DECIMAL_FORM,
      { query: '8203', by: 'decimal' },
      ['U+200B'],
    ],
    [
      'by decimal: a value above 1114111',
      { query: '1114112', by: 'decimal' },
      DECIMAL_FORM,
      { query: '1114111', by: 'decimal' },
      ['U+10FFFF'],
    ],
    [
      'by decimal: no tokens',
      { query: ' , ', by: 'decimal' },
      DECIMAL_FORM,
      { query: '65', by: 'decimal' },
      ['U+0041'],
    ],
    [
      'by code_point: a malformed token',
      { query: '&#x200B;', by: 'code_point' },
      HEX_FORM,
      { query: 'U+200B', by: 'code_point' },
      ['U+200B'],
    ],
    [
      'by code_point: a value above U+10FFFF',
      { query: '110000', by: 'code_point' },
      HEX_FORM,
      { query: 'U+10FFFF', by: 'code_point' },
      ['U+10FFFF'],
    ],
    [
      'by code_point: no tokens',
      { query: '  ,  ', by: 'code_point' },
      HEX_FORM,
      { query: 'U+0041', by: 'code_point' },
      ['U+0041'],
    ],
    [
      'auto: a U+ token with too many digits',
      { query: 'U+0001F600' },
      HEX_FORM,
      { query: 'U+1F600' },
      ['U+1F600'],
    ],
    [
      'auto: a U+ token above U+10FFFF',
      { query: 'U+110000' },
      HEX_FORM,
      { query: 'U+10FFFF' },
      ['U+10FFFF'],
    ],
  ])(
    'the hint for %s, followed with by unchanged, reaches the code point',
    async (_label, failing, form, corrected, codePoints) => {
      const { structured, text } = await lookupError(failing);
      const { hint } = ErrorHintSchema.parse(structured).error.data.recovery;
      expect(hint).toContain(form);
      expect(rendered(text)).toContain(`Recovery: ${hint}`);
      expect(corrected.by).toBe(failing.by);
      const { data } = await lookup(corrected);
      expect(data.code_points.map((record) => record.code_point)).toEqual(codePoints);
    },
  );
});

describe('refUnicodeLookup — paging', () => {
  /** 300 code points with a zero width space at index 150. */
  const LONG = `${'a'.repeat(150)}${cp(0x200b)}${'b'.repeat(149)}`;
  const LONG_SUMMARY = {
    code_point_count: 300,
    grapheme_cluster_count: 300,
    utf16_length: 300,
    utf8_length: 302,
    well_formed: true,
    invisible_indices: [150],
    bidi_control_indices: [],
  };
  const pageLine = (body: string) =>
    rendered(body)[1]
      ?.split('\n')
      .find((line) => line.startsWith('Page:'));
  const indices = (records: CodePointRecord[]) => records.map((record) => record.index);
  const range = (start: number, end: number) =>
    Array.from({ length: end - start }, (_, i) => start + i);

  it('returns the first 32 code points by default, with a continuation', async () => {
    const { data, blocks } = await lookup({ query: LONG });
    expect(indices(data.code_points)).toEqual(range(0, 32));
    expect(data).toMatchObject({ summary: LONG_SUMMARY, truncated: true, next_offset: 32 });
    expect(data.notice).toBeUndefined();
    expect(blocks).toHaveLength(1);
    expect(pageLine(blocks[0] ?? '')).toBe(
      'Page: code points 0–31 of 300 · Truncated: Yes · Next offset: 32',
    );
  });

  it('clamps limit 500 to 128 with a notice on both surfaces', async () => {
    const { data, blocks } = await lookup({ query: LONG, limit: 500 });
    expect(indices(data.code_points)).toEqual(range(0, 128));
    expect(data).toMatchObject({ truncated: true, next_offset: 128, notice: clampNotice(500) });
    expect(rendered(blocks[1] ?? '')).toEqual([clampNotice(500)]);
  });

  it('returns an empty last page for an offset past the end, with a notice', async () => {
    const { data, blocks } = await lookup({ query: LONG, offset: 300 });
    expect(data).toMatchObject({
      summary: LONG_SUMMARY,
      code_points: [],
      truncated: false,
      next_offset: null,
      notice: pastEndNotice(300, 299),
    });
    expect(pageLine(blocks[0] ?? '')).toBe(
      'Page: none (no code points at this offset) · Truncated: No · Next offset: none (last page)',
    );
    expect(rendered(blocks[1] ?? '')).toEqual([pastEndNotice(300, 299)]);
  });

  it('walks next_offset to the end, returning every index once and the same summary', async () => {
    const seen: number[] = [];
    const headers = new Set<string>();
    const offsets: number[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      offsets.push(offset);
      const { data, blocks } = await lookup({ query: LONG, offset, limit: 128 });
      expect(data.summary).toEqual(LONG_SUMMARY);
      const [title = '', header = ''] = rendered(blocks[0] ?? '');
      headers.add(`${title}\n${header.replace(/\nPage:.*$/, '')}`);
      seen.push(...indices(data.code_points));
      offset = data.next_offset;
    }
    expect(offsets).toEqual([0, 128, 256]);
    expect(seen).toEqual(range(0, 300));
    expect(headers.size).toBe(1);
  });
});

describe('refUnicodeLookup — same data on both surfaces', () => {
  const RECORD_FIELDS = [
    'aliases',
    'block',
    'category',
    'category_name',
    'char',
    'cluster_index',
    'code_point',
    'code_point_type',
    'decimal',
    'index',
    'is_bidi_control',
    'is_default_ignorable',
    'is_invisible',
    'is_whitespace',
    'label',
    'name',
    'normalization',
    'script',
    'utf16',
    'utf16_offset',
    'utf8',
  ];
  const SUMMARY_FIELDS = [
    'bidi_control_indices',
    'code_point_count',
    'grapheme_cluster_count',
    'invisible_indices',
    'utf16_length',
    'utf8_length',
    'well_formed',
  ];

  /** The record's heading and paragraph as a CommonMark parse reads them, built from its fields. */
  function recordText(record: CodePointRecord): [string, string] {
    const display = record.char ?? `\\u{${record.code_point.slice(2)}}`;
    const { nfc, nfd, nfkc, nfkd } = record.normalization;
    const aliases = record.aliases.map(({ alias, type }) => `${alias} (${type})`).join(', ');
    return [
      `[${record.index}] ${record.code_point} {code:${display}} — ${record.name ?? record.label}`,
      [
        `Category: ${record.category} (${record.category_name}) · Type: ${record.code_point_type} · Block: ${record.block ?? 'none (No_Block)'} · Script: ${record.script}`,
        `Decimal: ${record.decimal} · UTF-8: ${record.utf8 ?? 'not encodable (surrogate)'} · UTF-16: ${record.utf16} · UTF-16 offset: ${record.utf16_offset} · Cluster: ${record.cluster_index}`,
        `Whitespace: ${yesNo(record.is_whitespace)} · Default-ignorable: ${yesNo(record.is_default_ignorable)} · Bidi control: ${yesNo(record.is_bidi_control)} · Invisible: ${yesNo(record.is_invisible)}`,
        `NFC: ${nfc.join(' ')} · NFD: ${nfd.join(' ')} · NFKC: ${nfkc.join(' ')} · NFKD: ${nfkd.join(' ')}`,
        `Aliases: ${aliases === '' ? 'none' : aliases}`,
      ].join('\n'),
    ];
  }

  /** The summary title and header paragraph as a CommonMark parse reads them. */
  function headerText(data: Success): [string, string] {
    const { summary, code_points: records } = data;
    const first = records[0];
    const last = records.at(-1);
    const page =
      first && last
        ? `code points ${first.index}–${last.index} of ${summary.code_point_count}`
        : 'none (no code points at this offset)';
    return [
      `Unicode: ${summary.code_point_count} code point(s) in ${summary.grapheme_cluster_count} grapheme cluster(s)`,
      [
        `Interpreted as: ${data.interpreted_as} · Unicode: ${data.unicode_version}`,
        `UTF-16 length: ${summary.utf16_length} · UTF-8 length: ${summary.utf8_length ?? 'not encodable (contains surrogates)'} · Well-formed: ${yesNo(summary.well_formed)}`,
        `Invisible: ${indexList(summary.invisible_indices)}`,
        `Bidi controls: ${indexList(summary.bidi_control_indices)}`,
        `Page: ${page} · Truncated: ${yesNo(data.truncated)} · Next offset: ${data.next_offset ?? 'none (last page)'}`,
      ].join('\n'),
    ];
  }

  it.each([
    ['the whole input', 3, false, null],
    ['a truncated page', 2, true, 2],
  ] as const)(
    'renders every structured field of a graphic, a hidden, and a surrogate record — %s',
    async (_label, limit, truncated, nextOffset) => {
      const { data, blocks } = await lookup({ query: 'U+00E9 U+202E U+D800', limit });
      expect(data.code_points.map((record) => [record.code_point, record.code_point_type])).toEqual(
        [
          ['U+00E9', 'graphic'],
          ['U+202E', 'format'],
          ['U+D800', 'surrogate'],
        ].slice(0, limit),
      );
      expect(data).toMatchObject({ truncated, next_offset: nextOffset });
      expect(Object.keys(data.summary).sort()).toEqual(SUMMARY_FIELDS);
      for (const record of data.code_points) {
        expect(Object.keys(record).sort()).toEqual(RECORD_FIELDS);
      }
      expect(blocks).toHaveLength(1);
      expect(rendered(blocks[0] ?? '')).toEqual([
        ...headerText(data),
        ...data.code_points.flatMap(recordText),
      ]);
    },
  );
});

describe('refUnicodeLookup — CommonMark', () => {
  it('reads every record heading back exactly, labels and Markdown-active glyphs included', async () => {
    const { blocks } = await lookup({
      query: 'U+0000 U+0060 U+0023 U+002A U+005F U+007C U+003C U+0026 U+05D0',
    });
    const tokens = markdown.parse(blocks[0] ?? '', {});
    const headings = tokens.flatMap((token, i) =>
      token.type === 'heading_open' && token.tag === 'h2' ? [inlineText(tokens[i + 1])] : [],
    );
    expect(headings).toEqual([
      '[0] U+0000 {code:\\u{0000}} — <control-0000>',
      '[1] U+0060 {code:`} — GRAVE ACCENT',
      '[2] U+0023 {code:#} — NUMBER SIGN',
      '[3] U+002A {code:*} — ASTERISK',
      '[4] U+005F {code:_} — LOW LINE',
      '[5] U+007C {code:|} — VERTICAL LINE',
      '[6] U+003C {code:<} — LESS-THAN SIGN',
      '[7] U+0026 {code:&} — AMPERSAND',
      `[8] U+05D0 {code:${cp(0x5d0)}} — HEBREW LETTER ALEF`,
    ]);
  });
});

describe('refUnicodeLookup — display safety', () => {
  /**
   * Every character class the tool must never return raw: controls, format and bidi characters,
   * separators, spaces, combining marks, private use, unassigned, surrogates, and default-ignorables.
   * Read from the runtime's own Unicode tables, independently of the bundled ones.
   */
  const UNSAFE = /[\p{C}\p{Z}\p{M}\p{Default_Ignorable_Code_Point}]/u;

  /** Unsafe characters in `text`, as U+ notation; SPACE and any `allowed` character excepted. */
  function unsafeIn(text: string, allowed: readonly string[] = []): string[] {
    const found: string[] = [];
    for (const char of text) {
      if (char === ' ' || allowed.includes(char) || !UNSAFE.test(char)) continue;
      found.push(`U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`);
    }
    return found;
  }

  /** Every string inside a structured value, keys included. */
  function stringsIn(value: unknown): string[] {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.flatMap(stringsIn);
    if (value !== null && typeof value === 'object') {
      return Object.entries(value).flatMap(([key, entry]) => [key, ...stringsIn(entry)]);
    }
    return [];
  }

  function expectNothingUnsafe(result: CallResult) {
    // LF separates the lines of the Markdown text; nothing else unsafe may appear.
    expect(unsafeIn(textBlocks(result).join('\n'), ['\n'])).toEqual([]);
    expect(stringsIn(result.structuredContent).flatMap((text) => unsafeIn(text))).toEqual([]);
    expect(unsafeIn(JSON.stringify(result.structuredContent))).toEqual([]);
  }

  const HIDDEN = [
    0x0000, 0x0009, 0x000a, 0x000d, 0x00a0, 0x00ad, 0x0301, 0x0378, 0x180e, 0x200b, 0x200d, 0x2028,
    0x2029, 0x202e, 0x2060, 0x3000, 0x3164, 0xe000, 0xfe0f, 0xfeff, 0xfffe, 0xe0061,
  ];
  const notation = (codePoint: number) =>
    `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;

  it.each<[string, Input]>([
    [
      'literal text, lone surrogates included',
      {
        // Low before high, so neither pairs: two lone surrogates, then the emoji's own pair.
        query: `A${cp(...HIDDEN)}${String.fromCharCode(0xdc00)}${String.fromCharCode(0xd800)}${cp(0x1f600)}`,
        by: 'text',
        limit: 128,
      },
    ],
    [
      'code point notation, surrogates included',
      { query: [...HIDDEN, 0xd800, 0xdc00].map(notation).join(' '), limit: 128 },
    ],
  ])('returns no unsafe character raw for %s', async (_label, input) => {
    const { result, data } = await lookup(input);
    expect(data.code_points.length).toBeGreaterThan(HIDDEN.length);
    expectNothingUnsafe(result);
    for (const record of data.code_points) {
      expect(
        record.char === null || unsafeIn(record.char).length === 0,
        `${record.code_point} char`,
      ).toBe(true);
    }
  });

  it('shows the display-safe characters as themselves', async () => {
    const { data } = await lookup({ query: `A${cp(0xe9, 0x4e00, 0x1f600)}`, by: 'text' });
    expect(data.code_points.map((record) => record.char)).toEqual([
      'A',
      cp(0xe9),
      cp(0x4e00),
      cp(0x1f600),
    ]);
  });

  it.each<[string, Input]>([
    ['a bidi override inside a U+ token', { query: `U+${cp(0x202e)}41`, by: 'code_point' }],
    ['a zero width space inside a decimal token', { query: `8${cp(0x200b)}203`, by: 'decimal' }],
    ['a no-break space as a token', { query: `U+0041 ${cp(0xa0)}`, by: 'code_point' }],
    [
      'a lone surrogate inside a token',
      { query: `U+${String.fromCharCode(0xd800)}`, by: 'code_point' },
    ],
    ['a combining mark inside a token', { query: `4${cp(0x301)}1`, by: 'code_point' }],
  ])('keeps the error message free of unsafe characters for %s', async (_label, input) => {
    const result = await runToolContract(refUnicodeLookup, input);
    expect(result.isError).toBe(true);
    expectNothingUnsafe(result);
    expect(
      rendered(textBlocks(result).join('\n')).flatMap((text) => unsafeIn(text, ['\n'])),
    ).toEqual([]);
  });

  it.each([
    ['&#x200B;', 'Token 1 (&#x200B;) is not a hexadecimal code point.'],
    ['&#8203;', 'Token 1 (&#8203;) is not a hexadecimal code point.'],
  ])(
    'keeps the character reference %s literal when the error text is parsed',
    async (query, message) => {
      const result = await runToolContract(refUnicodeLookup, { query, by: 'code_point' });
      expect(result.isError).toBe(true);
      const [error] = rendered(textBlocks(result).join('\n'));
      expect(error).toBe(`Error: ${message}`);
      expect(error).not.toContain(cp(0x200b));
    },
  );
});
