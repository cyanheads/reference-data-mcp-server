# reference-data-mcp-server — Design

## MCP Surface

### Tools

| Name | Description | Key Inputs | Annotations |
|:-----|:------------|:-----------|:------------|
| `ref_geo_lookup` | Look up a country by name, ISO alpha-2/3 code, or numeric code. Returns the full record: capital, region, population, area, languages spoken, official currency, calling code, TLD, flag emoji, borders, and timezone IDs. | `query: string`, `by?: 'auto' \| 'name' \| 'alpha2' \| 'alpha3' \| 'numeric'` | `readOnlyHint`, `openWorldHint: false` |
| `ref_geo_search` | Search and filter countries by region, subregion, language spoken, currency used, or free-text keyword. Returns a ranked list of matching country records. | `keyword?: string`, `region?: string`, `subregion?: string`, `language?: string`, `currency?: string`, `limit?: number` | `readOnlyHint`, `openWorldHint: false` |
| `ref_timezone_lookup` | Timezone info by IANA ID or country code — current UTC offset, standard offset, whether DST is currently active, and the list of countries that observe the timezone. Accepts partial IANA names (e.g., "Tokyo" → "Asia/Tokyo"). | `query: string`, `by?: 'iana' \| 'country' \| 'auto'`, `at?: string (ISO 8601)` | `readOnlyHint`, `openWorldHint: false` |
| `ref_timezone_convert` | Convert a local datetime from one timezone to another. Takes a local datetime string plus source timezone, returns the equivalent local time in the target timezone with both UTC offsets shown. | `datetime: string (ISO 8601 local, no Z)`, `from_tz: string`, `to_tz: string` | `readOnlyHint`, `openWorldHint: false` |
| `ref_element_lookup` | Periodic table lookup by element name, symbol, or atomic number. Returns atomic mass, electron configuration, group, period, block, category, electronegativity, density, melting/boiling points, and discovery year. | `query: string`, `by?: 'auto' \| 'name' \| 'symbol' \| 'number'` | `readOnlyHint`, `openWorldHint: false` |
| `ref_element_search` | Filter elements by category (metal, nonmetal, metalloid, noble gas, etc.), group (1–18), period (1–7), or property ranges (atomic number range, atomic mass range). Returns matching element summaries. | `category?: string`, `group?: number`, `period?: number`, `atomic_number_range?: {min, max}`, `atomic_mass_range?: {min, max}` | `readOnlyHint`, `openWorldHint: false` |
| `ref_constant_lookup` | Physical constant by name or keyword — returns the CODATA 2022 value, SI unit string, relative uncertainty, and defining equation where applicable. Recognizes common names and aliases ("speed of light", "c", "Avogadro's number", "N_A"). | `query: string` | `readOnlyHint`, `openWorldHint: false` |
| `ref_unit_convert` | Convert a numeric value between compatible units of measure. Supports length, mass, volume, temperature, speed, pressure, energy, power, frequency, digital storage, and angles. Returns the converted value with both unit names. | `value: number`, `from: string`, `to: string` | `readOnlyHint`, `openWorldHint: false` |
| `ref_http_status` | Look up an HTTP status code — reason phrase, short description, category (1xx–5xx), RFC reference, and whether the code is cacheable. Accepts a numeric code or partial description. | `query: string \| number` | `readOnlyHint`, `openWorldHint: false` |
| `ref_mime_type` | MIME type lookup by type string (e.g., "image/webp") or file extension (e.g., ".webp", "webp"). Returns the canonical MIME type, common extensions, whether it's compressible, and the IANA source. | `query: string` | `readOnlyHint`, `openWorldHint: false` |

### Resources

| URI Template | Description | Pagination |
|:-------------|:------------|:-----------|
| `ref://countries/{alpha2}` | Full country record by ISO alpha-2 code. | None — single record |
| `ref://elements/{number}` | Full element record by atomic number. | None — single record |
| `ref://timezones/{iana_id}` | Timezone info by IANA ID (encoded: slashes → `%2F`). | None — single record |

Resources are supplementary — all data is fully accessible through tools. Tools are the primary interface.

### Prompts

None. The tool surface is the complete interface; there are no recurring multi-step interaction patterns that warrant prompt templates.

---

## Overview

Pure in-memory MCP server for common factual lookups. All datasets bundled as static data at build time — no network calls at runtime, no auth, no rate limits, no API keys. Zero latency from the agent's perspective.

Designed for the case where an agent needs a quick factual lookup that doesn't justify a web search — country codes, timezone conversions, element data, unit conversions, HTTP status meanings, MIME type mappings. A single server covers a set of domains that are individually too small to deserve their own server.

Target users: any agent (and its human) that runs into reference questions during a task. The server should feel like a fast local lookup, not an API call.

## Requirements

- All datasets loaded at startup from bundled static files — no I/O during requests
- Timezone operations use the Node.js `Intl` API with the runtime's built-in IANA tzdata — no runtime network calls
- Dataset versions surfaced explicitly (e.g., "IANA tzdata bundled with Node 24", "CODATA 2022") so callers know the data vintage
- No external API dependencies at runtime
- All inputs accept common aliases and partial matches — agents shouldn't need to know exact codes
- Works offline and in air-gapped environments
- HTTP/stdio transports — no auth required (read-only reference server)
- Total bundled dataset size: well under 10MB

## Services

| Service | Wraps | Used By |
|:--------|:------|:--------|
| `geo-service` | countries-list dataset (ISO 3166-1 α-2/3, languages, currencies, calling codes, timezones per country) | `ref_geo_lookup`, `ref_geo_search`, `ref://countries/{alpha2}` |
| `timezone-service` | `Intl` API + `@vvo/tzdb` for country↔timezone mapping and city lookups | `ref_timezone_lookup`, `ref_timezone_convert`, `ref://timezones/{iana_id}` |
| `elements-service` | Bundled periodic table JSON (118 elements, full property set) | `ref_element_lookup`, `ref_element_search`, `ref://elements/{number}` |
| `constants-service` | Bundled CODATA 2022 constants JSON (~360 constants) | `ref_constant_lookup` |
| `units-service` | `convert-units` library (handles temperature non-linearity, compound ratios) | `ref_unit_convert` |
| `http-status-service` | Bundled IANA HTTP Status Code Registry JSON (~65 codes) | `ref_http_status` |
| `mime-service` | `mime-db` npm package (~1,000 MIME types with extension mappings) | `ref_mime_type` |

## Config

| Env Var | Required | Description |
|:--------|:---------|:------------|
| `MCP_TRANSPORT_TYPE` | No | `stdio` (default) or `http`. Framework standard. |
| `MCP_HTTP_PORT` | No | HTTP port when `MCP_TRANSPORT_TYPE=http`. Framework standard. |

No API keys. No server-specific env vars beyond framework defaults.

## Implementation Order

1. Project setup — confirm no-op server config (no API keys needed), load services from static data at `createApp()` startup, fail fast on corrupt bundled data
2. `geo-service` — import `countries-list`, build lookup indices (alpha2, alpha3, numeric, normalized name)
3. `ref_geo_lookup` + `ref_geo_search` — two tools off the same service
4. `timezone-service` — Intl API wrapper + `@vvo/tzdb` for country/city → IANA mapping
5. `ref_timezone_lookup` + `ref_timezone_convert`
6. `elements-service` — bundle periodic table JSON, build symbol/name/number indices
7. `ref_element_lookup` + `ref_element_search`
8. `constants-service` — bundle CODATA 2022 JSON, alias index ("speed of light" → "c_0")
9. `ref_constant_lookup`
10. `units-service` — thin wrapper around `convert-units`, surface unit list for error recovery
11. `ref_unit_convert`
12. `http-status-service` + `ref_http_status`
13. `mime-service` + `ref_mime_type`
14. Resources — `ref://countries/{alpha2}`, `ref://elements/{number}`, `ref://timezones/{iana_id}`
15. `devcheck` pass + field tests

Each step is independently testable. Steps 2–5 can run in parallel once geo-service is validated.

---

## Design Decisions

### Why not a single `ref_lookup` tool with a `domain` parameter?

A single umbrella tool with `domain: 'country' | 'element' | 'timezone' | ...` would reduce surface area from 10 to 1, but at real cost: every call requires the agent to know the right domain string and the right query format for that domain. With separate tools, the tool description and input schema already communicate those constraints. The agent selects the right tool from the name — `ref_element_lookup` is unambiguous. Selection overhead across 10 tools is trivial; miscommunicating query format is not.

### Why no separate `ref_currency_lookup` and `ref_language_lookup`?

The idea doc proposes these as separate tools. The data doesn't justify it. Currency and language data lives *in* country records — "what currency does Brazil use?" → `ref_geo_lookup("Brazil")` → `{ currency: { code: "BRL", name: "Brazilian Real", symbol: "R$" } }`. The inverse queries ("which countries use the Euro?", "which countries speak Portuguese?") are covered by `ref_geo_search` with `currency`/`language` filters.

A dedicated `ref_currency_lookup` would only add value for currency-first queries that don't involve a country, like "what's the ISO code for the Euro?" — but that's also answerable via `ref_geo_search({ currency: "EUR" })` or just knowing EUR is the code. The surface overhead of two more tools doesn't earn its keep.

### Why keep `ref_timezone_lookup` and `ref_timezone_convert` as separate tools rather than merging?

They serve different intents. `ref_timezone_lookup` answers "what timezone is São Paulo in?" and "is DST active in London right now?" — the agent wants info about a timezone. `ref_timezone_convert` answers "what time is 3:30 PM Tokyo in Seattle?" — the agent has a specific moment it wants to translate. Merging would require either an overloaded `mode` parameter or a single tool that does both poorly. The distinction maps cleanly to the user goals.

### Why is `ref_timezone_list` cut?

The idea doc includes it. `Intl.supportedValuesOf('timeZone')` returns all 418 IANA timezone IDs, which `ref_timezone_lookup` with `by: 'country'` can already filter by country. A dedicated list tool would return a large array agents can't easily use. An agent that needs to know "what timezones does the US observe?" should use `ref_geo_lookup("US")` (which includes timezone IDs in the country record) or `ref_timezone_lookup("US", { by: 'country' })`. The list tool is cut.

### Why is `ref_date_arithmetic` cut?

Adding durations, computing day-of-week, and checking leap years are computation, not reference data lookups. The server's value proposition is static datasets — an in-memory periodic table, IANA timezone offsets, NIST constants. Date arithmetic has no dataset; it's just calendar math. It belongs in a general math server or in the agent's own reasoning. Including it would dilute the server's identity and introduce test surface for edge cases (DST gaps, leap seconds) that have nothing to do with reference lookups.

### Timezone data: why not a dedicated tzdata npm package?

Node.js 24 bundles IANA tzdata internally. `Intl.supportedValuesOf('timeZone')` returns 418 timezones from the runtime's own copy. `Intl.DateTimeFormat` handles DST transitions correctly using that same bundled data. No additional package is needed for the core timezone operations (offsets, conversion, DST status).

`@vvo/tzdb` is added for the supplementary data that `Intl` doesn't expose: country↔timezone mappings, major city names, and human-readable timezone groupings. Its version string tracks IANA releases (v6.198 = tzdata 2025b at time of design), so updating the package updates the supplementary metadata. The core offset computation always uses the runtime's Intl — which Node updates on runtime upgrades.

The IANA data update problem is thus split: runtime IANA data follows Node.js version upgrades; supplementary metadata follows `@vvo/tzdb` version upgrades. Neither requires manual intervention or build-time generation.

### Unit conversion: `convert-units` over `math.js`

`math.js` (~800KB minified) is a full symbolic math engine. The server only needs numeric unit conversion — ratios and the four non-linear formulas (temperature scales). `convert-units` (~50KB) handles exactly this: it knows which units are compatible, computes the conversion, and handles temperature non-linearity. It supports compound unit strings like `km/h` → `m/s` via ratio composition. The smaller footprint is the right call for a reference server.

Scope boundary: `convert-units` covers linear and temperature conversions. It does not handle currency (rates change — not static reference data), symbolic expressions, or dimensional analysis. These are correct exclusions.

### Why no `ref_element_list` or `ref_country_list`?

A full dump of 118 elements or 250 countries would exceed context budgets for most uses. `ref_geo_search` and `ref_element_search` provide filtered listing. If an agent genuinely needs all records, it can call search with no filters — but that's a degenerate case that doesn't need its own entry point.

---

## Data Strategy

| Dataset | Source | ~Size | Update frequency | Bundle strategy |
|:--------|:-------|:------|:-----------------|:----------------|
| Countries | `countries-list` npm (ISO 3166-1 α-2/3, ISO 639-1 languages, ISO 4217 currencies, ITU calling codes) | ~250 records × 15 fields | Occasional — country changes are rare (South Sudan 2011, Kosovo 2008) | Import as npm dep, TypeScript-typed |
| Timezones (core) | Node.js runtime Intl / IANA tzdata | 418 IANA IDs | Node.js runtime upgrades | Built in — no bundle |
| Timezones (metadata) | `@vvo/tzdb` npm | ~600 timezone group records | ~3–4 IANA releases/year | Import as npm dep |
| Periodic table | Static JSON — 118 elements, sourced from PubChem/IUPAC | 118 records × ~20 fields ≈ 100KB | Static (element data doesn't change; new elements are multi-year events) | Bundled TypeScript const in `src/data/` |
| Physical constants | CODATA 2022 values (NIST) | ~360 constants | Every 4 years (next CODATA 2026) | Bundled TypeScript const in `src/data/` |
| HTTP status codes | IANA HTTP Status Code Registry | ~65 codes | Occasional RFC additions | Bundled TypeScript const in `src/data/` |
| MIME types | `mime-db` npm (IANA + Apache + nginx sources) | ~1,000 types with extensions | Updated with RFC additions | Import as npm dep |
| Unit definitions | `convert-units` npm | ~100 units across ~20 categories | Stable (SI definitions) | Import as npm dep |

Static JSON/TypeScript consts in `src/data/` are the right choice for datasets that don't have a good npm package and change rarely. The periodic table and CODATA constants fall here. They get committed into the repo, versioned explicitly in the service (e.g., `DATASET_VERSION = 'CODATA 2022'`), and updated deliberately (not on every `bun update`).

---

## Tool Detail

### `ref_geo_lookup`

**Description:** Look up a country by name, ISO alpha-2 code, ISO alpha-3 code, or numeric code. Returns the full record: capital, region, subregion, population, area, official languages, currency (code, name, symbol), country calling code, TLD, flag emoji, neighboring country codes, and IANA timezone IDs. Accepts fuzzy name matching — "Brasil" and "Brazil" both resolve.

**Input:**
- `query: string` — country name, ISO code, or numeric code
- `by?: 'auto' | 'name' | 'alpha2' | 'alpha3' | 'numeric'` — lookup strategy; `auto` tries all in order (default)

**Output:** Single country record. Includes `currency` object (code, name, symbol), `languages` array (ISO 639-1 code + name), `timezones` array (IANA IDs), `borders` array (alpha-2 codes of neighbors).

**Errors:**
- `no_match` (NotFound) — no country matched the query. Recovery: try a different spelling or use `ref_geo_search` with a keyword.

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_geo_search`

**Description:** Filter countries by region, subregion, language, currency, or keyword. At least one filter or keyword is required. Returns a list of matching country summaries (name, alpha-2, capital, region, currency code, flag emoji). Use `ref_geo_lookup` to get the full record for a specific result.

**Input:**
- `keyword?: string` — matches against name, capital, and subregion
- `region?: string` — one of: Africa, Americas, Asia, Europe, Oceania, Antarctic
- `subregion?: string` — e.g., "Western Europe", "Southeast Asia"
- `language?: string` — ISO 639-1 code (e.g., "pt") or language name (e.g., "Portuguese")
- `currency?: string` — ISO 4217 code (e.g., "EUR") or currency name
- `limit?: number` — max results (default 20, max 100)

**Output:** Array of country summaries with `total_matches` count. If `total_matches > limit`, indicates results are truncated.

**Errors:**
- `no_filters` (ValidationError) — no filter or keyword provided. Recovery: provide at least one of keyword, region, language, or currency.
- `no_match` (NotFound) — no countries matched the filters. Recovery: broaden or remove a filter.

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_timezone_lookup`

**Description:** Get timezone info by IANA ID, country code, or partial name. Returns the current UTC offset, standard UTC offset, whether DST is currently active, and the major cities associated with the timezone. When querying by country, returns all timezones observed in that country. Accepts partial matches — "Tokyo" resolves to "Asia/Tokyo", "NY" to "America/New_York".

**Input:**
- `query: string` — IANA timezone ID (e.g., "America/New_York"), ISO alpha-2 country code (e.g., "US"), or partial name (e.g., "Tokyo", "São Paulo")
- `by?: 'iana' | 'country' | 'auto'` — lookup mode (default: auto)
- `at?: string` — ISO 8601 datetime to evaluate timezone state at a specific moment (default: now)

**Output:** One or more timezone records, each with: `iana_id`, `current_offset_hours`, `standard_offset_hours`, `dst_active`, `dst_abbreviation`, `standard_abbreviation`, `major_cities`, `countries` (list of alpha-2 codes).

**Errors:**
- `no_match` (NotFound) — no timezone matched the query. Recovery: use exact IANA ID from `Intl.supportedValuesOf('timeZone')` or two-letter ISO country code.

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_timezone_convert`

**Description:** Convert a local datetime from one timezone to another. Takes a local time string (no UTC offset, e.g., "2026-05-24T15:30:00") interpreted as local time in the source timezone, returns the equivalent local time in the target timezone. Shows both UTC offsets so DST transitions are visible. Accepts full IANA IDs or unambiguous city names.

**Input:**
- `datetime: string` — local datetime in ISO 8601 format without offset (e.g., "2026-05-24T15:30:00")
- `from_tz: string` — source IANA timezone ID or unambiguous name (e.g., "Asia/Tokyo" or "Tokyo")
- `to_tz: string` — target IANA timezone ID or unambiguous name

**Output:** `{ source: { datetime, tz, offset }, target: { datetime, tz, offset }, utc_equivalent }`. Both local datetimes plus the UTC equivalent so callers can chain.

**Errors:**
- `invalid_timezone` (ValidationError) — unrecognized timezone ID. Recovery: use `ref_timezone_lookup` to find the correct IANA ID.
- `invalid_datetime` (ValidationError) — malformed datetime string. Recovery: use ISO 8601 without timezone offset, e.g., "2026-05-24T15:30:00".

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_element_lookup`

**Description:** Look up a periodic table element by name, chemical symbol, or atomic number. Returns the full data record: atomic number, symbol, name, atomic mass, electron configuration, group, period, block, category (e.g., "noble gas", "transition metal"), electronegativity, density, melting point, boiling point, and discovery year.

**Input:**
- `query: string | number` — element name (e.g., "tungsten"), symbol (e.g., "W"), or atomic number (e.g., 74)
- `by?: 'auto' | 'name' | 'symbol' | 'number'` — lookup mode (default: auto — tries number, then symbol, then name)

**Output:** Full element record. All numeric properties include their units. Missing values (not experimentally determined) returned as null with a note.

**Errors:**
- `no_match` (NotFound) — no element matched the query. Recovery: use `ref_element_search` to browse by category or use the full IUPAC name.

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_element_search`

**Description:** Filter periodic table elements by category, group, period, or property range. Returns matching elements as a summary list (number, symbol, name, atomic mass, category). Use `ref_element_lookup` for the full record on a specific element.

**Input:**
- `category?: string` — one of: alkali metal, alkaline earth metal, transition metal, post-transition metal, metalloid, reactive nonmetal, noble gas, lanthanide, actinide
- `group?: number` — group number 1–18
- `period?: number` — period 1–7
- `atomic_number_range?: { min: number, max: number }` — inclusive range
- `atomic_mass_range?: { min: number, max: number }` — atomic mass range in u

At least one filter required.

**Output:** Array of element summaries. `total_matches` count included. If empty, suggests broadening the filter.

**Errors:**
- `no_filters` (ValidationError) — no filter provided
- `no_match` (NotFound) — no elements matched

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_constant_lookup`

**Description:** Look up a fundamental physical constant by name, symbol, or common alias. Returns the CODATA 2022 value, SI unit expression, relative standard uncertainty, and a short description. Recognizes common names and symbols — "speed of light", "c", "Avogadro's number", "N_A", "Planck", "h" all resolve correctly. Search is fuzzy — partial names return the closest match with alternatives listed.

**Input:**
- `query: string` — constant name, symbol, or alias

**Output:** `{ name, symbol, value, unit, uncertainty, description, codata_id }`. When the query matches multiple constants, returns the closest match plus a `related` array of alternatives.

**Errors:**
- `no_match` (NotFound) — no constant matched. Recovery: try a more common name or alias (e.g., "electron mass" instead of "me").

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_unit_convert`

**Description:** Convert a value between units of measure. Supports: length (m, km, mi, ft, in, cm, mm, nm, etc.), mass (kg, g, lb, oz, ton, stone, etc.), volume (L, mL, gal, fl oz, cup, tbsp, tsp, m³, etc.), temperature (°C, °F, K, °R — non-linear conversions handled), speed (m/s, km/h, mph, knots, ft/s), pressure (Pa, kPa, bar, atm, psi, mmHg), energy (J, kJ, cal, kcal, Wh, kWh, eV, BTU), power (W, kW, hp), frequency (Hz, kHz, MHz, GHz), digital storage (bit, byte, KB, MB, GB, TB), and angle (deg, rad, grad). Incompatible units (e.g., km to kg) return an error identifying the quantity mismatch.

**Input:**
- `value: number` — numeric quantity to convert
- `from: string` — source unit (e.g., "km", "°C", "mph", "kWh")
- `to: string` — target unit (e.g., "mi", "°F", "m/s", "BTU")

**Output:** `{ value, from_unit, to_unit, result, result_precision }`. Result is a full-precision float; `result_precision` is a human-friendly rounded form.

**Errors:**
- `incompatible_units` (ValidationError) — units measure different quantities. Recovery: check that from and to units measure the same physical quantity (e.g., both length, both mass). Error message names the quantity each unit measures.
- `unknown_unit` (ValidationError) — unrecognized unit string. Recovery: error message lists supported units for the closest quantity category.

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_http_status`

**Description:** Look up an HTTP status code by number or description keyword. Returns the reason phrase, description, category (1xx Informational, 2xx Success, 3xx Redirection, 4xx Client Error, 5xx Server Error), whether the code is cacheable by default, and the defining RFC with section reference.

**Input:**
- `query: string | number` — numeric code (e.g., 422) or keyword (e.g., "unprocessable", "too many", "not found")

**Output:** `{ code, reason_phrase, description, category, cacheable, rfc, rfc_section }`. For keyword queries that match multiple codes, returns a list of candidates.

**Errors:**
- `no_match` (NotFound) — no code matched. Recovery: use the numeric code directly or broaden the keyword.

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

### `ref_mime_type`

**Description:** Look up a MIME type by type string or file extension. Accepts "image/webp", ".webp", or "webp". Returns the canonical MIME type, known file extensions, whether the type is compressible (relevant for Content-Encoding decisions), and the IANA source. For extension lookups, returns the canonical MIME type — e.g., ".jpg" → "image/jpeg".

**Input:**
- `query: string` — MIME type string (e.g., "application/json") or file extension with or without leading dot (e.g., ".webp", "webp")

**Output:** `{ type, extensions, compressible, source }`. For ambiguous extensions that map to multiple MIME types, lists all candidates.

**Errors:**
- `no_match` (NotFound) — unrecognized MIME type or extension. Recovery: check spelling or use the full IANA type string (e.g., "application/octet-stream").

**Annotations:** `readOnlyHint: true`, `openWorldHint: false`

---

## Known Limitations

- **IANA timezone coverage in supplementary metadata:** `@vvo/tzdb` covers major timezone groups with city names; some obscure IANA identifiers (legacy aliases, deprecated names) appear in `Intl.supportedValuesOf` but lack city/country metadata. The core offset and DST computation still works for these via Intl.
- **No DST transition next-occurrence:** The design does not surface the exact datetime of the next DST transition. Computing this requires binary search over Intl offsets and isn't cheap enough to include by default. The `at?` parameter on `ref_timezone_lookup` lets callers probe specific moments.
- **Currency exchange rates not included:** Currency data covers ISO 4217 codes, names, and symbols. Exchange rates change continuously and are not reference data — use a financial API for live rates.
- **Unit conversion scope:** Physical chemistry units (mol, Becquerel, Sievert) and specialized engineering units are out of scope. `convert-units` covers the common set; uncommon units return a clear error with the supported list.
- **Periodic table data vintage:** The bundled element dataset includes experimentally confirmed values as of 2024. Properties marked as estimated (e.g., atomic masses of synthetic elements, predicted electron configurations for Z > 118) are labeled as such.
- **No compound/molecular data:** Element lookup covers individual elements only. Compound lookups (H₂O, NaCl) belong in a chemistry server (pubchem-mcp-server).
