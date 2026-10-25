/**
 * @fileoverview Caller text stays literal in search enrichment renderers.
 * @module tests/tools/enrichment-markdown.test
 */

import { runToolContract } from '@cyanheads/mcp-ts-core/testing';
import MarkdownIt from 'markdown-it';
import { beforeAll, describe, expect, it } from 'vitest';
import { refElementSearch } from '@/mcp-server/tools/definitions/ref-element-search.tool.js';
import { refGeoSearch } from '@/mcp-server/tools/definitions/ref-geo-search.tool.js';
import { initElementsService } from '@/services/elements/elements-service.js';
import { initGeoService } from '@/services/geo/geo-service.js';
import { initTimezoneService } from '@/services/timezone/timezone-service.js';

beforeAll(() => {
  initTimezoneService();
  initGeoService();
  initElementsService();
});

describe('enrichment Markdown', () => {
  it('keeps country filters raw in structured output and literal in both trailer lines', async () => {
    const result = await runToolContract(refGeoSearch, {
      keyword: '*missing* [x](https://example.com)',
    });
    expect(result.structuredContent).toMatchObject({
      appliedFilters: { keyword: '*missing* [x](https://example.com)' },
      notice:
        'No countries matched filters: keyword="*missing* [x](https://example.com)". Try broadening your search by removing or changing a filter.',
    });
    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const tokens = new MarkdownIt('commonmark').parse(text, {});
    const inline = tokens.flatMap((token) => token.children ?? []);
    expect(inline.some((token) => token.type === 'link_open' || token.type === 'em_open')).toBe(
      false,
    );
    expect(
      inline
        .filter((token) => token.type === 'text' && token.content !== '')
        .map((token) => token.content),
    ).toEqual([
      'Total Matches:',
      ' 0',
      'Truncated:',
      ' false',
      'Applied Filters:',
      ' keyword="*missing* [x](https://example.com)", limit=20',
      'No countries matched filters: keyword="*missing* [x](https://example.com)". Try broadening your search by removing or changing a filter.',
    ]);
  });

  it('keeps element filters raw in structured output and literal in both trailer lines', async () => {
    const result = await runToolContract(refElementSearch, {
      category: '*missing* [x](https://example.com)',
    });
    expect(result.structuredContent).toMatchObject({
      appliedFilters: { category: '*missing* [x](https://example.com)' },
      notice:
        'No elements matched filters: category="*missing* [x](https://example.com)". Try a broader category or wider range.',
    });
    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const tokens = new MarkdownIt('commonmark').parse(text, {});
    const inline = tokens.flatMap((token) => token.children ?? []);
    expect(inline.some((token) => token.type === 'link_open' || token.type === 'em_open')).toBe(
      false,
    );
    expect(
      inline
        .filter((token) => token.type === 'text' && token.content !== '')
        .map((token) => token.content),
    ).toEqual([
      'Total Matches:',
      ' 0',
      'Applied Filters:',
      ' category="*missing* [x](https://example.com)"',
      'No elements matched filters: category="*missing* [x](https://example.com)". Try a broader category or wider range.',
    ]);
  });
});
