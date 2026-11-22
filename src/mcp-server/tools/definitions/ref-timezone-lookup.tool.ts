/**
 * @fileoverview Tool for looking up timezone info by IANA ID, country code, or complete location name.
 * @module mcp-server/tools/definitions/ref-timezone-lookup
 */

import { tool, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { timezoneRecovery } from '@/services/timezone/timezone-resolver.js';
import { getTimezoneService } from '@/services/timezone/timezone-service.js';
import { escapeCallerText } from '@/services/unicode/display-escape.js';

const TimezoneRecordSchema = z.object({
  iana_id: z.string().describe('IANA timezone identifier (e.g., "America/New_York").'),
  current_offset_hours: z
    .number()
    .describe('Current UTC offset in hours (e.g., -5.0 for UTC-05:00).'),
  standard_offset_hours: z.number().describe('Standard (non-DST) UTC offset in hours.'),
  dst_active: z.boolean().describe('Whether daylight saving time is currently active.'),
  dst_abbreviation: z
    .string()
    .nullable()
    .describe(
      'DST timezone abbreviation (e.g., "EDT"), or null when DST not active or timezone has no DST.',
    ),
  standard_abbreviation: z
    .string()
    .nullable()
    .describe('Standard timezone abbreviation (e.g., "EST").'),
  major_cities: z.array(z.string()).describe('Major cities in this timezone.'),
  countries: z.array(z.string()).describe('ISO alpha-2 country codes observing this timezone.'),
});

export const refTimezoneLookup = tool('ref_timezone_lookup', {
  title: 'Timezone Lookup',
  description:
    'Get timezone offset, DST status, and major cities by IANA ID, ISO alpha-2 country code, or complete city or IANA location name. Returns all matching zones for a country code or an ambiguous city name. "Tokyo" resolves to "Asia/Tokyo", "New York" resolves to "America/New_York".',
  annotations: { readOnlyHint: true, openWorldHint: false },

  input: z.object({
    query: z
      .string()
      .describe(
        'IANA timezone ID (e.g., "America/New_York"), ISO alpha-2 country code (e.g., "US"), or a complete city or IANA location name (e.g., "Tokyo", "New York", "St Lucia").',
      ),
    by: z
      .enum(['iana', 'country', 'auto'])
      .default('auto')
      .describe(
        'Lookup mode: auto tries a two-letter country code first, then IANA ID, city, and location-name matching; iana runs that matching without the country-code step; country matches an ISO alpha-2 code only.',
      ),
    at: z
      .string()
      .optional()
      .describe(
        'ISO 8601 datetime to evaluate timezone state at a specific moment (e.g., "2026-01-15T12:00:00"). Defaults to current time.',
      ),
  }),

  output: z.object({
    timezones: z
      .array(TimezoneRecordSchema.describe('Timezone record with offset and DST info.'))
      .describe(
        'Matching timezone records. Country codes and ambiguous names can return multiple records.',
      ),
    evaluated_at: z
      .string()
      .describe('ISO 8601 UTC datetime at which timezone state was evaluated.'),
  }),

  errors: [
    {
      reason: 'no_match',
      severity: 'notice',
      code: JsonRpcErrorCode.NotFound,
      when: 'No timezone matched the query.',
      recovery:
        'Use an exact IANA timezone ID (e.g., "America/New_York", "Europe/London", "Asia/Tokyo") or a valid two-letter ISO country code (e.g., "US", "GB").',
    },
    {
      reason: 'invalid_at',
      severity: 'notice',
      code: JsonRpcErrorCode.ValidationError,
      when: 'The at parameter is not a valid ISO 8601 datetime string.',
      recovery: 'Use ISO 8601 format, e.g., "2026-01-15T12:00:00" or "2026-01-15T12:00:00Z".',
    },
  ],

  handler(input, ctx) {
    let atDate: Date | undefined;
    if (input.at?.trim()) {
      const parsed = new Date(input.at);
      // Date accepts February 30 by rolling into March. Check the written day before applying its offset.
      const calendarDate = /^\s*((?:\d{4}|[+-]\d{6})-\d{2}-\d{2})(?=[T\s]|$)/i.exec(input.at)?.[1];
      const rolledOver =
        calendarDate !== undefined &&
        new Date(`${calendarDate}T00:00:00Z`).getUTCDate() !== Number(calendarDate.slice(-2));
      if (Number.isNaN(parsed.getTime()) || rolledOver) {
        throw ctx.fail(
          'invalid_at',
          `Invalid at value "${escapeCallerText(input.at)}". Use ISO 8601 format, e.g., "2026-01-15T12:00:00Z".`,
        );
      }
      atDate = parsed;
    }

    if (!input.query.trim()) {
      throw ctx.fail(
        'no_match',
        'Empty query. Provide an IANA timezone ID, country code, or city name.',
      );
    }
    const timezones = getTimezoneService().lookup(input.query, input.by, atDate, ctx);
    if (!timezones) {
      const hint = input.by !== 'country' ? timezoneRecovery(input.query) : undefined;
      const message = `No timezone matched "${escapeCallerText(input.query)}".`;
      throw ctx.fail(
        'no_match',
        hint
          ? message
          : `${message} Use an exact IANA timezone ID (e.g., "America/New_York"), a two-letter ISO country code (e.g., "US"), or a major city name.`,
        hint ? { recovery: { hint } } : undefined,
      );
    }
    return {
      timezones,
      evaluated_at: (atDate ?? new Date()).toISOString(),
    };
  },

  format: (result) => {
    const lines: string[] = [`**Evaluated at:** ${result.evaluated_at}`, ''];
    for (const tz of result.timezones) {
      const dstStr = tz.dst_active ? `Yes (${tz.dst_abbreviation ?? ''})` : `No`;
      lines.push(`## ${tz.iana_id}`);
      lines.push(
        `**Current offset:** UTC${tz.current_offset_hours >= 0 ? '+' : ''}${tz.current_offset_hours}`,
      );
      lines.push(
        `**Standard offset:** UTC${tz.standard_offset_hours >= 0 ? '+' : ''}${tz.standard_offset_hours}`,
      );
      lines.push(`**DST active:** ${dstStr}`);
      lines.push(`**Standard abbreviation:** ${tz.standard_abbreviation ?? 'N/A'}`);
      if (tz.major_cities.length > 0) lines.push(`**Major cities:** ${tz.major_cities.join(', ')}`);
      if (tz.countries.length > 0) lines.push(`**Countries:** ${tz.countries.join(', ')}`);
      lines.push('');
    }
    return [{ type: 'text', text: lines.join('\n') }];
  },
});
