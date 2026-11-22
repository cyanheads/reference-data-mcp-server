/**
 * @fileoverview Tests the options `src/index.ts` passes to `createApp()`. The entry point runs
 * against a capturing `createApp`, and the options it passed are served through the framework's
 * Worker handler: they must register every tool, initialize the services in `setup()`, and decode
 * resource parameters. No test here initializes a service itself.
 * @module tests/index.test
 */

import type * as Framework from '@cyanheads/mcp-ts-core';
import { createApp, z } from '@cyanheads/mcp-ts-core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createRequestSender,
  type RequestSender,
  readResource,
} from './resources/read-resource.js';

vi.mock('@cyanheads/mcp-ts-core', async (importOriginal) => ({
  ...(await importOriginal<typeof Framework>()),
  createApp: vi.fn(),
}));

const toolsListReply = z.object({
  result: z.object({ tools: z.array(z.object({ name: z.string() })) }),
});

let send: RequestSender;

beforeAll(async () => {
  await import('@/index.js');
  expect(createApp).toHaveBeenCalledTimes(1);
  const options = vi.mocked(createApp).mock.calls[0]?.[0];
  if (!options) throw new Error('src/index.ts called createApp() without options.');
  // A Worker reads skills from a record, not a folder, and has no shutdown to tear down.
  const { skills, teardown, ...served } = options;
  send = createRequestSender(served);
});

describe('the createApp() options in src/index.ts, served', () => {
  it('list the eleven tools in registration order, ref_unicode_lookup last', async () => {
    const reply = toolsListReply.parse(await send('tools/list'));
    expect(reply.result.tools.map((tool) => tool.name)).toEqual([
      'ref_geo_lookup',
      'ref_geo_search',
      'ref_timezone_lookup',
      'ref_timezone_convert',
      'ref_element_lookup',
      'ref_element_search',
      'ref_constant_lookup',
      'ref_unit_convert',
      'ref_http_status',
      'ref_mime_type',
      'ref_unicode_lookup',
    ]);
  });

  it('initialize the Unicode service in setup(): ref_unicode_lookup answers U+200B', async () => {
    const reply = await send('tools/call', {
      name: 'ref_unicode_lookup',
      arguments: { query: 'U+200B' },
    });
    expect(reply).toMatchObject({
      result: {
        structuredContent: {
          interpreted_as: 'code_point',
          code_points: [{ code_point: 'U+200B', decimal: 8203, name: 'ZERO WIDTH SPACE' }],
        },
      },
    });
  });

  it('decode resource parameters: ref://countries/%55%53 reads the United States', async () => {
    const reply = await readResource(send, 'ref://countries/%55%53');
    expect(reply.error).toBeUndefined();
    const record = JSON.parse(reply.result?.contents[0]?.text ?? '');
    expect(record).toMatchObject({ alpha2: 'US', name: 'United States' });
  });
});
