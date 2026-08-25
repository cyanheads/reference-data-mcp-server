/**
 * @fileoverview Tests for the ref_http_status tool.
 * @module tests/tools/ref-http-status.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { httpStatusCodes } from '@/data/http-status-codes.js';
import { refHttpStatus } from '@/mcp-server/tools/definitions/ref-http-status.tool.js';
import { initHttpStatusService } from '@/services/http-status/http-status-service.js';
import { expectText } from '../test-helpers.js';

beforeAll(() => {
  initHttpStatusService();
});

describe('refHttpStatus', () => {
  it('looks up 404 by numeric code string', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: '404' });
    const result = await refHttpStatus.handler(input, ctx);
    expect(result.code).toBe(404);
    expect(result.reason_phrase).toBe('Not Found');
    expect(result.category).toContain('4xx');
    expect(result.cacheable).toBe(true);
    expect(result.rfc).toBeTruthy();
  });

  it('looks up 200 OK', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: '200' });
    const result = await refHttpStatus.handler(input, ctx);
    expect(result.code).toBe(200);
    expect(result.reason_phrase).toBe('OK');
    expect(result.category).toContain('2xx');
    expect(result.cacheable).toBe(true);
  });

  it('looks up 500 Internal Server Error', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: '500' });
    const result = await refHttpStatus.handler(input, ctx);
    expect(result.code).toBe(500);
    expect(result.reason_phrase).toBe('Internal Server Error');
    expect(result.category).toContain('5xx');
    expect(result.cacheable).toBe(false);
  });

  it('keyword search returns primary match', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: 'not found' });
    const result = await refHttpStatus.handler(input, ctx);
    expect(result.code).toBe(404);
    expect(result.reason_phrase).toBe('Not Found');
  });

  it('keyword search returns alternatives for broad terms', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: 'redirect' });
    const result = await refHttpStatus.handler(input, ctx);
    expect(result.code).toBeGreaterThanOrEqual(300);
    expect(result.code).toBeLessThan(400);
    // Broad keyword may match several codes
    if (result.alternatives) {
      expect(result.alternatives).toBeInstanceOf(Array);
      expect(result.alternatives.every((a) => a.code > 0)).toBe(true);
    }
  });

  it('throws for unrecognized numeric code', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: '999' });
    expect(() => refHttpStatus.handler(input, ctx)).toThrow(/not a registered IANA code|999/);
  });

  it('throws not-found for float query like "404.5" (does not silently match 404)', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: '404.5' });
    expect(() => refHttpStatus.handler(input, ctx)).toThrow(/No HTTP status code matched/);
  });

  it('throws not-found for "200.0" (does not silently match 200)', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: '200.0' });
    expect(() => refHttpStatus.handler(input, ctx)).toThrow(/No HTTP status code matched/);
  });

  it('throws for unrecognized keyword', async () => {
    const ctx = createMockContext({ errors: refHttpStatus.errors });
    const input = refHttpStatus.input.parse({ query: 'xyzzy_no_match_keyword' });
    expect(() => refHttpStatus.handler(input, ctx)).toThrow(/No HTTP status code matched/);
  });

  it('formats output with code, phrase, category, and RFC', () => {
    const output = {
      code: 404,
      reason_phrase: 'Not Found',
      description: 'The server cannot find the requested resource.',
      category: '4xx Client Error',
      cacheable: true,
      rfc: 'RFC 9110',
      rfc_section: '15.5.5',
    };
    const blocks = refHttpStatus.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('404');
    expect(text).toContain('Not Found');
    expect(text).toContain('4xx Client Error');
    expect(text).toContain('RFC 9110');
    expect(text).toContain('15.5.5');
  });

  it('formats alternatives when present', () => {
    const output = {
      code: 301,
      reason_phrase: 'Moved Permanently',
      description: 'The resource has moved.',
      category: '3xx Redirection',
      cacheable: true,
      rfc: 'RFC 9110',
      rfc_section: '15.4.2',
      alternatives: [
        { code: 302, reason_phrase: 'Found', category: '3xx Redirection' },
        { code: 308, reason_phrase: 'Permanent Redirect', category: '3xx Redirection' },
      ],
    };
    const blocks = refHttpStatus.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('Other matches');
    expect(text).toContain('302');
    expect(text).toContain('Found');
    expect(text).toContain('308');
  });

  it.each([
    { code: '204', reason: 'No Content', cacheable: true },
    { code: '405', reason: 'Method Not Allowed', cacheable: true },
    { code: '304', reason: 'Not Modified', cacheable: false },
    { code: '226', reason: 'IM Used', cacheable: false },
  ])(
    'reports cacheable=$cacheable for $code ($reason) per RFC 9110 §15.1',
    async ({ code, cacheable }) => {
      const ctx = createMockContext({ errors: refHttpStatus.errors });
      const input = refHttpStatus.input.parse({ query: code });
      const result = await refHttpStatus.handler(input, ctx);
      expect(result.cacheable).toBe(cacheable);
    },
  );

  it('cacheable flags match the RFC 9110 §15.1 heuristically-cacheable set exactly', () => {
    // The set the `cacheable` field encodes: statuses reusable by a cache with heuristic expiration.
    const heuristicallyCacheable = [200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501];
    const flagged = httpStatusCodes
      .filter((s) => s.cacheable)
      .map((s) => s.code)
      .sort((a, b) => a - b);
    expect(flagged).toEqual(heuristicallyCacheable);
  });
});
