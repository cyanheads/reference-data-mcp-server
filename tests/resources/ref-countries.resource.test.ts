/**
 * @fileoverview Tests for the ref-countries resource.
 * @module tests/resources/ref-countries.resource.test
 */

import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refCountriesResource } from '@/mcp-server/resources/definitions/ref-countries.resource.js';
import { initGeoService } from '@/services/geo/geo-service.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';
import { expectSync } from '../test-helpers.js';
import { createResourceReader, watchResourceFailureLogs } from './read-resource.js';

beforeAll(() => {
  initTimezoneService();
  initGeoService();
});

describe('refCountriesResource', () => {
  // Happy paths
  it('returns full country record for US', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'US' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.alpha2).toBe('US');
    expect(result.alpha3).toBe('USA');
    expect(result.name).toBe('United States');
    expect(result.region).toBeTruthy();
    expect(result.languages).toBeInstanceOf(Array);
    expect(result.currencies).toBeInstanceOf(Array);
    expect(result.calling_codes).toContain('+1');
    expect(result.flag).toBeTruthy();
    expect(result.timezones).toBeInstanceOf(Array);
  });

  it('returns full country record for DE (Germany)', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'DE' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.alpha2).toBe('DE');
    expect(result.alpha3).toBe('DEU');
    expect(result.name).toBe('Germany');
    expect(result.capital).toBe('Berlin');
    expect(result.region).toBe('Europe');
    expect(result.tld).toBe('.de');
  });

  it('uppercases lowercase alpha2 input', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'jp' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.alpha2).toBe('JP');
    expect(result.name).toBe('Japan');
  });

  it('returns capital or empty string for Antarctica', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'AQ' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.alpha2).toBe('AQ');
    // Antarctica: capital is null or empty string depending on dataset
    expect(
      result.capital === null || result.capital === '' || typeof result.capital === 'string',
    ).toBe(true);
  });

  it('returns currency array with code, name, and symbol', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'GB' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.currencies.length).toBeGreaterThan(0);
    for (const c of result.currencies) {
      expect(c).toHaveProperty('code');
      expect(c).toHaveProperty('name');
      expect(c).toHaveProperty('symbol');
    }
  });

  it('returns language array with code and name', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'FR' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.languages.length).toBeGreaterThan(0);
    for (const l of result.languages) {
      expect(l).toHaveProperty('code');
      expect(l).toHaveProperty('name');
    }
  });

  // Error paths — resource handler is synchronous, throws directly
  it('throws NotFound for unrecognized alpha2 code', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'XX' });
    let thrown: unknown;
    try {
      refCountriesResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
  });

  it('throws NotFound for a numeric-looking code', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: '99' });
    let thrown: unknown;
    try {
      refCountriesResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
  });

  it('error message mentions the rejected code', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'ZZ' });
    let errorMessage = '';
    try {
      refCountriesResource.handler(params, ctx);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).toContain('ZZ');
  });

  // Edge cases
  it('returns timezones array with at least one entry for US', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'US' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.timezones).toBeInstanceOf(Array);
    expect(result.timezones.length).toBeGreaterThan(0);
  });

  it('output validates against the declared output schema', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'CA' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    // Should parse cleanly — throws if schema mismatch
    expect(() => refCountriesResource.output!.parse(result)).not.toThrow();
  });

  it('calling_codes contains + prefix strings', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const params = refCountriesResource.params!.parse({ alpha2: 'AU' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    for (const code of result.calling_codes) {
      expect(code).toMatch(/^\+/);
    }
  });

  // Security: injection attempts in the alpha2 parameter should not produce crashes or leak internals
  it('does not crash or leak internals on injection-style input', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    const injectionAttempts = [
      "'; DROP TABLE countries; --",
      '<script>alert(1)</script>',
      '../../../etc/passwd',
      '\x00\x01\x02',
    ];
    for (const attempt of injectionAttempts) {
      const params = refCountriesResource.params!.parse({ alpha2: attempt });
      let thrown: unknown;
      try {
        refCountriesResource.handler(params, ctx);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(McpError);
      expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
    }
  });

  it('does not expose environment variable values in error messages', () => {
    const ctx = createMockContext({ errors: refCountriesResource.errors });
    // Use a unique non-existent code that would not match any env var pattern
    const params = refCountriesResource.params!.parse({ alpha2: 'NONEXISTENT_VERY_LONG_CODE' });
    let errorMessage = '';
    try {
      refCountriesResource.handler(params, ctx);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).not.toMatch(/process\.env/);
    expect(errorMessage).not.toMatch(/stack trace/i);
    // Error message should reference the invalid code, not raw system internals
    expect(errorMessage.length).toBeGreaterThan(0);
  });
});

describe('refCountriesResource through resources/read', () => {
  const read = createResourceReader([refCountriesResource]);

  it('reads a plain alpha-2 code', async () => {
    const reply = await read('ref://countries/US');
    expect(reply.error).toBeUndefined();
    const record = JSON.parse(reply.result?.contents[0]?.text ?? '');
    expect(record.alpha2).toBe('US');
    expect(record.name).toBe('United States');
  });

  it('reads a percent-encoded code as the code it encodes', async () => {
    const reply = await read('ref://countries/%55%53');
    expect(reply.error).toBeUndefined();
    expect(JSON.parse(reply.result?.contents[0]?.text ?? '').alpha2).toBe('US');
  });

  it('decodes a double-encoded code once, to a literal escape that is not found', async () => {
    const reply = await read('ref://countries/%2555%2553');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.NotFound);
    expect(reply.error?.message).toBe(
      'Country "%55%53" not found. Use a valid ISO 3166-1 alpha-2 code (e.g., "US", "DE").',
    );
    expect(reply.error?.data).toMatchObject({ alpha2: '%55%53' });
  });

  it('refuses a malformed percent escape as a params rejection naming the variable', async () => {
    const reply = await read('ref://countries/%E0%A4%A');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.ValidationError);
    expect(reply.error?.message).toContain('Invalid percent-encoding');
    expect(reply.error?.data?.issues).toEqual([expect.objectContaining({ path: ['alpha2'] })]);
  });

  it('carries the country_not_found reason and its recovery hint', async () => {
    const reply = await read('ref://countries/XX');
    expect(reply.error?.data?.reason).toBe('country_not_found');
    expect(reply.error?.data?.recovery).toEqual({
      hint: 'Use an ISO 3166-1 alpha-2 code, or find it by country name with ref_geo_lookup.',
    });
  });

  it('logs an unknown code at notice, not error', async () => {
    const logs = watchResourceFailureLogs();
    try {
      await read('ref://countries/XX');
      expect(logs.records()).toEqual([
        {
          level: 'notice',
          message:
            'Error in resource:ref-country: Country "XX" not found. Use a valid ISO 3166-1 alpha-2 code (e.g., "US", "DE").',
        },
      ]);
    } finally {
      logs.restore();
    }
  });

  it('answers an unknown code as not found with the code in data', async () => {
    const reply = await read('ref://countries/XX');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.NotFound);
    expect(reply.error?.message).toBe(
      'Country "XX" not found. Use a valid ISO 3166-1 alpha-2 code (e.g., "US", "DE").',
    );
    expect(reply.error?.data).toMatchObject({ alpha2: 'XX' });
    expect(typeof reply.error?.data?.requestId).toBe('string');
  });

  it('answers an empty parameter with the resource-not-found shape', async () => {
    const reply = await read('ref://countries/');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.InvalidParams);
    expect(reply.error?.data).toEqual({ uri: 'ref://countries/' });
  });
});
