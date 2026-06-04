<div align="center">
  <h1>@cyanheads/reference-data-mcp-server</h1>
  <p><b>Look up countries, timezones, periodic table elements, physical constants, units, HTTP status codes, and MIME types via MCP. STDIO or Streamable HTTP.</b>
  <div>10 Tools • 3 Resources</div>
  </p>
</div>

<div align="center">

[![Version](https://img.shields.io/badge/Version-0.1.9-blue.svg?style=flat-square)](./CHANGELOG.md) [![License](https://img.shields.io/badge/License-Apache%202.0-orange.svg?style=flat-square)](./LICENSE) [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?style=flat-square&logo=docker&logoColor=white)](https://github.com/users/cyanheads/packages/container/package/reference-data-mcp-server) [![MCP SDK](https://img.shields.io/badge/MCP%20SDK-^1.29.0-green.svg?style=flat-square)](https://modelcontextprotocol.io/) [![npm](https://img.shields.io/npm/v/@cyanheads/reference-data-mcp-server?style=flat-square&logo=npm&logoColor=white)](https://www.npmjs.com/package/@cyanheads/reference-data-mcp-server) [![TypeScript](https://img.shields.io/badge/TypeScript-^6.0.3-3178C6.svg?style=flat-square)](https://www.typescriptlang.org/) [![Bun](https://img.shields.io/badge/Bun-v1.3.11-blueviolet.svg?style=flat-square)](https://bun.sh/)

</div>

<div align="center">

[![Install in Claude Desktop](https://img.shields.io/badge/Install_in-Claude_Desktop-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](https://github.com/cyanheads/reference-data-mcp-server/releases/latest/download/reference-data-mcp-server.mcpb) [![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=reference-data-mcp-server&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBjeWFuaGVhZHMvcmVmZXJlbmNlLWRhdGEtbWNwLXNlcnZlciJdfQ==) [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_Server-0098FF?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22reference-data-mcp-server%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40cyanheads%2Freference-data-mcp-server%22%5D%7D)

[![Framework](https://img.shields.io/badge/Built%20on-@cyanheads/mcp--ts--core-67E8F9?style=flat-square)](https://www.npmjs.com/package/@cyanheads/mcp-ts-core)

</div>

<div align="center">

**Public Hosted Server:** [https://reference-data.caseyjhand.com/mcp](https://reference-data.caseyjhand.com/mcp)

</div>

---

## Tools

Ten tools grouped by domain — geo, timezone, periodic table, physical constants, unit conversion, HTTP, and web:

| Tool | Description |
|:---|:---|
| `ref_geo_lookup` | Look up a country by name, ISO alpha-2, or alpha-3 code. Returns capital, region, languages, currencies, calling codes, TLD, flag, and IANA timezone IDs. |
| `ref_geo_search` | Search and filter countries by region, subregion, language, currency, or free-text keyword. |
| `ref_timezone_lookup` | Get timezone info by IANA ID, country code, or partial city/region name. Returns current and standard UTC offsets, DST status, and major cities. |
| `ref_timezone_convert` | Convert a local datetime from one timezone to another, with visible UTC offsets for both sides. |
| `ref_element_lookup` | Look up a periodic table element by name, symbol, or atomic number. Full property set including atomic mass, electron configuration, electronegativity, density, melting/boiling points, and discovery data. |
| `ref_element_search` | Filter elements by category, group, period, atomic number range, or atomic mass range. |
| `ref_constant_lookup` | Look up a CODATA 2022 physical constant by name, symbol, or alias. Returns value, SI unit, uncertainty, and related constants. |
| `ref_unit_convert` | Convert a numeric value between compatible units of measure (length, mass, volume, temperature, speed, pressure, energy, power, frequency, digital storage, angle). |
| `ref_http_status` | Look up an HTTP status code by number or keyword. Returns reason phrase, description, category, cacheability, and RFC reference. |
| `ref_mime_type` | Look up a MIME type by type string or file extension. Returns canonical type, extensions, compressibility, and data source. |

### `ref_geo_lookup`

Look up a country by name, ISO alpha-2 or alpha-3 code.

- Accepts fuzzy name matching — "Brasil" and "Brazil" both resolve
- Returns full record: capital, region, subregion, official languages, currencies, calling codes, TLD, flag emoji, and IANA timezone IDs
- Lookup modes: `auto` (tries alpha-2, alpha-3, then name), `name`, `alpha2`, `alpha3`

---

### `ref_geo_search`

Search and filter countries with at least one filter required.

- Filters: keyword (name, native name, capital, subregion), region, subregion, language (ISO 639-1 code or name), currency (ISO 4217 code or name)
- Returns ranked summaries (alpha-2/3, name, capital, region, primary currency, flag)
- Paginated with configurable limit (1–100); `truncated` flag when results are cut off

---

### `ref_timezone_lookup`

Get timezone info for an IANA ID, country code, or city name.

- Partial city matching: "Tokyo" resolves to "Asia/Tokyo", "NY" to "America/New_York"
- Country code queries return all timezones observed in that country
- Optional `at` parameter evaluates DST state at a specific ISO 8601 moment
- Returns current offset, standard offset, DST status, abbreviations, major cities, and country codes

---

### `ref_timezone_convert`

Convert a local datetime between timezones.

- Input is a local ISO 8601 datetime without offset (e.g., `"2026-05-24T15:30:00"`)
- Accepts full IANA IDs or unambiguous city names
- Handles DST transitions with a two-pass offset refinement
- Returns source and target local datetimes with their respective UTC offsets, plus the UTC equivalent

---

### `ref_element_lookup`

Look up any of the 118 periodic table elements.

- Accepts name, symbol, or atomic number
- Full property set: atomic mass (with estimated flag), electron configuration, group, period, block, category, Pauling electronegativity, density, melting and boiling points in kelvin, phase at STP, radioactivity, natural occurrence, and discovery data
- Data sourced from PubChem/IUPAC 2024; synthetic/unstable elements return `null` for experimentally inaccessible properties

---

### `ref_element_search`

Filter elements across the full periodic table.

- Filters: category (partial match), group (1–18), period (1–7), atomic number range, atomic mass range
- At least one filter required; returns summaries with atomic number, symbol, name, mass, and category

---

### `ref_constant_lookup`

Look up CODATA 2022 physical constants (~360 entries).

- Fuzzy alias matching: "speed of light", "c", "Avogadro's number", "N_A", "Planck", "h", "Boltzmann", "k_B" all resolve
- Returns value, SI unit expression, absolute and relative uncertainty, exact-definition flag, CODATA identifier, and up to 3 related constants

---

### `ref_unit_convert`

Convert between units in 11 measurement domains.

- **Supported:** length (mm–mi), mass (mcg–t), volume (ml–m³), temperature (C/F/K/R, non-linear), speed (m/s, km/h, knot, ft/s), pressure (Pa–psi), energy (J–MWh), power (W–GW), frequency (Hz–GHz), digital storage (b–TB), angle (deg/rad/grad)
- Incompatible unit pairs return a structured error identifying the quantity mismatch
- Temperatures below absolute zero return a specific error with the Kelvin equivalent

---

### `ref_http_status`

Look up HTTP status codes by number or keyword.

- Numeric queries (e.g., `"404"`) return an exact match
- Keyword queries (e.g., `"not found"`, `"too many requests"`) return the closest match plus alternatives
- Returns: reason phrase, description, category (1xx–5xx), cacheability per RFC 9110, defining RFC with section reference

---

### `ref_mime_type`

Look up MIME types by type string or file extension.

- Accepts `"image/webp"`, `".webp"`, or `"webp"` interchangeably
- Extension lookups return the canonical MIME type first; additional types sharing the extension are listed as alternatives
- Returns: extensions, compressibility flag (relevant for Content-Encoding decisions), and data source (iana/apache/nginx)

---

## Resources

| Type | Name | Description |
|:---|:---|:---|
| Resource | `ref://countries/{alpha2}` | Full country record by ISO alpha-2 code (e.g., `ref://countries/DE`). |
| Resource | `ref://elements/{number}` | Full element record by atomic number (e.g., `ref://elements/6` for Carbon). |
| Resource | `ref://timezones/{iana_id}` | Timezone info by IANA ID with slashes URL-encoded as `%2F` (e.g., `ref://timezones/America%2FNew_York`). |

All resource data is also reachable via tools. Use `ref_geo_lookup`, `ref_element_lookup`, and `ref_timezone_lookup` when you need flexible query modes or country search.

---

## Features

Built on [`@cyanheads/mcp-ts-core`](https://www.npmjs.com/package/@cyanheads/mcp-ts-core):

- Declarative tool, resource, and prompt definitions — single file per primitive, framework handles registration and validation
- Unified error handling — handlers throw, framework catches, classifies, and formats
- Pluggable auth: `none`, `jwt`, `oauth`
- Swappable storage backends: `in-memory`, `filesystem`, `Supabase`, `Cloudflare KV/R2/D1`
- Structured logging with optional OpenTelemetry tracing
- STDIO and Streamable HTTP transports

Reference-data-specific:

- Entirely in-memory — all datasets load at startup; no runtime network calls, no API keys, no rate limits
- Works offline and in air-gapped environments
- Seven specialized services: geo (countries-list), timezone (Node.js Intl + @vvo/tzdb), elements (PubChem/IUPAC 2024, 118 elements), constants (CODATA 2022, ~360 entries), units (convert-units), HTTP status (IANA registry), MIME types (mime-db, ~1,000 types)

Agent-friendly output:

- Structured error contracts on every tool — typed `reason` codes (`no_match`, `no_filters`, `unknown_unit`, `incompatible_units`, `below_absolute_zero`, `invalid_timezone`, `invalid_datetime`) with actionable recovery hints
- Discriminated outputs where relevant — `truncated` flag on search results, `alternatives` arrays on MIME/HTTP keyword matches, `atomic_mass_estimated` flag on element data
- Consistent `null` for genuinely unknown or inapplicable values rather than absent fields

---

## Getting started

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

- [Bun v1.3.0](https://bun.sh/) or higher (or Node.js v24+).
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

Issues and pull requests are welcome. Run checks and tests before submitting:

```sh
bun run devcheck
bun run test
```

---

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.
