/**
 * @fileoverview Tool for identifying the code points in a string, or looking up code points by
 * U+XXXX or decimal notation, from the bundled Unicode Character Database.
 * @module mcp-server/tools/definitions/ref-unicode-lookup
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { escapeMarkdownInline } from '@cyanheads/mcp-ts-core/utils';
import { charDisplay } from '@/services/unicode/display-escape.js';
import { CODE_POINT_TYPES, LOOKUP_MODES } from '@/services/unicode/types.js';
import { getUnicodeService, parseQuery } from '@/services/unicode/unicode-service.js';
import { UNICODE_VERSION } from '@/services/unicode/unicode-tables.js';

const AliasSchema = z
  .object({
    alias: z.string().describe('The alias as NameAliases.txt writes it.'),
    type: z
      .enum(['correction', 'control', 'alternate', 'figment', 'abbreviation'])
      .describe(
        'Alias type: correction (a corrected name), control (a control function name), alternate, figment (documented but never in actual use), or abbreviation.',
      ),
  })
  .describe('A formal name alias.');

const NormalizationSchema = z
  .object({
    nfc: z
      .array(z.string().describe('A code point as U+XXXX.'))
      .describe('NFC (canonical composition) of this code point alone.'),
    nfd: z
      .array(z.string().describe('A code point as U+XXXX.'))
      .describe('NFD (canonical decomposition) of this code point alone.'),
    nfkc: z
      .array(z.string().describe('A code point as U+XXXX.'))
      .describe('NFKC (compatibility composition) of this code point alone.'),
    nfkd: z
      .array(z.string().describe('A code point as U+XXXX.'))
      .describe('NFKD (compatibility decomposition) of this code point alone.'),
  })
  .describe(
    'The four normalization forms of this code point, never empty; a form that leaves it unchanged repeats it.',
  );

const CodePointRecordSchema = z
  .object({
    index: z.number().int().describe('Position among the code points of the input, from 0.'),
    utf16_offset: z
      .number()
      .int()
      .describe(
        'UTF-16 code unit offset of this code point in the string the code points spell (JavaScript and LSP positions).',
      ),
    cluster_index: z
      .number()
      .int()
      .describe(
        'Grapheme cluster this code point belongs to, from 0; code points sharing it form one user-perceived character.',
      ),
    code_point: z
      .string()
      .describe('U+ followed by uppercase hex, at least 4 digits (U+200B, U+1F600).'),
    char: z
      .string()
      .nullable()
      .describe(
        'The character itself when it displays safely; null for control, format, bidi-control, separator, combining, space, default-ignorable, private-use, surrogate, noncharacter, and reserved code points.',
      ),
    decimal: z.number().int().describe('The code point value as a decimal number.'),
    name: z
      .string()
      .nullable()
      .describe(
        'Unicode Name property; null for control, private-use, surrogate, noncharacter, and reserved code points, which have none.',
      ),
    label: z
      .string()
      .nullable()
      .describe(
        'Code point label such as <control-0009> or <reserved-0378>; present exactly when name is null.',
      ),
    aliases: z
      .array(AliasSchema)
      .describe('Formal name aliases in NameAliases.txt order; empty when there are none.'),
    category: z.string().describe('General_Category short alias, such as Cf.'),
    category_name: z.string().describe('General_Category long name, such as Format.'),
    code_point_type: z
      .enum(CODE_POINT_TYPES)
      .describe(
        'Unicode basic type: graphic, format (Cf, Zl, Zp), control (Cc), private_use, surrogate, noncharacter, or reserved (any other unassigned code point).',
      ),
    block: z.string().nullable().describe('Unicode block name; null outside every block.'),
    script: z
      .string()
      .describe(
        'Script property value, such as Latin or Old_Italic; Unknown for unassigned, private-use, and surrogate code points.',
      ),
    is_whitespace: z.boolean().describe('White_Space property.'),
    is_default_ignorable: z
      .boolean()
      .describe(
        'Default_Ignorable_Code_Point property: renders as nothing when a font does not support it.',
      ),
    is_bidi_control: z
      .boolean()
      .describe('Bidi_Control property: an explicit bidirectional formatting character.'),
    is_invisible: z
      .boolean()
      .describe(
        'True for default-ignorable, whitespace, and control code points other than TAB, LF, CR, and SPACE.',
      ),
    utf8: z
      .string()
      .nullable()
      .describe(
        'UTF-8 bytes as uppercase hex separated by spaces (E2 80 8B); null for a surrogate, which UTF-8 cannot encode.',
      ),
    utf16: z
      .string()
      .describe('UTF-16 code units as 4-digit uppercase hex separated by a space (D83D DE00).'),
    normalization: NormalizationSchema,
  })
  .describe('One code point of the input.');

const SummarySchema = z
  .object({
    code_point_count: z.number().int().describe('Code points in the whole input.'),
    grapheme_cluster_count: z
      .number()
      .int()
      .describe('Extended grapheme clusters (user-perceived characters) in the whole input.'),
    utf16_length: z
      .number()
      .int()
      .describe('UTF-16 code units the whole input takes (a surrogate counts as 1).'),
    utf8_length: z
      .number()
      .int()
      .nullable()
      .describe('UTF-8 bytes the whole input takes; null when it holds a surrogate.'),
    well_formed: z.boolean().describe('False when the input holds a surrogate code point.'),
    invisible_indices: z
      .array(z.number().int().describe('Index of an invisible code point.'))
      .describe('Index of every invisible code point in the whole input, ascending.'),
    bidi_control_indices: z
      .array(z.number().int().describe('Index of a bidi-control code point.'))
      .describe('Index of every bidi-control code point in the whole input, ascending.'),
  })
  .describe('Facts about the whole input, not only this page.');

const yesNo = (value: boolean) => (value ? 'Yes' : 'No');

const indexList = (indices: number[]) =>
  indices.length === 0 ? 'none' : `${indices.length} at index ${indices.join(', ')}`;

function recordLines(record: z.infer<typeof CodePointRecordSchema>): string[] {
  const title = [record.name, record.label]
    .filter((text): text is string => text !== null)
    .map(escapeMarkdownInline)
    .join(' ');
  const { nfc, nfd, nfkc, nfkd } = record.normalization;
  const aliases = record.aliases
    .map(({ alias, type }) => `${escapeMarkdownInline(alias)} (${type})`)
    .join(', ');
  return [
    `## [${record.index}] ${record.code_point} ${charDisplay(record.char, record.decimal)} — ${title}`,
    `**Category:** ${escapeMarkdownInline(record.category)} (${escapeMarkdownInline(record.category_name)}) · **Type:** ${record.code_point_type} · **Block:** ${record.block === null ? 'none (No_Block)' : escapeMarkdownInline(record.block)} · **Script:** ${escapeMarkdownInline(record.script)}`,
    `**Decimal:** ${record.decimal} · **UTF-8:** ${record.utf8 ?? 'not encodable (surrogate)'} · **UTF-16:** ${record.utf16} · **UTF-16 offset:** ${record.utf16_offset} · **Cluster:** ${record.cluster_index}`,
    `**Whitespace:** ${yesNo(record.is_whitespace)} · **Default-ignorable:** ${yesNo(record.is_default_ignorable)} · **Bidi control:** ${yesNo(record.is_bidi_control)} · **Invisible:** ${yesNo(record.is_invisible)}`,
    `**NFC:** ${nfc.join(' ')} · **NFD:** ${nfd.join(' ')} · **NFKC:** ${nfkc.join(' ')} · **NFKD:** ${nfkd.join(' ')}`,
    `**Aliases:** ${aliases === '' ? 'none' : aliases}`,
  ];
}

export const refUnicodeLookup = tool('ref_unicode_lookup', {
  title: 'Unicode Character Lookup',
  description: `Identify every code point in a string, or look up code points written as U+XXXX or as decimal numbers. Each code point returns its Unicode name (or code point label and aliases), general category, code point type, block, script, whitespace, default-ignorable, bidi-control, and invisible flags, UTF-8 and UTF-16 encodings, its NFC/NFD/NFKC/NFKD forms, and the grapheme cluster it belongs to. The summary covers the whole input and lists the index of every invisible and bidi-control code point. Use it to find zero-width spaces, non-breaking spaces, bidi overrides, and other hidden characters, or to see how an emoji sequence or a combining mark is built; pass by "text" for any text you did not write yourself. Data is the Unicode Character Database ${UNICODE_VERSION}, bundled. In the text output, characters that would not display safely appear as \\u{XXXX} escapes.`,
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    query: z
      .string()
      .min(1)
      .max(4096)
      .describe(
        'Text to inspect, or code points to look up. In auto mode a query made only of U+ tokens ("U+200B", "U+0041 U+030A") is read as code points; anything else is inspected code point by code point, whitespace included. At most 4,096 code points; a character above U+FFFF, such as an emoji, counts as one.',
      ),
    by: z
      .enum(LOOKUP_MODES)
      .default('auto')
      .describe(
        'How to read query. auto: code point notation when every token is U+ followed by hex digits, otherwise literal text. text: inspect every code point of query as written; pass it for any text you did not write yourself, since auto reads text made only of U+ tokens as the code points they name. code_point: tokens of 1-6 hex digits, optionally written U+XXXX, 0xXXXX, or \\u{XXXX}, separated by spaces or commas. decimal: tokens of decimal digits from 0 to 1114111, separated by spaces or commas.',
      ),
    offset: z
      .number()
      .int()
      .min(0)
      .default(0)
      .describe(
        'Index of the first code point to return, counting from 0. Pass next_offset from the previous response to continue.',
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .default(32)
      .describe(
        'Code points to return on this page (default 32, at most 128; a larger value returns 128 with a notice). The summary always describes the whole input.',
      ),
  }),

  output: z.object({
    interpreted_as: z
      .enum(['text', 'code_point', 'decimal'])
      .describe('How query was read: literal text, code point notation, or decimal numbers.'),
    unicode_version: z
      .string()
      .describe('Version of the bundled Unicode Character Database the data comes from.'),
    summary: SummarySchema,
    code_points: z
      .array(CodePointRecordSchema)
      .describe('The code points on this page, in input order.'),
    truncated: z.boolean().describe('True when code points remain after this page.'),
    next_offset: z
      .number()
      .int()
      .nullable()
      .describe('Pass as offset to continue; null on the last page.'),
  }),

  enrichment: {
    notice: z
      .string()
      .optional()
      .describe(
        'How the reading or the page differs from what was asked: a query that looks like a code point number read as text, a limit clamped to 128, or an offset past the end.',
      ),
  },

  enrichmentTrailer: {
    notice: {
      render: (notice) => (notice === undefined ? '' : `> ${escapeMarkdownInline(notice)}`),
    },
  },

  errors: [
    {
      reason: 'invalid_code_point',
      code: JsonRpcErrorCode.ValidationError,
      when: 'A code point or decimal token is malformed, the query holds no tokens, or a value is above U+10FFFF.',
      recovery:
        'With by "decimal", write each code point as decimal digits from 0 to 1114111; otherwise write it as U+ followed by 1 to 6 hex digits, from U+0000 to U+10FFFF. Separate code points with spaces or commas, or pass by "text" to inspect the characters as written.',
      thrownBy: 'service',
      severity: 'notice',
    },
  ],

  handler(input, ctx) {
    const parsed = parseQuery(input.query, input.by);
    const inspected = getUnicodeService().inspect(parsed.codePoints, input.offset, input.limit);
    const notices = [...parsed.notices, ...inspected.notices];
    if (notices.length > 0) ctx.enrich.notice(notices.join(' '));
    return {
      interpreted_as: parsed.interpretedAs,
      unicode_version: UNICODE_VERSION,
      summary: inspected.summary,
      code_points: inspected.codePoints,
      truncated: inspected.truncated,
      next_offset: inspected.nextOffset,
    };
  },

  format: (result) => {
    const { summary, code_points: records } = result;
    const first = records[0];
    const last = records.at(-1);
    const page =
      first && last
        ? `code points ${first.index}–${last.index} of ${summary.code_point_count}`
        : 'none (no code points at this offset)';
    const lines = [
      `# Unicode: ${summary.code_point_count} code point(s) in ${summary.grapheme_cluster_count} grapheme cluster(s)`,
      `**Interpreted as:** ${result.interpreted_as} · **Unicode:** ${escapeMarkdownInline(result.unicode_version)}`,
      `**UTF-16 length:** ${summary.utf16_length} · **UTF-8 length:** ${summary.utf8_length ?? 'not encodable (contains surrogates)'} · **Well-formed:** ${yesNo(summary.well_formed)}`,
      `**Invisible:** ${indexList(summary.invisible_indices)}`,
      `**Bidi controls:** ${indexList(summary.bidi_control_indices)}`,
      `**Page:** ${page} · **Truncated:** ${yesNo(result.truncated)} · **Next offset:** ${result.next_offset ?? 'none (last page)'}`,
    ];
    for (const record of records) lines.push('', ...recordLines(record));
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
