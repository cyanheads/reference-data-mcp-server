/**
 * @fileoverview Tests for the ref_mime_type tool.
 * @module tests/tools/ref-mime-type.tool.test
 */

import { createMockContext } from '@cyanheads/mcp-ts-core/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { refMimeType } from '@/mcp-server/tools/definitions/ref-mime-type.tool.js';
import { initMimeService } from '@/services/mime/mime-service.js';
import { expectText } from '../test-helpers.js';

beforeAll(() => {
  initMimeService();
});

describe('refMimeType', () => {
  it('looks up application/json by type string', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: 'application/json' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toBe('application/json');
    expect(result.compressible).toBe(true);
    expect(result.extensions).toContain('json');
    expect(result.source).toBeTruthy();
  });

  it('looks up by file extension with leading dot', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: '.json' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toBe('application/json');
    expect(result.extensions).toContain('json');
  });

  it('looks up by file extension without dot', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: 'html' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toContain('html');
    expect(result.compressible).toBe(true);
  });

  it('resolves .jpg to image/jpeg', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: '.jpg' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toBe('image/jpeg');
  });

  it('looks up image/png', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: 'image/png' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toBe('image/png');
    expect(result.compressible).toBe(false);
    expect(result.extensions).toContain('png');
  });

  it('handles sparse payload — type with no extensions', async () => {
    // Some MIME types have no registered extensions
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: 'application/octet-stream' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toBe('application/octet-stream');
    expect(result.extensions).toBeInstanceOf(Array);
    // compressible may be null for octet-stream
    expect(typeof result.compressible === 'boolean' || result.compressible === null).toBe(true);
  });

  it('strips MIME parameters and resolves the base type', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: 'text/plain; charset=utf-8' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toBe('text/plain');
  });

  it('strips MIME parameters for application/json', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: 'application/json; charset=utf-8' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toBe('application/json');
  });

  it('throws for unknown MIME type', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: 'application/xyzzy-nonexistent-9999' });
    expect(() => refMimeType.handler(input, ctx)).toThrow(/not found/i);
  });

  it('throws for unknown extension', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    const input = refMimeType.input.parse({ query: '.xyzzy_unknown_ext' });
    expect(() => refMimeType.handler(input, ctx)).toThrow(/No MIME type found/);
  });

  it('returns alternatives for extension with multiple types', async () => {
    const ctx = createMockContext({ errors: refMimeType.errors });
    // .ts maps to video/mp2t (IANA) — may have alternatives depending on mime-db
    const input = refMimeType.input.parse({ query: '.ts' });
    const result = await refMimeType.handler(input, ctx);
    expect(result.type).toBeTruthy();
    // alternatives is optional — just verify it's an array when present
    if (result.alternatives) {
      expect(Array.isArray(result.alternatives)).toBe(true);
    }
  });

  it('formats output with type, extensions, and compressible', () => {
    const output = {
      type: 'application/json',
      extensions: ['json'],
      compressible: true,
      source: 'iana',
    };
    const blocks = refMimeType.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('application/json');
    expect(text).toContain('.json');
    expect(text).toContain('Yes');
    expect(text).toContain('iana');
  });

  it('formats null compressible as Unknown', () => {
    const output = {
      type: 'application/octet-stream',
      extensions: ['bin'],
      compressible: null,
      source: 'iana',
    };
    const blocks = refMimeType.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('Unknown');
  });

  it('formats alternatives when present', () => {
    const output = {
      type: 'text/javascript',
      extensions: ['js'],
      compressible: true,
      source: 'iana',
      alternatives: [{ type: 'application/javascript', source: 'iana' }],
    };
    const blocks = refMimeType.format!(output);
    const text = expectText(blocks);
    expect(text).toContain('Alternative types');
    expect(text).toContain('application/javascript');
  });
});
