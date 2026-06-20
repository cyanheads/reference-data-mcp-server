# reference-data-mcp-server - Directory Structure

Generated on: 2026-06-20 18:05:20

```text
reference-data-mcp-server/
├── .claude-plugin/
│   └── plugin.json
├── .codex-plugin/
│   ├── mcp.json
│   └── plugin.json
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   ├── config.yml
│   │   └── feature_request.yml
│   └── FUNDING.yml
├── .vscode/
│   ├── extensions.json
│   └── settings.json
├── changelog/
│   ├── 0.1.x/
│   └── template.md
├── docs/
│   ├── design.md
│   └── idea.md
├── scripts/
│   ├── build-changelog.ts
│   ├── build.ts
│   ├── check-dependency-specifiers.ts
│   ├── check-docs-sync.ts
│   ├── check-framework-antipatterns.ts
│   ├── check-skill-versions.ts
│   ├── check-skills-sync.ts
│   ├── clean-mcpb.ts
│   ├── clean.ts
│   ├── devcheck.ts
│   ├── lint-mcp.ts
│   ├── lint-packaging.ts
│   ├── list-skills.ts
│   ├── release-github.ts
│   └── tree.ts
├── skills/
│   ├── add-app-tool/
│   │   └── SKILL.md
│   ├── add-prompt/
│   │   └── SKILL.md
│   ├── add-resource/
│   │   └── SKILL.md
│   ├── add-service/
│   │   └── SKILL.md
│   ├── add-test/
│   │   └── SKILL.md
│   ├── add-tool/
│   │   └── SKILL.md
│   ├── api-auth/
│   │   └── SKILL.md
│   ├── api-canvas/
│   │   └── SKILL.md
│   ├── api-config/
│   │   └── SKILL.md
│   ├── api-context/
│   │   └── SKILL.md
│   ├── api-errors/
│   │   └── SKILL.md
│   ├── api-linter/
│   │   └── SKILL.md
│   ├── api-mirror/
│   │   └── SKILL.md
│   ├── api-services/
│   │   ├── references/
│   │   │   ├── graph.md
│   │   │   ├── llm.md
│   │   │   └── speech.md
│   │   └── SKILL.md
│   ├── api-telemetry/
│   │   └── SKILL.md
│   ├── api-testing/
│   │   └── SKILL.md
│   ├── api-utils/
│   │   ├── references/
│   │   │   ├── formatting.md
│   │   │   ├── parsing.md
│   │   │   └── security.md
│   │   └── SKILL.md
│   ├── api-workers/
│   │   └── SKILL.md
│   ├── code-simplifier/
│   │   └── SKILL.md
│   ├── design-mcp-server/
│   │   └── SKILL.md
│   ├── field-test/
│   │   └── SKILL.md
│   ├── git-wrapup/
│   │   └── SKILL.md
│   ├── maintenance/
│   │   └── SKILL.md
│   ├── orchestrations/
│   │   ├── workflows/
│   │   │   ├── field-test-fix.md
│   │   │   ├── fix-wrapup-release.md
│   │   │   ├── greenfield-build.md
│   │   │   └── maintenance-release.md
│   │   └── SKILL.md
│   ├── polish-docs-meta/
│   │   ├── references/
│   │   │   ├── agent-protocol.md
│   │   │   ├── package-meta.md
│   │   │   ├── readme.md
│   │   │   └── server-json.md
│   │   └── SKILL.md
│   ├── release-and-publish/
│   │   └── SKILL.md
│   ├── report-issue-framework/
│   │   └── SKILL.md
│   ├── report-issue-local/
│   │   └── SKILL.md
│   ├── security-pass/
│   │   └── SKILL.md
│   ├── setup/
│   │   └── SKILL.md
│   ├── techniques/
│   │   ├── references/
│   │   │   └── outline-on-overflow.md
│   │   └── SKILL.md
│   └── tool-defs-analysis/
│       └── SKILL.md
├── src/
│   ├── data/
│   ├── mcp-server/
│   │   ├── prompts/
│   │   │   └── definitions/
│   │   ├── resources/
│   │   │   └── definitions/
│   │   │       ├── ref-countries.resource.ts
│   │   │       ├── ref-elements.resource.ts
│   │   │       └── ref-timezones.resource.ts
│   │   └── tools/
│   │       └── definitions/
│   │           ├── ref-constant-lookup.tool.ts
│   │           ├── ref-element-lookup.tool.ts
│   │           ├── ref-element-search.tool.ts
│   │           ├── ref-geo-lookup.tool.ts
│   │           ├── ref-geo-search.tool.ts
│   │           ├── ref-http-status.tool.ts
│   │           ├── ref-mime-type.tool.ts
│   │           ├── ref-timezone-convert.tool.ts
│   │           ├── ref-timezone-lookup.tool.ts
│   │           └── ref-unit-convert.tool.ts
│   ├── services/
│   │   ├── constants/
│   │   │   └── constants-service.ts
│   │   ├── elements/
│   │   │   ├── elements-service.ts
│   │   │   └── types.ts
│   │   ├── geo/
│   │   │   ├── geo-service.ts
│   │   │   └── types.ts
│   │   ├── http-status/
│   │   │   └── http-status-service.ts
│   │   ├── mime/
│   │   │   └── mime-service.ts
│   │   ├── timezone/
│   │   │   ├── timezone-service.ts
│   │   │   └── types.ts
│   │   └── units/
│   │       └── units-service.ts
│   ├── types/
│   │   └── convert-units.d.ts
│   └── index.ts
├── tests/
│   ├── prompts/
│   ├── resources/
│   │   ├── ref-countries.resource.test.ts
│   │   ├── ref-elements.resource.test.ts
│   │   └── ref-timezones.resource.test.ts
│   ├── security/
│   │   └── injection-and-edge-cases.test.ts
│   └── tools/
│       ├── ref-constant-lookup.tool.test.ts
│       ├── ref-element-lookup.tool.test.ts
│       ├── ref-element-search.tool.test.ts
│       ├── ref-geo-lookup.tool.test.ts
│       ├── ref-geo-search.tool.test.ts
│       ├── ref-http-status.tool.test.ts
│       ├── ref-mime-type.tool.test.ts
│       ├── ref-timezone-convert.tool.test.ts
│       ├── ref-timezone-lookup.tool.test.ts
│       └── ref-unit-convert.tool.test.ts
├── .dockerignore
├── .env.example
├── .gitignore
├── .mcpbignore
├── AGENTS.md
├── biome.json
├── bun.lock
├── bunfig.toml
├── CHANGELOG.md
├── CITATION.cff
├── CLAUDE.md
├── devcheck.config.json
├── Dockerfile
├── LICENSE
├── manifest.json
├── package.json
├── README.md
├── server.json
├── tsconfig.build.json
├── tsconfig.json
└── vitest.config.ts
```

_Note: This tree excludes files and directories matched by .gitignore and default patterns._
