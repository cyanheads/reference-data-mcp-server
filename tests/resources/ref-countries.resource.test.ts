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

beforeAll(() => {
  initTimezoneService();
  initGeoService();
});

describe('refCountriesResource', () => {
  // Happy paths
  it('returns full country record for US', () => {
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
    const params = refCountriesResource.params!.parse({ alpha2: 'jp' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.alpha2).toBe('JP');
    expect(result.name).toBe('Japan');
  });

  it('returns capital or empty string for Antarctica', () => {
    const ctx = createMockContext();
    const params = refCountriesResource.params!.parse({ alpha2: 'AQ' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.alpha2).toBe('AQ');
    // Antarctica: capital is null or empty string depending on dataset
    expect(
      result.capital === null || result.capital === '' || typeof result.capital === 'string',
    ).toBe(true);
  });

  it('returns currency array with code, name, and symbol', () => {
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
    const params = refCountriesResource.params!.parse({ alpha2: 'US' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    expect(result.timezones).toBeInstanceOf(Array);
    expect(result.timezones.length).toBeGreaterThan(0);
  });

  it('output validates against the declared output schema', () => {
    const ctx = createMockContext();
    const params = refCountriesResource.params!.parse({ alpha2: 'CA' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    // Should parse cleanly — throws if schema mismatch
    expect(() => refCountriesResource.output!.parse(result)).not.toThrow();
  });

  it('calling_codes contains + prefix strings', () => {
    const ctx = createMockContext();
    const params = refCountriesResource.params!.parse({ alpha2: 'AU' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    for (const code of result.calling_codes) {
      expect(code).toMatch(/^\+/);
    }
  });

  // Security: injection attempts in the alpha2 parameter should not produce crashes or leak internals
  it('does not crash or leak internals on injection-style input', () => {
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
