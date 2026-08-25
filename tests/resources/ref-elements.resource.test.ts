/**
 * @fileoverview Tests for the ref-elements resource.
 * @module tests/resources/ref-elements.resource.test
 */

import { JsonRpcErrorCode, McpError } from '@cyanheads/mcp-ts-core/errors';
import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refElementsResource } from '@/mcp-server/resources/definitions/ref-elements.resource.js';
import { initElementsService } from '@/services/elements/elements-service.js';
import { expectSync } from '../test-helpers.js';

beforeAll(() => {
  initElementsService();
});

describe('refElementsResource', () => {
  // Happy paths
  it('returns Carbon (Z=6) by atomic number', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '6' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(6);
    expect(result.symbol).toBe('C');
    expect(result.name).toBe('Carbon');
    expect(result.period).toBe(2);
    expect(result.block).toBe('p');
    expect(result.phase_at_stp).toBe('Solid');
    expect(result.radioactive).toBe(false);
    expect(result.natural).toBe(true);
    expect(result.dataset_version).toBeTruthy();
  });

  it('returns Hydrogen (Z=1) — minimum atomic number', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '1' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(1);
    expect(result.symbol).toBe('H');
    expect(result.name).toBe('Hydrogen');
  });

  it('returns Oganesson (Z=118) — maximum atomic number', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '118' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(118);
    expect(result.symbol).toBe('Og');
    expect(result.radioactive).toBe(true);
    expect(result.natural).toBe(false);
  });

  it('returns Gold (Z=79)', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '79' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(79);
    expect(result.symbol).toBe('Au');
    expect(result.name).toBe('Gold');
    expect(result.category).toBeTruthy();
  });

  // Sparse payload: synthetic elements with null properties
  it('returns null or estimated atomic_mass for synthetic elements', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '118' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    // atomic_mass may be null or estimated for synthetic elements
    expect(result.atomic_mass === null || typeof result.atomic_mass === 'number').toBe(true);
  });

  it('output validates against the declared output schema for common element', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '6' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(() => refElementsResource.output!.parse(result)).not.toThrow();
  });

  it('output validates against the declared output schema for synthetic element', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '118' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(() => refElementsResource.output!.parse(result)).not.toThrow();
  });

  it('returns dataset_version string', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '1' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(typeof result.dataset_version).toBe('string');
    expect(result.dataset_version.length).toBeGreaterThan(0);
  });

  // Error paths — resource handler is synchronous, throws directly
  it('throws NotFound for atomic number 0', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '0' });
    let thrown: unknown;
    try {
      refElementsResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
  });

  it('throws NotFound for atomic number 119 (beyond max)', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '119' });
    let thrown: unknown;
    try {
      refElementsResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
  });

  it('throws NotFound for negative number', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '-1' });
    let thrown: unknown;
    try {
      refElementsResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
  });

  it('throws NotFound for non-numeric string', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: 'carbon' });
    let thrown: unknown;
    try {
      refElementsResource.handler(params, ctx);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(McpError);
    expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
  });

  it('error message mentions the rejected number', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '999' });
    let errorMessage = '';
    try {
      refElementsResource.handler(params, ctx);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).toContain('999');
  });

  // Edge cases
  it('handles leading zeros (parseInt strips them → valid element)', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: '006' });
    // parseInt('006', 10) = 6 → Carbon
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(6);
  });

  // Security
  it('does not crash or leak internals on injection-style input', () => {
    const ctx = createMockContext();
    const injectionAttempts = [
      "'; DROP TABLE elements; --",
      '<script>alert(1)</script>',
      '../../../etc/passwd',
      '\x00\x01\x02',
    ];
    for (const attempt of injectionAttempts) {
      const params = refElementsResource.params!.parse({ number: attempt });
      let thrown: unknown;
      try {
        refElementsResource.handler(params, ctx);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(McpError);
      expect((thrown as McpError).code).toBe(JsonRpcErrorCode.NotFound);
    }
  });

  it('does not expose environment variable values in error messages', () => {
    const ctx = createMockContext();
    const params = refElementsResource.params!.parse({ number: 'injection_attempt_9999' });
    let errorMessage = '';
    try {
      refElementsResource.handler(params, ctx);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    }
    expect(errorMessage).not.toMatch(/process\.env/);
    expect(errorMessage).not.toMatch(/stack trace/i);
    expect(errorMessage.length).toBeGreaterThan(0);
  });
});
