/**
 * @fileoverview MIME type service — lookup by type string or file extension.
 * @module services/mime/mime-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import mimeDb from 'mime-db';

type MimeEntry = { extensions?: string[]; compressible?: boolean; source?: string };
const db = mimeDb as Record<string, MimeEntry>;

export interface MimeResult {
  alternatives?: Array<{ type: string; source: string | null }>;
  compressible: boolean | null;
  extensions: string[];
  source: string | null;
  type: string;
}

export class MimeService {
  private readonly byExtension: Map<string, string[]>; // ext → [mime types]

  constructor() {
    this.byExtension = new Map();
    for (const [type, info] of Object.entries(db)) {
      for (const ext of info.extensions ?? []) {
        const existing = this.byExtension.get(ext) ?? [];
        existing.push(type);
        this.byExtension.set(ext, existing);
      }
    }
  }

  lookup(query: string, ctx: Context): MimeResult | undefined {
    ctx.log.debug('MIME lookup', { query });

    // Normalize: strip leading dot
    const normalized = query.startsWith('.') ? query.slice(1) : query;

    // Check if it looks like a MIME type (contains '/')
    if (normalized.includes('/')) {
      // Strip MIME parameters (e.g., "; charset=utf-8") before lookup — agents commonly
      // pass full Content-Type strings directly.
      const baseType = (normalized.split(';')[0] ?? normalized).trim().toLowerCase();
      const info = db[baseType];
      if (!info) return;
      return {
        type: baseType,
        extensions: info.extensions ?? [],
        compressible: info.compressible ?? null,
        source: info.source ?? null,
      };
    }

    // Extension lookup
    const ext = normalized.toLowerCase();
    const types = this.byExtension.get(ext);
    if (!types) return;

    const primary = types[0];
    if (!primary) return;
    const primaryInfo = db[primary];
    const alternatives = types.slice(1).map((t) => ({
      type: t,
      source: db[t]?.source ?? null,
    }));

    const mimeResult: MimeResult = {
      type: primary,
      extensions: primaryInfo?.extensions ?? [ext],
      compressible: primaryInfo?.compressible ?? null,
      source: primaryInfo?.source ?? null,
    };
    if (alternatives.length > 0) mimeResult.alternatives = alternatives;
    return mimeResult;
  }
}

// --- Init/accessor pattern ---

let _service: MimeService | undefined;

export function initMimeService(): void {
  _service = new MimeService();
}

export function getMimeService(): MimeService {
  if (!_service) throw new Error('MimeService not initialized — call initMimeService() in setup()');
  return _service;
}
