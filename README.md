<div align="center">
  <h1>@cyanheads/reference-data-mcp-server</h1>
  <p><b>Look up countries, timezones, periodic table elements, physical constants, units, HTTP status codes, and MIME types via MCP. STDIO or Streamable HTTP.</b>
  <div>10 Tools • 3 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.16-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/reference-data-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^2.0.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/reference-data-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/reference-data-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^7.0.2-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.4.0-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/reference-data-mcp-server/releases/latest/download/reference-data-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=reference-data-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvcmVmZXJlbmNlLWRhdGEtbWNwLXNlcnZlciJdfQ==) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22reference-data-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Freference-data-mcp-server%22%5D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

<div align="center">

**Public Hosted Server:** [https://reference-data.caseyjhand.com/mcp](https://reference-data.caseyjhand.com/mcp)

</div>

---

## Overview

Countries, timezones, periodic table elements, physical constants, units, HTTP status codes, and MIME types — all served from static, in-memory datasets, entirely offline with no API keys or rate limits. Look up, search, and convert across these domains from any MCP client. Runs as a stdio process, a local Streamable HTTP server, or the public hosted endpoint above.

### Tools

| Tool | Description |
|:---|:---|
| `ref_geo_lookup` | Look up a country by name, ISO alpha-2, or alpha-3 code. |
| `ref_geo_search` | Search and filter countries by region, subregion, language, or currency. |
| `ref_timezone_lookup` | Get timezone info by IANA ID, country code, or city name. |
| `ref_timezone_convert` | Convert a local datetime from one timezone to another. |
| `ref_element_lookup` | Look up a periodic table element by name, symbol, or atomic number. |
| `ref_element_search` | Filter periodic table elements by category, group, period, or property range. |
| `ref_constant_lookup` | Look up a CODATA 2022 physical constant by name, symbol, or alias. |
| `ref_unit_convert` | Convert a numeric value between compatible units of measure. |
| `ref_http_status` | Look up an HTTP status code by number or keyword. |
| `ref_mime_type` | Look up a MIME type by type string or file extension. |

### Resources

| Resource | Description |
|:---|:---|
| `ref://countries/{alpha2}` | Full country record by ISO alpha-2 code. |
| `ref://elements/{number}` | Full element record by atomic number. |
| `ref://timezones/{iana_id}` | Timezone info by IANA ID (slashes percent-encoded as `%2F`). |

All resource data is also reachable via tools — use `ref_geo_lookup`, `ref_element_lookup`, and `ref_timezone_lookup` when you need flexible query modes or country search.

---

## Capability reference

### `ref_geo_lookup` <sub>tool</sub>

- Accepts fuzzy name matching ("Brasil" resolves to "Brazil"); a fuzzy hit adds an enrichment notice naming the canonical result
- Lookup modes: `auto` (alpha2 → alpha3 → name), `name`, `alpha2`, `alpha3`; numeric ISO codes are not supported
- Returns capital, region/subregion, languages, currencies, calling codes, TLD, flag emoji, and IANA timezone IDs

---

### `ref_geo_search` <sub>tool</sub>

- At least one filter required (`no_filters` error otherwise): keyword (name, native name, capital, subregion), region, subregion, language (ISO 639-1 code or name), or currency (ISO 4217 code or name)
- Limit 1–100 (default 20); `truncated` flag and `totalMatches` count when results are cut off
- Empty result set returns a notice echoing the applied filters

---

### `ref_timezone_lookup` <sub>tool</sub>

- Lookup modes: `auto` (IANA ID → country code → city name), `iana`, `country`; partial city matching ("Tokyo" → "Asia/Tokyo", "NY" → "America/New_York")
- Country-code queries return every timezone observed in that country
- Optional `at` (ISO 8601) evaluates DST state at a specific moment instead of now; malformed values raise `invalid_at`
- Returns current/standard UTC offsets, DST status and abbreviations, major cities, and country codes

---

### `ref_timezone_convert` <sub>tool</sub>

- `datetime` must be a local ISO 8601 string without an offset (regex-enforced, e.g. `2026-05-24T15:30:00`); `from_tz`/`to_tz` accept full IANA IDs or unambiguous city names
- Rejects out-of-range calendar dates and spring-forward DST gaps as `invalid_datetime`; unrecognized zones as `invalid_timezone`
- Returns source and target local datetimes with their respective UTC offsets, plus the UTC equivalent

---

### `ref_element_lookup` <sub>tool</sub>

- Lookup modes: `auto` (atomic number → symbol → name), `name`, `symbol`, `number`
- Full property set: atomic mass (`atomic_mass_estimated` flag), electron configuration, group/period/block, category, Pauling electronegativity, density, melting/boiling points in kelvin, phase at STP, radioactivity, natural occurrence, discovery data
- Data sourced from PubChem/IUPAC 2024; synthetic or unstable elements return `null` for experimentally inaccessible properties

---

### `ref_element_search` <sub>tool</sub>

- At least one filter required (`no_filters` error otherwise): category (partial match), group (1–18), period (1–7), atomic-number range, or atomic-mass range
- Valid categories: alkali metal, alkaline earth metal, transition metal, post-transition metal, metalloid, reactive nonmetal, noble gas, lanthanide, actinide
- Returns summaries (atomic number, symbol, name, mass, category) plus a `totalMatches` count and a notice when nothing matches

---

### `ref_constant_lookup` <sub>tool</sub>

- Fuzzy alias matching: "speed of light", "c", "Avogadro's number", "N_A", "Planck", "h", "Boltzmann", "k_B" all resolve against 32 CODATA 2022 constants
- `match_strategy` discriminates how the query resolved: `exact_symbol`, `exact_name`, or `fuzzy` (closest candidate — verify before reuse)
- Returns value, SI unit expression, absolute/relative uncertainty (`exact` flag for defined constants), CODATA identifier, and up to 3 related constants

---

### `ref_unit_convert` <sub>tool</sub>

- 11 measurement domains: length, mass, volume, temperature (non-linear C/F/K/R), speed, pressure, energy, power, frequency, digital storage, angle
- Mass `mt` is the metric tonne (1000 kg); `t` is the US short ton (907.18 kg) — distinct units, easily confused
- Typed errors: `incompatible_units` (mismatched quantities), `unknown_unit` (unrecognized abbreviation), `below_absolute_zero` (with the Kelvin equivalent)

---

### `ref_http_status` <sub>tool</sub>

- Numeric queries (e.g., "404") return an exact match; keyword queries (e.g., "not found", "too many requests") return the closest match plus alternatives
- Returns reason phrase, description, category (1xx–5xx), cacheability per RFC 9110, and the defining RFC with section reference

---

### `ref_mime_type` <sub>tool</sub>

- Accepts "image/webp", ".webp", or "webp" interchangeably
- Extension lookups return the canonical MIME type first; additional types sharing the extension are listed as alternatives
- Returns extensions, a compressibility flag (relevant for Content-Encoding decisions), and the data source (iana/apache/nginx)

---

### `ref://countries/{alpha2}` <sub>resource</sub>

- Full country record as `application/json` — same fields as `ref_geo_lookup`
- `alpha2` accepts either case; an unmatched code returns a `notFound` error

---

### `ref://elements/{number}` <sub>resource</sub>

- Full element record as `application/json` — same fields as `ref_element_lookup`
- `number` must be an integer string 1–118; out-of-range or unmatched values return `notFound`

---

### `ref://timezones/{iana_id}` <sub>resource</sub>

- Timezone record as `application/json` — same fields as `ref_timezone_lookup`, plus `evaluated_at`
- Slashes in the IANA ID must be percent-encoded as `%2F` (e.g. `America%2FNew_York`); an unencoded slash matches a separate catch-all that returns an actionable error with the correctly encoded URI

---

## Features

Built on [`@cyanheads/mcp-ts-core`](https://github.com/cyanheads/mcp-ts-core): stdio and Streamable HTTP transports, pluggable auth (`none` / `jwt` / `oauth`), swappable storage (`in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`), structured logging with optional OpenTelemetry tracing.

Reference-data-specific:

- Entirely in-memory — all datasets load at startup; no runtime network calls, no API keys, no rate limits
- Works offline and in air-gapped environments
- Seven specialized services: geo (countries-list), timezone (Node.js Intl + @vvo/tzdb), elements (PubChem/IUPAC 2024, 118 elements), constants (CODATA 2022, 32 entries), units (convert-units), HTTP status (IANA registry), MIME types (mime-db, ~1,000 types)

Agent-friendly output:

- Structured error contracts on every tool — typed `reason` codes (`no_match`, `no_filters`, `unknown_unit`, `incompatible_units`, `below_absolute_zero`, `invalid_timezone`, `invalid_datetime`, `invalid_at`) with actionable recovery hints
- Discriminated outputs where relevant — `truncated` flag on search results, `alternatives` arrays on MIME/HTTP keyword matches, `atomic_mass_estimated` flag on element data, `match_strategy` on constant lookups
- Consistent `null` for genuinely unknown or inapplicable values rather than absent fields

---

## Getting started

### Public Hosted Instance

A public instance is available at `https://reference-data.caseyjhand.com/mcp` — no installation required. Point any MCP client at it via Streamable HTTP:

```json
{
  "mcpServers": {
    "reference-data-mcp-server": {
      "type": "streamable-http",
      "url": "https://reference-data.caseyjhand.com/mcp"
    }
  }
}
```

### Self-Hosted / Local

Add the following to your MCP client configuration file:

```json
{
  "mcpServers": {
    "reference-data-mcp-server": {
      "type": "stdio",
      "command": "bunx",
      "args": ["@cyanheads/reference-data-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

Or with npx (no Bun required):

```json
{
  "mcpServers": {
    "reference-data-mcp-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cyanheads/reference-data-mcp-server@latest"],
      "env": {
        "MCP_TRANSPORT_TYPE": "stdio",
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

Or with Docker:

```json
{
  "mcpServers": {
    "reference-data-mcp-server": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "MCP_TRANSPORT_TYPE=stdio",
        "ghcr.io/cyanheads/reference-data-mcp-server:latest"
      ]
    }
  }
}
```

For Streamable HTTP, set the transport and start the server:

```sh
MCP_TRANSPORT_TYPE=http MCP_HTTP_PORT=3010 bun run start:http
# Server listens at http://localhost:3010/mcp
```

### Prerequisites

- [Bun v1.4.0](https://bun.sh/) or higher (or Node.js v24+).
- No API keys required — this server is entirely self-contained.

### Installation

1. **Clone the repository:**

```sh
git clone https://github.com/cyanheads/reference-data-mcp-server.git
```

2. **Navigate into the directory:**

```sh
cd reference-data-mcp-server
```

3. **Install dependencies:**

```sh
bun install
```

4. **Configure environment (optional):**

```sh
cp .env.example .env
# edit .env if you want to override transport or logging defaults
```

---

## Configuration

No API keys are required. All configuration is optional overrides of framework defaults.

| Variable | Description | Default |
|:---------|:------------|:--------|
| `MCP_TRANSPORT_TYPE` | Transport: `stdio` or `http`. | `stdio` |
| `MCP_HTTP_PORT` | Port for HTTP server. | `3010` |
| `MCP_HTTP_HOST` | Host for HTTP server. | `127.0.0.1` |
| `MCP_SESSION_MODE` | Session mode: `stateful`, `stateless`, or `auto` (schema default `auto` resolves to stateful). | `stateless` |
| `MCP_AUTH_MODE` | Auth mode: `none`, `jwt`, or `oauth`. | `none` |
| `MCP_LOG_LEVEL` | Log level (RFC 5424): `debug`, `info`, `notice`, `warning`, `error`. | `info` |
| `LOGS_DIR` | Directory for log files (Node.js only). | `<project-root>/logs` |
| `OTEL_ENABLED` | Enable OpenTelemetry instrumentation (spans, metrics, completion logs). | `false` |

See [`.env.example`](./.env.example) for the full list of optional overrides.

---

## Running the server

### Local development

```sh
# One-time build
bun run rebuild

# Run the built server
bun run start:stdio
# or
bun run start:http
```

```sh
bun run devcheck   # Lint, format, typecheck, security
bun run test       # Vitest test suite
bun run lint:mcp   # Validate MCP definitions against spec
```

### Docker

```sh
docker build -t reference-data-mcp-server .
docker run --rm -p 3010:3010 reference-data-mcp-server
```

The Dockerfile defaults to HTTP transport, stateless session mode, and logs to `/var/log/reference-data-mcp-server`. OpenTelemetry peer dependencies are installed by default — build with `--build-arg OTEL_ENABLED=false` to omit them.

---

## Project structure

| Directory | Purpose |
|:----------|:--------|
| `src/index.ts` | `createApp()` entry point — registers tools/resources and inits services. |
| `src/data/` | Static datasets (periodic table, physical constants, HTTP status codes). |
| `src/mcp-server/tools/` | Tool definitions (`*.tool.ts`). |
| `src/mcp-server/resources/` | Resource definitions (`*.resource.ts`). |
| `src/services/` | Domain service integrations (geo, timezone, elements, constants, units, http-status, mime). |
| `tests/` | Unit tests mirroring `src/`. |
| `docs/` | Generated docs (tree.md, design.md). |
| `changelog/` | Per-version changelog files. |

---

## Development guide

See [`CLAUDE.md`](./CLAUDE.md) for development guidelines and architectural rules. The short version:

- Handlers throw, framework catches — no `try/catch` in tool logic
- Use `ctx.log` for request-scoped logging, `ctx.state` for tenant-scoped storage
- Register new tools and resources directly in `src/index.ts`
- Data integrity: validate raw → normalize to domain type → return output schema; never fabricate missing fields

---

## Contributing

Issues are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

---

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.
