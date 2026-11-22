/**
 * @fileoverview Tests the options `src/index.ts` passes to `createApp()`. The entry point runs
 * against a capturing `createApp`, and the options it passed are served through the framework's
 * Worker handler: they must register every tool, initialize the services in `setup()`, and decode
 * resource parameters. No test here initializes a service itself.
 * @module tests/index.test
 */

import type * as Framework from '@cyanheads/mcp-ts-core';
import { createApp, z } from '@cyanheads/mcp-ts-core';
import { JsonRpcErrorCode } from '@cyanheads/mcp-ts-core/errors';
import { logger } from '@cyanheads/mcp-ts-core/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { GeoService } from '@/services/geo/geo-service.js';
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

const toolFailureReply = z.object({
  result: z.object({
    isError: z.literal(true),
    structuredContent: z.object({
      error: z.object({ code: z.number(), data: z.object({ reason: z.string() }) }),
    }),
    content: z.array(z.object({ text: z.string() })),
  }),
});

const toolFailureCodes = {
  no_match: JsonRpcErrorCode.NotFound,
  invalid_at: JsonRpcErrorCode.ValidationError,
  invalid_timezone: JsonRpcErrorCode.ValidationError,
  invalid_datetime: JsonRpcErrorCode.ValidationError,
  unknown_unit: JsonRpcErrorCode.ValidationError,
  incompatible_units: JsonRpcErrorCode.ValidationError,
  below_absolute_zero: JsonRpcErrorCode.ValidationError,
  no_filters: JsonRpcErrorCode.ValidationError,
  invalid_code_point: JsonRpcErrorCode.ValidationError,
} as const;

describe('tool failure severity', () => {
  it('logs unexpected service failures at error', async () => {
    using lookup = vi.spyOn(GeoService.prototype, 'lookup').mockImplementationOnce(() => {
      throw new Error('Reference dataset unavailable');
    });
    using log = vi.spyOn(logger, 'error');
    const reply = await send('tools/call', { name: 'ref_geo_lookup', arguments: { query: 'US' } });
    expect(lookup).toHaveBeenCalledOnce();
    expect(reply).toMatchObject({ result: { isError: true } });
    expect(log.mock.calls.map(([message]) => message)).toContainEqual(
      expect.stringContaining('Error in tool:ref_geo_lookup'),
    );
  });

  it.each<[string, Record<string, unknown>, keyof typeof toolFailureCodes]>([
    ['ref_geo_lookup', { query: 'Atlantis' }, 'no_match'],
    ['ref_element_lookup', { query: 'Unobtainium' }, 'no_match'],
    ['ref_constant_lookup', { query: 'fictional constant xxzz' }, 'no_match'],
    ['ref_http_status', { query: '999' }, 'no_match'],
    ['ref_mime_type', { query: 'application/x-fictional-example' }, 'no_match'],
    ['ref_timezone_lookup', { query: 'Fictional City' }, 'no_match'],
    ['ref_timezone_lookup', { query: 'Tokyo', at: '2026-13-01T15:30:00Z' }, 'invalid_at'],
    [
      'ref_timezone_convert',
      { from_tz: 'Fictional City', to_tz: 'UTC', datetime: '2026-05-24T15:30:00' },
      'invalid_timezone',
    ],
    [
      'ref_timezone_convert',
      { from_tz: 'UTC', to_tz: 'UTC', datetime: '2026-02-30T15:30:00' },
      'invalid_datetime',
    ],
    ['ref_unit_convert', { from: 'fictional', to: 'kg', value: 1 }, 'unknown_unit'],
    ['ref_unit_convert', { from: 'km', to: 'kg', value: 1 }, 'incompatible_units'],
    ['ref_unit_convert', { from: 'K', to: 'C', value: -1 }, 'below_absolute_zero'],
    ['ref_geo_search', {}, 'no_filters'],
    ['ref_element_search', {}, 'no_filters'],
    ['ref_unicode_lookup', { query: 'U+110000' }, 'invalid_code_point'],
  ])('%s with %j logs %s at notice', async (name, args, reason) => {
    using notice = vi.spyOn(logger, 'notice');
    using error = vi.spyOn(logger, 'error');
    const { result } = toolFailureReply.parse(await send('tools/call', { name, arguments: args }));
    expect(result.structuredContent.error).toEqual({
      code: toolFailureCodes[reason],
      data: { reason },
    });
    expect(result.content.map(({ text }) => text)).toEqual([expect.stringContaining(reason)]);
    const failure = expect.stringContaining(`Error in tool:${name}`);
    expect(notice.mock.calls.map(([message]) => message)).toContainEqual(failure);
    expect(error.mock.calls.map(([message]) => message)).not.toContainEqual(failure);
  });
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
  it('advertises and routes both timezone catch template depths', async () => {
    expect(await send('resources/templates/list')).toMatchObject({
      result: {
        resourceTemplates: expect.arrayContaining([
          expect.objectContaining({ uriTemplate: 'ref://timezones/{iana_id}' }),
          expect.objectContaining({ uriTemplate: 'ref://timezones/{region}/{city}' }),
          expect.objectContaining({ uriTemplate: 'ref://timezones/{region}/{subregion}/{city}' }),
        ]),
      },
    });
    const reply = await readResource(send, 'ref://timezones/America/Argentina/Buenos_Aires');
    expect(reply.error?.data).toMatchObject({
      reason: 'unencoded_slash',
      encoded_uri: 'ref://timezones/America%2FArgentina%2FBuenos_Aires',
    });
  });

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

  it.each([
    ['2024-02-29T23:30:00-02:00', '2024-03-01T01:30:00.000Z'],
    ['2026-02-30T23:30:00-02:00', null],
    ['2025-02-29', null],
    ['2026-04-31T12:00:00Z', null],
  ])('checks the written calendar date before applying the offset in %s', async (at, expected) => {
    const reply = await send('tools/call', {
      name: 'ref_timezone_lookup',
      arguments: { query: 'UTC', at },
    });
    if (expected) {
      expect(reply).toMatchObject({ result: { structuredContent: { evaluated_at: expected } } });
    } else {
      expect(reply).toMatchObject({
        result: {
          isError: true,
          structuredContent: { error: { data: { reason: 'invalid_at' } } },
          content: [expect.objectContaining({ text: expect.stringContaining('invalid_at') })],
        },
      });
    }
  });

  it('decode resource parameters: ref://countries/%55%53 reads the United States', async () => {
    const reply = await readResource(send, 'ref://countries/%55%53');
    expect(reply.error).toBeUndefined();
    const record = JSON.parse(reply.result?.contents[0]?.text ?? '');
    expect(record).toMatchObject({ alpha2: 'US', name: 'United States' });
  });
});
