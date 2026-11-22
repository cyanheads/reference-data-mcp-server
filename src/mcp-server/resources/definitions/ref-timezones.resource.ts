/**
 * @fileoverview Resource for fetching timezone info by IANA ID.
 * @module mcp-server/resources/definitions/ref-timezones
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { getTimezoneService } from '@/services/timezone/timezone-service.js';
import { escapeCallerText } from '@/services/unicode/display-escape.js';

function unencodedSlash(ianaId: string) {
  const encodedUri = `ref://timezones/${encodeURIComponent(ianaId)}`;
  return {
    message: `Timezone URI contains an unencoded slash. Use: ${encodedUri} (IANA ID: "${escapeCallerText(ianaId)}").`,
    data: { iana_id: ianaId, encoded_uri: encodedUri },
  };
}

/**
 * Catch resource for unencoded IANA timezone IDs with a slash (e.g., America/New_York).
 * IANA IDs like "America/New_York" contain a literal slash; when passed unencoded the MCP
 * framework matches this two-segment path instead of the single-param template and would
 * otherwise return a generic "not found" error with no guidance.
 *
 * This resource catches the two-segment case and returns an actionable error with the
 * correctly encoded URI so clients can retry.
 */
export const refTimezonesSlashCatchResource = resource('ref://timezones/{region}/{city}', {
  name: 'ref-timezone-slash-redirect',
  description:
    'Returns an actionable error when an IANA timezone ID is passed with an unencoded slash (e.g., America/New_York). Instructs the caller to use the correctly percent-encoded URI (America%2FNew_York) and retry.',
  mimeType: 'application/json',

  params: z.object({
    region: z.string().describe('Region segment of the IANA timezone ID (e.g., "America").'),
    city: z.string().describe('City segment of the IANA timezone ID (e.g., "New_York").'),
  }),

  errors: [
    {
      reason: 'unencoded_slash',
      code: JsonRpcErrorCode.ValidationError,
      when: 'The URI carries an IANA timezone ID with its slash unencoded.',
      recovery:
        'Read the encoded_uri this error names, which encodes the slash in the IANA ID as %2F.',
      severity: 'notice',
    },
  ],

  handler(params, ctx) {
    const { message, data } = unencodedSlash(`${params.region}/${params.city}`);
    throw ctx.fail('unencoded_slash', message, data);
  },
});

/** Supplies the encoded retry URI for an IANA ID with three raw path segments. */
export const refTimezonesNestedSlashCatchResource = resource(
  'ref://timezones/{region}/{subregion}/{city}',
  {
    name: 'ref-timezone-nested-slash-redirect',
    description:
      'Returns the percent-encoded URI to retry when a three-segment IANA timezone ID contains unencoded slashes.',
    mimeType: 'application/json',

    params: z.object({
      region: z.string().describe('First segment of the IANA timezone ID (e.g., "America").'),
      subregion: z.string().describe('Second segment of the IANA timezone ID (e.g., "Argentina").'),
      city: z.string().describe('Last segment of the IANA timezone ID (e.g., "Buenos_Aires").'),
    }),

    errors: [
      {
        reason: 'unencoded_slash',
        code: JsonRpcErrorCode.ValidationError,
        when: 'The URI carries an IANA timezone ID with its slashes unencoded.',
        recovery:
          'Read the encoded_uri this error names, which encodes the slashes in the IANA ID as %2F.',
        severity: 'notice',
      },
    ],

    handler(params, ctx) {
      const { message, data } = unencodedSlash(
        `${params.region}/${params.subregion}/${params.city}`,
      );
      throw ctx.fail('unencoded_slash', message, data);
    },
  },
);

export const refTimezonesResource = resource('ref://timezones/{iana_id}', {
  name: 'ref-timezone',
  description:
    'Timezone info by IANA ID (URL-encode slashes as %2F, e.g., ref://timezones/America%2FNew_York). Returns current offset, standard offset, DST status, major cities, and country codes.',
  mimeType: 'application/json',
  cacheHint: { ttlMs: 60_000, cacheScope: 'public' },

  params: z.object({
    iana_id: z
      .string()
      .describe(
        'IANA timezone identifier with slashes URL-encoded as %2F (e.g., "America%2FNew_York", "Europe%2FLondon", "UTC").',
      ),
  }),

  output: z.object({
    iana_id: z.string().describe('IANA timezone identifier.'),
    current_offset_hours: z
      .number()
      .describe('Current UTC offset in hours (e.g., -5.0 for UTC-05:00).'),
    standard_offset_hours: z
      .number()
      .describe('Standard (non-DST) UTC offset in hours (e.g., -5.0 for UTC-05:00).'),
    dst_active: z.boolean().describe('Whether DST is currently active.'),
    dst_abbreviation: z.string().nullable().describe('DST abbreviation (e.g., "EDT"), or null.'),
    standard_abbreviation: z.string().nullable().describe('Standard abbreviation (e.g., "EST").'),
    major_cities: z.array(z.string()).describe('Major cities in this timezone.'),
    countries: z.array(z.string()).describe('ISO alpha-2 country codes observing this timezone.'),
    evaluated_at: z.string().describe('ISO 8601 UTC datetime at which the offset was evaluated.'),
  }),

  errors: [
    {
      reason: 'invalid_timezone',
      code: JsonRpcErrorCode.NotFound,
      when: 'The requested value is not a valid IANA timezone ID.',
      recovery:
        'Use an IANA timezone ID with its slash encoded as %2F, or find the ID by city or country with ref_timezone_lookup.',
      severity: 'notice',
    },
  ],

  // `iana_id` arrives decoded by `createApp({ decodeResourceParams: true })`: %2F is already `/`.
  handler(params, ctx) {
    const ianaId = params.iana_id;

    const record = getTimezoneService().readNamedZone(ianaId);
    if (!record) {
      throw ctx.fail(
        'invalid_timezone',
        `Timezone "${escapeCallerText(ianaId)}" is not a valid IANA timezone ID. URL-encode slashes as %2F (e.g., America%2FNew_York).`,
        { iana_id: ianaId },
      );
    }
    return {
      ...record,
      evaluated_at: new Date().toISOString(),
    };
  },
});
