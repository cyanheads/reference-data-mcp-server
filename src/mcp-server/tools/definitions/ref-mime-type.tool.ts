/**
 * @fileoverview Tool for looking up a MIME type by type string or file extension.
 * @module mcp-server/tools/definitions/ref-mime-type
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getMimeService } from '@/services/mime/mime-service.js';

const AlternativeSchema = z.object({
  type: z.string().describe('Alternative MIME type.'),
  source: z.string().nullable().describe('Data source for this type (e.g., "iana", "apache").'),
});

export const refMimeType = tool('ref_mime_type', {
  title: 'MIME Type Lookup',
  description:
    'Look up a MIME type by type string or file extension. Accepts "image/webp", ".webp", or "webp". Returns the canonical MIME type, known file extensions, whether the type is compressible (relevant for Content-Encoding decisions), and the data source (iana, apache, nginx). For extension lookups, returns the canonical MIME type — e.g., ".jpg" resolves to "image/jpeg". When multiple types map to an extension, the canonical type is returned first with alternatives listed.',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    query: z
      .string()
      .describe(
        'MIME type string (e.g., "application/json", "image/webp") or file extension with or without leading dot (e.g., ".webp", "webp", "js", ".html").',
      ),
  }),

  output: z.object({
    type: z.string().describe('Canonical MIME type string (e.g., "image/jpeg").'),
    extensions: z
      .array(z.string())
      .describe('Known file extensions for this MIME type, without leading dots.'),
    compressible: z
      .boolean()
      .nullable()
      .describe(
        'True when this type is compressible (e.g., text and JSON types); false when not; null when unknown.',
      ),
    source: z
      .string()
      .nullable()
      .describe('Data source: "iana" (IANA registry), "apache", "nginx", or null.'),
    alternatives: z
      .array(AlternativeSchema.describe('An alternative MIME type mapping to the same extension.'))
      .optional()
      .describe(
        'Other MIME types that also map to the queried extension, when multiple types share the extension.',
      ),
  }),

  errors: [
    {
      reason: 'no_match',
      code: JsonRpcErrorCode.NotFound,
      when: 'The MIME type or file extension is not recognized.',
      recovery:
        'Check spelling or use the full IANA type string (e.g., "application/octet-stream", "text/html"). Common extensions: js, ts, json, html, css, png, jpg, pdf.',
    },
  ],

  handler(input, ctx) {
    if (!input.query.trim()) {
      throw ctx.fail(
        'no_match',
        'Empty query. Provide a MIME type string (e.g., "image/webp") or file extension (e.g., ".webp").',
        ctx.recoveryFor('no_match'),
      );
    }
    const result = getMimeService().lookup(input.query, ctx);
    if (!result) {
      const normalized = input.query.startsWith('.') ? input.query.slice(1) : input.query;
      const msg = normalized.includes('/')
        ? `MIME type "${input.query}" not found. Check spelling or use the full IANA type string (e.g., "application/json").`
        : `No MIME type found for extension "${input.query}". Check spelling or use the full IANA type string (e.g., "image/jpeg"). Common extensions: js, ts, json, html, css, png, jpg, pdf.`;
      throw ctx.fail('no_match', msg, ctx.recoveryFor('no_match'));
    }
    return result;
  },

  format: (result) => {
    const compStr =
      result.compressible === true ? 'Yes' : result.compressible === false ? 'No' : 'Unknown';
    const lines = [
      `**Type:** ${result.type}`,
      `**Extensions:** ${result.extensions.length > 0 ? result.extensions.map((e) => `.${e}`).join(', ') : 'N/A'}`,
      `**Compressible:** ${compStr}`,
      `**Source:** ${result.source ?? 'Unknown'}`,
    ];
    if (result.alternatives && result.alternatives.length > 0) {
      lines.push('', '**Alternative types for this extension:**');
      for (const alt of result.alternatives) {
        lines.push(`- ${alt.type}${alt.source ? ` (${alt.source})` : ''}`);
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
