/**
 * @fileoverview Tool for looking up an HTTP status code by number or description keyword.
 * @module mcp-server/tools/definitions/ref-http-status
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getHttpStatusService } from '@/services/http-status/http-status-service.js';

const AlternativeSchema = z.object({
  code: z.number().int().describe('HTTP status code.'),
  reason_phrase: z.string().describe('Reason phrase.'),
  category: z.string().describe('Status code category.'),
});

export const refHttpStatus = tool('ref_http_status', {
  title: 'HTTP Status Code Lookup',
  description:
    'Look up an HTTP status code by number or keyword. Returns the reason phrase, description, category (1xx Informational, 2xx Success, 3xx Redirection, 4xx Client Error, 5xx Server Error), whether the code is cacheable by default, and the defining RFC with section reference. For keyword queries, returns the closest match plus alternatives.',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    query: z
      .string()
      .describe(
        'Numeric status code (e.g., "404" or "422") or descriptive keyword (e.g., "not found", "too many requests", "unprocessable").',
      ),
  }),

  output: z.object({
    code: z.number().int().describe('HTTP status code number.'),
    reason_phrase: z.string().describe('IANA reason phrase (e.g., "Not Found").'),
    description: z
      .string()
      .describe('Human-readable description of when and why this status is used.'),
    category: z
      .string()
      .describe(
        'Status code category (1xx Informational, 2xx Success, 3xx Redirection, 4xx Client Error, 5xx Server Error).',
      ),
    cacheable: z
      .boolean()
      .describe('Whether this status code is cacheable by default per RFC 9110.'),
    rfc: z.string().describe('Defining RFC (e.g., "RFC 9110").'),
    rfc_section: z
      .string()
      .nullable()
      .describe('RFC section number (e.g., "15.5.5"), or null if not applicable.'),
    alternatives: z
      .array(AlternativeSchema.describe('An alternative HTTP status code that also matched.'))
      .optional()
      .describe(
        'Other status codes that matched the keyword query. Present only for keyword searches with multiple matches.',
      ),
  }),

  errors: [
    {
      reason: 'no_match',
      code: JsonRpcErrorCode.NotFound,
      when: 'No HTTP status code matched the query.',
      recovery:
        'Use the numeric code directly (e.g., "404"), or try broader keywords like "not found", "server error", or "redirect".',
    },
  ],

  handler(input, ctx) {
    if (!input.query.trim()) {
      throw ctx.fail(
        'no_match',
        'Empty query. Provide a numeric code (e.g., "404") or a keyword (e.g., "not found").',
        ctx.recoveryFor('no_match'),
      );
    }
    const result = getHttpStatusService().lookup(input.query, ctx);
    if (!result) {
      const isIntegerQuery = /^\d+$/.test(input.query.trim());
      const msg = isIntegerQuery
        ? `HTTP status code ${input.query.trim()} is not a registered IANA code. Use the numeric code directly or search with a keyword.`
        : `No HTTP status code matched "${input.query}". Try the numeric code directly (e.g., "404"), or keywords like "not found", "unauthorized", "too many requests".`;
      throw ctx.fail('no_match', msg, ctx.recoveryFor('no_match'));
    }
    return result;
  },

  format: (result) => {
    const lines = [
      `# ${result.code} ${result.reason_phrase}`,
      `**Category:** ${result.category}`,
      `**Cacheable:** ${result.cacheable ? 'Yes' : 'No'}`,
      `**RFC:** ${result.rfc}${result.rfc_section ? ` §${result.rfc_section}` : ''}`,
      '',
      result.description,
    ];
    if (result.alternatives && result.alternatives.length > 0) {
      lines.push('', '**Other matches:**');
      for (const alt of result.alternatives) {
        lines.push(`- ${alt.code} ${alt.reason_phrase} (${alt.category})`);
      }
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
