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

beforeAll(() => {
  initTimezoneService();
});

describe('refTimezonesResource', () => {
  // Happy paths
  it('returns UTC timezone info with zero offset', () => {
    const ctx = createMockContext();
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

  it('returns America%2FNew_York timezone info (percent-encoded)', () => {
    const ctx = createMockContext();
    // Simulates client sending America%2FNew_York as the iana_id param
    const params = refTimezonesResource.params!.parse({ iana_id: 'America%2FNew_York' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.iana_id).toBe('America/New_York');
    expect(result.standard_offset_hours).toBe(-5);
    expect(result.major_cities).toBeInstanceOf(Array);
    expect(result.countries).toBeInstanceOf(Array);
  });

  it('returns Europe%2FLondon timezone info', () => {
    const ctx = createMockContext();
    const params = refTimezonesResource.params!.parse({ iana_id: 'Europe%2FLondon' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.iana_id).toBe('Europe/London');
    expect(result.standard_offset_hours).toBe(0);
    expect(result.countries).toContain('GB');
  });

  it('returns Asia%2FTokyo timezone info', () => {
    const ctx = createMockContext();
    const params = refTimezonesResource.params!.parse({ iana_id: 'Asia%2FTokyo' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.iana_id).toBe('Asia/Tokyo');
    expect(result.standard_offset_hours).toBe(9);
    expect(result.dst_active).toBe(false);
  });

  it('output validates against the declared output schema', () => {
    const ctx = createMockContext();
    const params = refTimezonesResource.params!.parse({ iana_id: 'UTC' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(() => refTimezonesResource.output!.parse(result)).not.toThrow();
  });

  it('evaluated_at is a valid ISO 8601 UTC datetime', () => {
    const ctx = createMockContext();
    const params = refTimezonesResource.params!.parse({ iana_id: 'UTC' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    const parsed = new Date(result.evaluated_at);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(result.evaluated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('countries array contains ISO alpha-2 codes', () => {
    const ctx = createMockContext();
    const params = refTimezonesResource.params!.parse({ iana_id: 'America%2FNew_York' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    for (const code of result.countries) {
      expect(code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('major_cities is an array of strings', () => {
    const ctx = createMockContext();
    const params = refTimezonesResource.params!.parse({ iana_id: 'America%2FNew_York' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    expect(result.major_cities).toBeInstanceOf(Array);
    for (const city of result.major_cities) {
      expect(typeof city).toBe('string');
    }
  });

  // Error paths — resource handler is synchronous, throws directly
  it('throws NotFound for invalid IANA timezone ID', () => {
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
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
    const ctx = createMockContext();
    const params = refTimezonesSlashCatchResource.params!.parse({
      region: 'Asia',
      city: 'Tokyo',
    });
    expect(() => refTimezonesSlashCatchResource.handler(params, ctx)).toThrow();
  });
});
