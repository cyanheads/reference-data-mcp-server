/**
 * @fileoverview Tests for the ref-timezones and ref-timezones-slash-catch resources.
 * @module tests/resources/ref-timezones.resource.test
 */

import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  refTimezonesResource,
  refTimezonesSlashCatchResource,
} from '@/mcp-server/resources/definitions/ref-timezones.resource.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';
import { expectSync } from '../test-helpers.js';
import { createResourceReader, watchResourceFailureLogs } from './read-resource.js';

beforeAll(() => {
  initTimezoneService();
});

describe('refTimezonesResource', () => {
  // Happy paths
  it('returns UTC timezone info with zero offset', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'UTC' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.iana_id).toBe('UTC');
    // UTC offset is 0; allow -0 === 0 comparison
    expect(Math.abs(result.current_offset_hours)).toBe(0);
    expect(Math.abs(result.standard_offset_hours)).toBe(0);
    expect(result.dst_active).toBe(false);
    expect(result.evaluated_at).toBeTruthy();
    expect(typeof result.evaluated_at).toBe('string');
    expect(result.evaluated_at).toMatch(/Z$/);
  });

  it('returns America/New_York timezone info', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    // The framework decodes ref://timezones/America%2FNew_York before the handler runs
    const params = refTimezonesResource.params!.parse({ iana_id: 'America/New_York' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.iana_id).toBe('America/New_York');
    expect(result.standard_offset_hours).toBe(-5);
    expect(result.major_cities).toBeInstanceOf(Array);
    expect(result.countries).toBeInstanceOf(Array);
  });

  it('returns Europe/London timezone info', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'Europe/London' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.iana_id).toBe('Europe/London');
    expect(result.standard_offset_hours).toBe(0);
    expect(result.countries).toContain('GB');
  });

  it('returns Asia/Tokyo timezone info', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'Asia/Tokyo' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.iana_id).toBe('Asia/Tokyo');
    expect(result.standard_offset_hours).toBe(9);
    expect(result.dst_active).toBe(false);
  });

  it('output validates against the declared output schema', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'UTC' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(() => refTimezonesResource.output!.parse(result)).not.toThrow();
  });

  it('evaluated_at is a valid ISO 8601 UTC datetime', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'UTC' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    const parsed = new Date(result.evaluated_at);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(result.evaluated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('countries array contains ISO alpha-2 codes', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'America/New_York' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    for (const code of result.countries) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('major_cities is an array of strings', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'America/New_York' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.major_cities).toBeInstanceOf(Array);
    for (const city of result.major_cities) {
      expect(typeof city).toBe('string');
    }
  });

  // Error paths — resource handler is synchronous, throws directly
  it('throws NotFound for invalid IANA timezone ID', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'Galaxy%2FFakeCity_9999' });
    let thrown: unknown;
    try {
      refTimezonesResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
  });

  it('throws NotFound for empty string IANA ID', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: '' });
    let thrown: unknown;
    try {
      refTimezonesResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
  });

  it('error message does not contain process.env patterns', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const params = refTimezonesResource.params!.parse({ iana_id: 'Invalid%2FTimezone_XYZ' });
    let errorMessage = '';
    try {
      refTimezonesResource.handler(params, ctx);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).not.toMatch(/process\.env/);
    expect(errorMessage.length).toBeGreaterThan(0);
  });

  // Security
  it('does not crash or leak internals on injection-style input', () => {
    const ctx = createMockContext({ errors: refTimezonesResource.errors });
    const injectionAttempts = [
      "'; DROP TABLE timezones; --",
      '<script>alert(1)</script>',
      '%2E%2E%2F%2E%2E%2F',
    ];
    for (const attempt of injectionAttempts) {
      const params = refTimezonesResource.params!.parse({ iana_id: attempt });
      let thrown: unknown;
      try {
        refTimezonesResource.handler(params, ctx);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(McpError);
      expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
    }
  });
});

describe('refTimezonesSlashCatchResource', () => {
  it('throws ValidationError with encoded URI guidance', () => {
    const ctx = createMockContext({ errors: refTimezonesSlashCatchResource.errors });
    const params = refTimezonesSlashCatchResource.params!.parse({
      region: 'America',
      city: 'New_York',
    });
    let thrown: unknown;
    try {
      refTimezonesSlashCatchResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.ValidationError);
  });

  it('error message contains the percent-encoded URI hint', () => {
    const ctx = createMockContext({ errors: refTimezonesSlashCatchResource.errors });
    const params = refTimezonesSlashCatchResource.params!.parse({
      region: 'America',
      city: 'New_York',
    });
    let errorMessage = '';
    try {
      refTimezonesSlashCatchResource.handler(params, ctx);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).toContain('America%2FNew_York');
  });

  it('error message contains the reconstructed IANA ID', () => {
    const ctx = createMockContext({ errors: refTimezonesSlashCatchResource.errors });
    const params = refTimezonesSlashCatchResource.params!.parse({
      region: 'Europe',
      city: 'London',
    });
    let errorMessage = '';
    try {
      refTimezonesSlashCatchResource.handler(params, ctx);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).toContain('Europe/London');
  });

  it('constructs correct encoded URI for any region/city pair', () => {
    const ctx = createMockContext({ errors: refTimezonesSlashCatchResource.errors });
    const params = refTimezonesSlashCatchResource.params!.parse({
      region: 'Pacific',
      city: 'Auckland',
    });
    let errorMessage = '';
    try {
      refTimezonesSlashCatchResource.handler(params, ctx);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).toContain('Pacific%2FAuckland');
  });

  it('always throws — never returns a value', () => {
    const ctx = createMockContext({ errors: refTimezonesSlashCatchResource.errors });
    const params = refTimezonesSlashCatchResource.params!.parse({
      region: 'Asia',
      city: 'Tokyo',
    });
    expect(() => refTimezonesSlashCatchResource.handler(params, ctx)).toThrow();
  });
});

describe('timezone resources through resources/read', () => {
  const read = createResourceReader([refTimezonesResource, refTimezonesSlashCatchResource]);
  const notValid = (id: string) =>
    `Timezone "${id}" is not a valid IANA timezone ID. URL-encode slashes as %2F (e.g., America%2FNew_York).`;

  it('reads a plain IANA ID', async () => {
    const reply = await read('ref://timezones/UTC');
    expect(reply.error).toBeUndefined();
    expect(JSON.parse(reply.result?.contents[0]?.text ?? '').iana_id).toBe('UTC');
  });

  it('reads an IANA ID whose slash is percent-encoded', async () => {
    const reply = await read('ref://timezones/America%2FNew_York');
    expect(reply.error).toBeUndefined();
    const record = JSON.parse(reply.result?.contents[0]?.text ?? '');
    expect(record.iana_id).toBe('America/New_York');
    expect(record.standard_offset_hours).toBe(-5);
  });

  it('decodes a double-encoded ID once, to a literal %2F that is not found', async () => {
    const reply = await read('ref://timezones/America%252FNew_York');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.NotFound);
    expect(reply.error?.message).toBe(notValid('America%2FNew_York'));
    expect(reply.error?.data).toMatchObject({ iana_id: 'America%2FNew_York' });
  });

  it('answers an unknown ID as not found with the decoded ID in data', async () => {
    const reply = await read('ref://timezones/Galaxy%2FFake');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.NotFound);
    expect(reply.error?.message).toBe(notValid('Galaxy/Fake'));
    expect(reply.error?.data).toMatchObject({ iana_id: 'Galaxy/Fake' });
    expect(typeof reply.error?.data?.requestId).toBe('string');
  });

  it('reads IANA IDs only: a location name with a space is not found', async () => {
    const reply = await read('ref://timezones/New%20York');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.NotFound);
    expect(reply.error?.message).toBe(notValid('New York'));
  });

  it('answers an unencoded slash with the encoded URI to retry', async () => {
    const reply = await read('ref://timezones/America/New_York');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.ValidationError);
    expect(reply.error?.message).toBe(
      'Timezone URI contains an unencoded slash. Use: ref://timezones/America%2FNew_York (IANA ID: "America/New_York").',
    );
    expect(reply.error?.data).toMatchObject({
      iana_id: 'America/New_York',
      encoded_uri: 'ref://timezones/America%2FNew_York',
    });
  });

  it('answers an empty parameter with the resource-not-found shape', async () => {
    const reply = await read('ref://timezones/');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.InvalidParams);
    expect(reply.error?.data).toEqual({ uri: 'ref://timezones/' });
  });

  it('refuses a malformed percent escape as a params rejection naming the variable', async () => {
    const reply = await read('ref://timezones/%E0%A4%A');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.ValidationError);
    expect(reply.error?.message).toContain('Invalid percent-encoding');
    expect(reply.error?.data?.issues).toEqual([expect.objectContaining({ path: ['iana_id'] })]);
  });

  it('builds the retry URI from decoded segments when a segment carries an encoded slash', async () => {
    const reply = await read('ref://timezones/America%2FArgentina/Buenos_Aires');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.ValidationError);
    expect(reply.error?.message).toBe(
      'Timezone URI contains an unencoded slash. Use: ref://timezones/America%2FArgentina%2FBuenos_Aires (IANA ID: "America/Argentina/Buenos_Aires").',
    );
  });

  it('carries the invalid_timezone reason and its recovery hint', async () => {
    const reply = await read('ref://timezones/Galaxy%2FFake');
    expect(reply.error?.data?.reason).toBe('invalid_timezone');
    expect(reply.error?.data?.recovery).toEqual({
      hint: 'Use an IANA timezone ID with its slash encoded as %2F, or find the ID by city or country with ref_timezone_lookup.',
    });
  });

  it('carries the no_timezone_data reason for an ID Intl accepts but the dataset lacks', async () => {
    const reply = await read('ref://timezones/US%2FEastern');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.NotFound);
    expect(reply.error?.message).toBe('No timezone data found for "US/Eastern".');
    expect(reply.error?.data?.reason).toBe('no_timezone_data');
    expect(reply.error?.data?.recovery).toEqual({
      hint: 'Use the canonical IANA ID, or find it by city or country with ref_timezone_lookup.',
    });
  });

  it('carries the unencoded_slash reason and its recovery hint', async () => {
    const reply = await read('ref://timezones/America/New_York');
    expect(reply.error?.data?.reason).toBe('unencoded_slash');
    expect(reply.error?.data?.recovery).toEqual({
      hint: 'Read the encoded_uri this error names, which encodes the slash in the IANA ID as %2F.',
    });
  });

  it('logs an unknown ID and an unencoded slash at notice, not error', async () => {
    const logs = watchResourceFailureLogs();
    try {
      await read('ref://timezones/Galaxy%2FFake');
      await read('ref://timezones/America/New_York');
      expect(logs.records()).toEqual([
        { level: 'notice', message: `Error in resource:ref-timezone: ${notValid('Galaxy/Fake')}` },
        {
          level: 'notice',
          message:
            'Error in resource:ref-timezone-slash-redirect: Timezone URI contains an unencoded slash. Use: ref://timezones/America%2FNew_York (IANA ID: "America/New_York").',
        },
      ]);
    } finally {
      logs.restore();
    }
  });

  it('logs an alias the dataset lacks at notice, not error', async () => {
    const logs = watchResourceFailureLogs();
    try {
      await read('ref://timezones/US%2FEastern');
      expect(logs.records()).toEqual([
        {
          level: 'notice',
          message: 'Error in resource:ref-timezone: No timezone data found for "US/Eastern".',
        },
      ]);
    } finally {
      logs.restore();
    }
  });
});
