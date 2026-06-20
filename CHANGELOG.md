# Changelog

All notable changes to this project. Each entry links to its full per-version file in [changelog/](changelog/).

## [0.1.12](changelog/0.1.x/0.1.12.md) — 2026-06-20

Adopt @cyanheads/mcp-ts-core ^0.10.9; new dependency-specifier devcheck guard, plugin-manifest packaging checks, fresh-scaffold/worktree devcheck guards, synced framework skills.

## [0.1.11](changelog/0.1.x/0.1.11.md) — 2026-06-15

ref_constant_lookup surfaces a match_strategy field; ref_geo_lookup emits a fuzzy-match enrichment notice.

## [0.1.10](changelog/0.1.x/0.1.10.md) — 2026-06-12

Adopt @cyanheads/mcp-ts-core ^0.10.6; explicit createApp name/title identity; reclassify InvalidParams error contracts to ValidationError; Dockerfile HEALTHCHECK + version label; .mcpb bundle cleanup.

## [0.1.9](changelog/0.1.x/0.1.9.md) — 2026-06-04

Fix ref_unit_convert describe examples (mph→m/h, BTU→kJ); remove unreachable validation guards in timezone-service convert().

## [0.1.8](changelog/0.1.x/0.1.8.md) — 2026-06-02

Adopt @cyanheads/mcp-ts-core ^0.9.21: per-request log context fix, secret-scrubbing in fetchWithTimeout errors, withRetry fail-fast, ctx.fail retryable flag.

## [0.1.7](changelog/0.1.x/0.1.7.md) — 2026-05-30

enrichment adoption on ref_geo_search and ref_element_search — applied-filter echo, true match totals, and empty-result guidance in typed enrichment block

## [0.1.6](changelog/0.1.x/0.1.6.md) — 2026-05-28 · 🛡️ Security

mcp-ts-core ^0.9.9 → ^0.9.13: 413 body cap, HTTP session-init gate, quieter error logs, GET /mcp keywords; ValidationError reclassifications; dep refresh

## [0.1.5](changelog/0.1.x/0.1.5.md) — 2026-05-26

Add hosted server endpoint, FUNDING.yml, publish-mcp script, hosted URL badge

## [0.1.4](changelog/0.1.x/0.1.4.md) — 2026-05-24

Drop tsx, align all scripts to bun-native execution, revert Dockerfile build stage to oven/bun:1.3, add funding block

## [0.1.3](changelog/0.1.x/0.1.3.md) — 2026-05-24

Field-test fixes: 7 bugs resolved across tool definitions, service internals, and resource routing; 12 files simplified; 15 regression tests added

## [0.1.2](changelog/0.1.x/0.1.2.md) — 2026-05-24

Scope npm package to @cyanheads/reference-data-mcp-server; fix bundle script and author field

## [0.1.1](changelog/0.1.x/0.1.1.md) — 2026-05-24

Launch release — 10 tools, 3 resources, 7 services, 97 tests; field-test fixes across all domains

## [0.1.0](changelog/0.1.x/0.1.0.md) — 2026-05-24

Initial release — pure in-memory reference data server covering geo, timezone, elements, physical constants, units, HTTP status codes, and MIME types
