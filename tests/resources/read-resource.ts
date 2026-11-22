/**
 * @fileoverview Sends JSON-RPC requests to definitions served the way the running server serves
 * them, through the framework's Worker handler, and reads resources that way: through the resource
 * handler factory (template match, parameter decoding, `params` validation, the declared error
 * contract), which a direct `handler()` call skips.
 * @module tests/resources/read-resource
 */

import { z } from '@cyanheads/mcp-ts-core';
import { logger } from '@cyanheads/mcp-ts-core/utils';
import { createWorkerHandler, type WorkerHandlerOptions } from '@cyanheads/mcp-ts-core/worker';
import { vi } from 'vitest';

const replySchema = z.object({
  result: z
    .object({ contents: z.array(z.object({ uri: z.string(), text: z.string() })) })
    .optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

/** One `resources/read` JSON-RPC reply. */
export type ResourceReply = z.infer<typeof replySchema>;

/** Sends one JSON-RPC request and resolves to its parsed reply. */
export type RequestSender = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

/**
 * Returns a sender that serves `options` from a Worker handler and posts each request as a
 * revision 2026-07-28 JSON-RPC call. `Mcp-Name` mirrors `params.name` (`tools/call`) or
 * `params.uri` (`resources/read`) when the request carries one.
 */
export function createRequestSender(options: WorkerHandlerOptions): RequestSender {
  const worker = createWorkerHandler(options);
  const executionContext = { waitUntil() {}, passThroughOnException() {}, props: {} };
  return async (method, params = {}) => {
    const name = params.name ?? params.uri;
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': method,
        ...(typeof name === 'string' && { 'Mcp-Name': name }),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params: {
          ...params,
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    });
    const response = await worker.fetch(request, {}, executionContext);
    const text = await response.text();
    const frame = text.trimStart().startsWith('{')
      ? text
      : text
          .split('\n')
          .find((line) => line.startsWith('data:'))
          ?.slice('data:'.length);
    if (frame === undefined) throw new Error(`No JSON-RPC reply in: ${text}`);
    return JSON.parse(frame);
  };
}

/** Sends `uri` as a `resources/read` through `send`. */
export async function readResource(send: RequestSender, uri: string): Promise<ResourceReply> {
  return replySchema.parse(await send('resources/read', { uri }));
}

/**
 * Returns a reader that serves `resources` from a Worker handler, with the `name` and
 * `decodeResourceParams` options `src/index.ts` passes to `createApp()`, and sends each URI as a
 * `resources/read`.
 */
export function createResourceReader(
  resources: NonNullable<WorkerHandlerOptions['resources']>,
): (uri: string) => Promise<ResourceReply> {
  const send = createRequestSender({
    name: 'reference-data-mcp-server',
    resources,
    decodeResourceParams: true,
  });
  return (uri) => readResource(send, uri);
}

const LOG_LEVELS = ['debug', 'info', 'notice', 'warning', 'error'] as const;

/** A level and message the framework logger was called with. */
export interface LogRecord {
  level: (typeof LOG_LEVELS)[number];
  message: string;
}

/**
 * Watches the framework logger — the one the resource handler factory writes its failure record
 * through — until `restore()`. `records()` returns each `Error in resource:<name>` call with its
 * level. The calls still reach the logger.
 */
export function watchResourceFailureLogs(): { records: () => LogRecord[]; restore: () => void } {
  const spies = LOG_LEVELS.map((level) => ({ level, spy: vi.spyOn(logger, level) }));
  return {
    records: () =>
      spies.flatMap(({ level, spy }) => {
        const calls: unknown[][] = spy.mock.calls;
        return calls
          .map(([message]) => message)
          .filter((message) => typeof message === 'string')
          .filter((message) => message.startsWith('Error in resource:'))
          .map((message) => ({ level, message }));
      }),
    restore: () => {
      for (const { spy } of spies) spy.mockRestore();
    },
  };
}
