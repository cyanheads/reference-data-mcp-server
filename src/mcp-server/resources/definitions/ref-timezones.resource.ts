/**
 * @fileoverview Resource for fetching timezone info by IANA ID.
 * @module mcp-server/resources/definitions/ref-timezones
 */

import { resource, z } from '@cyanheads/mcp-ts-core';
import { invalidParams, notFound } from '@cyanheads/mcp-ts-core/errors';
import { getTimezoneService } from '@/services/timezone/timezone-service.js';

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

  handler(params) {
    const ianaId = `${params.region}/${params.city}`;
    const encoded = `${encodeURIComponent(params.region)}%2F${encodeURIComponent(params.city)}`;
    throw invalidParams(
      `Timezone URI contains an unencoded slash. Use: ref://timezones/${encoded} (IANA ID: "${ianaId}").`,
      { iana_id: ianaId, encoded_uri: `ref://timezones/${encoded}` },
    );
  },
});

export const refTimezonesResource = resource('ref://timezones/{iana_id}', {
  name: 'ref-timezone',
  description:
    'Timezone info by IANA ID (URL-encode slashes as %2F, e.g., ref://timezones/America%2FNew_York). Returns current offset, standard offset, DST status, major cities, and country codes.',
  mimeType: 'application/json',

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

  handler(params, ctx) {
    // Decode %2F back to / for IANA IDs
    const ianaId = decodeURIComponent(params.iana_id);

    // Validate that the timezone exists via Intl
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: ianaId });
    } catch {
      throw notFound(
        `Timezone "${ianaId}" is not a valid IANA timezone ID. URL-encode slashes as %2F (e.g., America%2FNew_York).`,
        { iana_id: ianaId },
      );
    }

    const records = getTimezoneService().lookup(ianaId, 'iana', undefined, ctx);
    const record = records?.[0];
    if (!record) {
      throw notFound(`No timezone data found for "${ianaId}".`, { iana_id: ianaId });
    }
    return {
      ...record,
      evaluated_at: new Date().toISOString(),
    };
  },
});
