/**
 * @fileoverview Tool for converting a local datetime from one timezone to another.
 * @module mcp-server/tools/definitions/ref-timezone-convert
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { timezoneRecovery } from '@/services/timezone/timezone-resolver.js';
import { getTimezoneService } from '@/services/timezone/timezone-service.js';
import { escapeCallerText } from '@/services/unicode/display-escape.js';

export const refTimezoneConvert = tool('ref_timezone_convert', {
  title: 'Timezone Conversion',
  description:
    'Convert a local datetime from one timezone to another. Takes a local time string (no UTC offset, e.g., "2026-05-24T15:30:00") interpreted as local time in the source timezone, returns the equivalent local time in the target timezone. Shows both UTC offsets so DST transitions are visible. Accepts full IANA IDs (e.g., "Asia/Tokyo") or unambiguous city names (e.g., "Tokyo").',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    datetime: z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/,
        'Datetime must be ISO 8601 local time without an offset, e.g. "2026-05-24T15:30:00".',
      )
      .describe(
        'Local datetime in ISO 8601 format without timezone offset (e.g., "2026-05-24T15:30:00"). Do not include "Z" or an offset suffix.',
      ),
    from_tz: z
      .string()
      .describe(
        'Source IANA timezone ID or unambiguous city name (e.g., "Asia/Tokyo" or "Tokyo").',
      ),
    to_tz: z
      .string()
      .describe(
        'Target IANA timezone ID or unambiguous city name (e.g., "America/New_York" or "New York").',
      ),
  }),

  output: z.object({
    source: z
      .object({
        datetime: z
          .string()
          .describe('Input local datetime echoed back (e.g., "2026-05-24T15:30:00").'),
        tz: z.string().describe('Resolved source IANA timezone ID.'),
        offset: z.string().describe('UTC offset at the source datetime (e.g., "+09:00").'),
      })
      .describe('Source datetime details.'),
    target: z
      .object({
        datetime: z.string().describe('Equivalent local datetime in the target timezone.'),
        tz: z.string().describe('Resolved target IANA timezone ID.'),
        offset: z.string().describe('UTC offset in the target timezone at the converted moment.'),
      })
      .describe('Target datetime details.'),
    utc_equivalent: z
      .string()
      .describe('The UTC equivalent of the input datetime (ISO 8601 with Z suffix).'),
  }),

  errors: [
    {
      reason: 'invalid_timezone',
      severity: 'notice',
      code: JsonRpcErrorCode.ValidationError,
      when: 'Source or target timezone ID is unrecognized or matches multiple zones.',
      recovery: 'Use ref_timezone_lookup to find the correct IANA ID for the desired location.',
    },
    {
      reason: 'invalid_datetime',
      severity: 'notice',
      code: JsonRpcErrorCode.ValidationError,
      when: 'Datetime has out-of-range calendar components (e.g. month 13, February 30) or falls in a daylight-saving spring-forward gap that never occurs in the source timezone. (Malformed format is rejected by the input schema.)',
      recovery:
        'Use a real calendar date and 24-hour time; if the moment is during a spring-forward transition, choose a time outside the skipped hour.',
    },
  ],

  handler(input, ctx) {
    // Datetime *format* is enforced by the input schema's regex. The handler validates
    // semantic convertibility: timezones first, then calendar range + DST-gap.
    const svc = getTimezoneService();
    const resolveOperand = (query: string, side: 'source' | 'target'): string => {
      const candidates = svc.conversionCandidates(query);
      const [id] = candidates;
      if (candidates.length > 1) {
        throw ctx.fail(
          'invalid_timezone',
          `Ambiguous ${side} timezone "${escapeCallerText(query)}".`,
          {
            candidates,
            recovery: { hint: `Use an exact IANA ID from: ${candidates.join(', ')}.` },
          },
        );
      }
      if (id !== undefined) return id;
      const hint = timezoneRecovery(query);
      const message = `Unrecognized ${side} timezone "${escapeCallerText(query)}".`;
      throw ctx.fail(
        'invalid_timezone',
        hint ? message : `${message} Use ref_timezone_lookup to find the correct IANA ID.`,
        hint ? { recovery: { hint } } : undefined,
      );
    };
    const resolvedFrom = resolveOperand(input.from_tz, 'source');
    const resolvedTo = resolveOperand(input.to_tz, 'target');
    // Reject out-of-range wall-clock dates (e.g. Feb 30) and DST spring-forward gaps against
    // the now-validated source zone, rather than letting convert() silently normalize them.
    const dtIssue = svc.validateConvertibleDatetime(input.datetime, resolvedFrom);
    if (dtIssue) {
      throw ctx.fail('invalid_datetime', dtIssue.message, { recovery: { hint: dtIssue.hint } });
    }
    return svc.convert(input.datetime, resolvedFrom, resolvedTo, ctx);
  },

  format: (result) => {
    const lines = [
      `**Source:** ${result.source.datetime} (${result.source.tz}, UTC${result.source.offset})`,
      `**Target:** ${result.target.datetime} (${result.target.tz}, UTC${result.target.offset})`,
      `**UTC equivalent:** ${result.utc_equivalent}`,
    ];
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
