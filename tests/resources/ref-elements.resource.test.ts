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
import { createResourceReader, watchResourceFailureLogs } from './read-resource.js';

beforeAll(() => {
  initElementsService();
});

describe('refElementsResource', () => {
  // Happy paths
  it('returns Carbon (Z=6) by atomic number', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
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
    const ctx = createMockContext({ errors: refElementsResource.errors });
    const params = refElementsResource.params!.parse({ number: '1' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(1);
    expect(result.symbol).toBe('H');
    expect(result.name).toBe('Hydrogen');
  });

  it('returns Oganesson (Z=118) — maximum atomic number', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
    const params = refElementsResource.params!.parse({ number: '118' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(118);
    expect(result.symbol).toBe('Og');
    expect(result.radioactive).toBe(true);
    expect(result.natural).toBe(false);
  });

  it('returns Gold (Z=79)', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
    const params = refElementsResource.params!.parse({ number: '79' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(79);
    expect(result.symbol).toBe('Au');
    expect(result.name).toBe('Gold');
    expect(result.category).toBeTruthy();
  });

  // Sparse payload: synthetic elements with null properties
  it('returns null or estimated atomic_mass for synthetic elements', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
    const params = refElementsResource.params!.parse({ number: '118' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    // atomic_mass may be null or estimated for synthetic elements
    expect(result.atomic_mass === null || typeof result.atomic_mass === 'number').toBe(true);
  });

  it('output validates against the declared output schema for common element', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
    const params = refElementsResource.params!.parse({ number: '6' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(() => refElementsResource.output!.parse(result)).not.toThrow();
  });

  it('output validates against the declared output schema for synthetic element', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
    const params = refElementsResource.params!.parse({ number: '118' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(() => refElementsResource.output!.parse(result)).not.toThrow();
  });

  it('returns dataset_version string', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
    const params = refElementsResource.params!.parse({ number: '1' });
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(typeof result.dataset_version).toBe('string');
    expect(result.dataset_version.length).toBeGreaterThan(0);
  });

  // Error paths — resource handler is synchronous, throws directly
  it('throws NotFound for atomic number 0', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
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
    const ctx = createMockContext({ errors: refElementsResource.errors });
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
    const ctx = createMockContext({ errors: refElementsResource.errors });
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
    const ctx = createMockContext({ errors: refElementsResource.errors });
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
    const ctx = createMockContext({ errors: refElementsResource.errors });
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
    const ctx = createMockContext({ errors: refElementsResource.errors });
    const params = refElementsResource.params!.parse({ number: '006' });
    // parseInt('006', 10) = 6 → Carbon
    const result = expectSync(refElementsResource.handler(params, ctx));
    expect(result.number).toBe(6);
  });

  // Security
  it('does not crash or leak internals on injection-style input', () => {
    const ctx = createMockContext({ errors: refElementsResource.errors });
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
    const ctx = createMockContext({ errors: refElementsResource.errors });
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

describe('refElementsResource through resources/read', () => {
  const read = createResourceReader([refElementsResource]);

  it('reads a plain atomic number', async () => {
    const reply = await read('ref://elements/6');
    expect(reply.error).toBeUndefined();
    const record = JSON.parse(reply.result?.contents[0]?.text ?? '');
    expect(record.number).toBe(6);
    expect(record.symbol).toBe('C');
  });

  it('reads a percent-encoded number as the number it encodes', async () => {
    const reply = await read('ref://elements/%36');
    expect(reply.error).toBeUndefined();
    expect(JSON.parse(reply.result?.contents[0]?.text ?? '').symbol).toBe('C');
  });

  it('decodes a double-encoded number once, to a literal escape that is not valid', async () => {
    const reply = await read('ref://elements/%2536');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.NotFound);
    expect(reply.error?.message).toBe(
      'Atomic number "%36" is not valid. Use an integer from 1 to 118.',
    );
    expect(reply.error?.data).toMatchObject({ number: '%36' });
  });

  it('refuses a malformed percent escape as a params rejection naming the variable', async () => {
    const reply = await read('ref://elements/%E0%A4%A');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.ValidationError);
    expect(reply.error?.message).toContain('Invalid percent-encoding');
    expect(reply.error?.data?.issues).toEqual([expect.objectContaining({ path: ['number'] })]);
  });

  it('carries the invalid_atomic_number reason and its recovery hint', async () => {
    const reply = await read('ref://elements/119');
    expect(reply.error?.data?.reason).toBe('invalid_atomic_number');
    expect(reply.error?.data?.recovery).toEqual({
      hint: 'Use an atomic number from 1 to 118, or find the element by name or symbol with ref_element_lookup.',
    });
  });

  it('logs an out-of-range number at notice, not error', async () => {
    const logs = watchResourceFailureLogs();
    try {
      await read('ref://elements/119');
      expect(logs.records()).toEqual([
        {
          level: 'notice',
          message:
            'Error in resource:ref-element: Atomic number "119" is not valid. Use an integer from 1 to 118.',
        },
      ]);
    } finally {
      logs.restore();
    }
  });

  it('answers an out-of-range number as not valid with the number in data', async () => {
    const reply = await read('ref://elements/119');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.NotFound);
    expect(reply.error?.message).toBe(
      'Atomic number "119" is not valid. Use an integer from 1 to 118.',
    );
    expect(reply.error?.data).toMatchObject({ number: '119' });
    expect(typeof reply.error?.data?.requestId).toBe('string');
  });

  it('answers an empty parameter with the resource-not-found shape', async () => {
    const reply = await read('ref://elements/');
    expect(reply.error?.code).toBe(JsonRpcErrorCode.InvalidParams);
    expect(reply.error?.data).toEqual({ uri: 'ref://elements/' });
  });
});
