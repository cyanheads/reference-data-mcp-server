/**
 * @fileoverview HTTP status code service — lookup by code or description keyword.
 * @module services/http-status/http-status-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import type { HttpStatusCode } from '../../data/http-status-codes.js';
import { DATASET_VERSION, httpStatusCodes } from '../../data/http-status-codes.js';

export type { HttpStatusCode };
export { DATASET_VERSION };

export interface HttpStatusResult {
  alternatives?: Array<{ code: number; reason_phrase: string; category: string }>;
  cacheable: boolean;
  category: string;
  code: number;
  description: string;
  reason_phrase: string;
  rfc: string;
  rfc_section: string | null;
}

export class HttpStatusService {
  private readonly byCode: Map<number, HttpStatusCode>;
  private readonly all: HttpStatusCode[];

  constructor() {
    this.all = httpStatusCodes;
    this.byCode = new Map();
    for (const s of httpStatusCodes) {
      this.byCode.set(s.code, s);
    }
  }

  lookup(query: string | number, ctx: Context): HttpStatusResult | undefined {
    ctx.log.debug('HTTP status lookup', { query });

    const queryStr = String(query).trim();
    // Only treat as a numeric code when the string is a plain integer — reject floats
    // like "404.5" that parseInt() would silently truncate.
    const isIntegerString = /^\d+$/.test(queryStr);
    const numQuery =
      typeof query === 'number'
        ? Number.isInteger(query)
          ? query
          : NaN
        : isIntegerString
          ? parseInt(queryStr, 10)
          : NaN;

    if (!Number.isNaN(numQuery)) {
      const status = this.byCode.get(numQuery);
      return status ? { ...status } : undefined;
    }

    // Keyword search
    const queryLower = String(query).toLowerCase();
    const matches = this.all.filter(
      (s) =>
        s.reason_phrase.toLowerCase().includes(queryLower) ||
        s.description.toLowerCase().includes(queryLower) ||
        s.category.toLowerCase().includes(queryLower),
    );

    const primary = matches[0];
    if (!primary) return;

    const altMatches = matches.slice(1).map((s) => ({
      code: s.code,
      reason_phrase: s.reason_phrase,
      category: s.category,
    }));

    const result: HttpStatusResult = { ...primary };
    if (altMatches.length > 0) result.alternatives = altMatches;
    return result;
  }

  getByCode(code: number): HttpStatusCode | undefined {
    return this.byCode.get(code);
  }
}

// --- Init/accessor pattern ---

let _service: HttpStatusService | undefined;

export function initHttpStatusService(): void {
  _service = new HttpStatusService();
}

export function getHttpStatusService(): HttpStatusService {
  if (!_service)
    throw new Error('HttpStatusService not initialized — call initHttpStatusService() in setup()');
  return _service;
}
