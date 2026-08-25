/**
 * @fileoverview Narrowing helpers for framework handler and content result unions in tests.
 * @module tests/test-helpers
 */

import type { ContentBlock } from '@cyanheads/mcp-ts-core';

/** Returns a synchronous handler result and fails if the implementation becomes asynchronous. */
export function expectSync<T>(value: T | Promise<T>): T {
  if (value instanceof Promise) throw new TypeError('Expected a synchronous handler result.');
  return value;
}

/** Returns a numeric value after enforcing its runtime type. */
export function expectNumber(value: unknown): number {
  if (typeof value !== 'number') throw new TypeError('Expected a number.');
  return value;
}

/** Returns an object value after enforcing its runtime type. */
export function expectRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Expected an object.');
  }
  return value as Record<string, unknown>;
}

/** Returns the first formatted text block, failing if the formatter emitted another kind. */
export function expectText(blocks: ContentBlock[]): string {
  const [block] = blocks;
  if (block?.type !== 'text') throw new TypeError('Expected a text content block.');
  return block.text;
}
