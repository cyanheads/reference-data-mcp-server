---
name: reference-data-guide
description: Resolve country and timezone identities with ref_* tools before converting meeting times. Use for scheduling across locations, ambiguous timezone names, daylight-saving transitions, and checking country-search coverage.
license: Apache-2.0
metadata:
  author: "cyanheads"
  version: "1.0"
---

## Scope

Use this guide when a scheduling task starts with a country or city rather than a known timezone, or when a daylight-saving transition makes a wall-clock time uncertain. For a direct reference lookup, the tool descriptions carry the contract. These tools convert individual moments; they do not create calendar events or identify the next DST transition.

## Identifiers

Carry the country `alpha2` returned by `ref_geo_search` or `ref_geo_lookup` into `ref_timezone_lookup` when enumerating that country's zones. Carry a returned `iana_id` into `ref_timezone_convert`. Country codes identify countries, not a single local timezone.

## Gates

- Resolve the intended city or IANA zone before converting. A country can have multiple zones; never choose its first zone as a default. Partial timezone names resolve to the first match without an ambiguity warning. Check the returned IANA ID and available city/country metadata against the intended location; use the full IANA ID for subsequent calls.
- Evaluate timezone state at the event's instant, not at the current time. For `ref_timezone_lookup`, include `Z` or an explicit UTC offset in the evaluation timestamp: an offset-free timestamp is interpreted in the server process's local timezone. This differs from conversion, where the offset-free datetime is local to the source zone.
- Treat a successful conversion during a fall-back repeated hour as one possible instant, not proof of the intended occurrence. The converter accepts repeated times and has no occurrence selector. Obtain the intended UTC instant or explicit offset; if given an offset, derive the UTC instant first. Then convert that UTC wall-clock datetime with `UTC` as the source zone and omit the `Z` suffix. This preserves the chosen occurrence.
- If conversion rejects a spring-forward gap, obtain a real replacement time; do not silently shift the meeting into the next valid hour.
- Before reporting a country search as exhaustive, inspect its total and truncation flag. Increase the result limit or split the search into narrower filters when truncated; a partial list cannot establish absence.
- Missing city/country metadata does not invalidate a recognized IANA zone. Core offsets use runtime Intl data; supplementary location metadata has narrower coverage. Do not infer a location from missing metadata.

## Core chain

For a meeting described by location: resolve the country if needed, enumerate its zones when the city is unknown, resolve the actual city's zone, then convert the agreed local datetime with the resolved source and target IANA IDs. Ask for the city when the country leaves the zone unresolved. Report both local calendar dates, resolved zones, and UTC offsets so a date change is visible.

For a country shortlist feeding a scheduling task: check search completeness before resolving each selected country's full record. Keep its returned country code attached to its zones; do not pair countries and zones by result position.
