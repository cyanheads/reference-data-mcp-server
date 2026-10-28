/** @fileoverview Guards dependency runtime modules against MCPB cleanup. @module tests/scripts/mcpb-runtime */
import { describe, expect, it } from 'vitest';
import { filterAgentDocEntries } from '../../scripts/clean-mcpb.js';
import { checkBundleEntries } from '../../scripts/lint-packaging.js';

describe('MCPB dependency documentation selection', () => {
  it('keeps SDK skill runtime modules while removing package-root agent docs', () => {
    const runtime = [
      'node_modules/@modelcontextprotocol/server/dist/ext/skills/loader.js',
      'node_modules/@modelcontextprotocol/server/dist/ext/skills/index.js',
      'node_modules/other/dist/skills/runtime.js',
    ];
    const docs = [
      'node_modules/@cyanheads/mcp-ts-core/framework-skills/add-tool/SKILL.md',
      'node_modules/other/skills/example/SKILL.md',
      'node_modules/other/.claude/instructions.md',
    ];
    expect(filterAgentDocEntries([...runtime, ...docs])).toEqual(docs);
    expect(checkBundleEntries(runtime, 'fixture.mcpb')).toEqual([]);
    expect(checkBundleEntries(docs, 'fixture.mcpb').length).toBeGreaterThan(0);
  });
});
