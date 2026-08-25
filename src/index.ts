#!/usr/bin/env node
/**
 * @fileoverview reference-data-mcp-server MCP server entry point.
 * @module index
 */

import { createApp } from '@cyanheads/mcp-ts-core';
// Resources
import { refCountriesResource } from './mcp-server/resources/definitions/ref-countries.resource.js';
import { refElementsResource } from './mcp-server/resources/definitions/ref-elements.resource.js';
import {
  refTimezonesResource,
  refTimezonesSlashCatchResource,
} from './mcp-server/resources/definitions/ref-timezones.resource.js';
// Tools
import { refConstantLookup } from './mcp-server/tools/definitions/ref-constant-lookup.tool.js';
import { refElementLookup } from './mcp-server/tools/definitions/ref-element-lookup.tool.js';
import { refElementSearch } from './mcp-server/tools/definitions/ref-element-search.tool.js';
import { refGeoLookup } from './mcp-server/tools/definitions/ref-geo-lookup.tool.js';
import { refGeoSearch } from './mcp-server/tools/definitions/ref-geo-search.tool.js';
import { refHttpStatus } from './mcp-server/tools/definitions/ref-http-status.tool.js';
import { refMimeType } from './mcp-server/tools/definitions/ref-mime-type.tool.js';
import { refTimezoneConvert } from './mcp-server/tools/definitions/ref-timezone-convert.tool.js';
import { refTimezoneLookup } from './mcp-server/tools/definitions/ref-timezone-lookup.tool.js';
import { refUnitConvert } from './mcp-server/tools/definitions/ref-unit-convert.tool.js';
// Services
import { initConstantsService } from './services/constants/constants-service.js';
import { initElementsService } from './services/elements/elements-service.js';
import { initGeoService } from './services/geo/geo-service.js';
import { initHttpStatusService } from './services/http-status/http-status-service.js';
import { initMimeService } from './services/mime/mime-service.js';
import { initTimezoneService } from './services/timezone/timezone-service.js';
import { initUnitsService } from './services/units/units-service.js';

await createApp({
  name: 'reference-data-mcp-server',
  title: 'reference-data-mcp-server',
  cacheHints: {
    'tools/list': { ttlMs: 3_600_000, cacheScope: 'public' },
    'resources/list': { ttlMs: 3_600_000, cacheScope: 'public' },
    'resources/templates/list': { ttlMs: 3_600_000, cacheScope: 'public' },
    'server/discover': { ttlMs: 3_600_000, cacheScope: 'public' },
  },
  tools: [
    refGeoLookup,
    refGeoSearch,
    refTimezoneLookup,
    refTimezoneConvert,
    refElementLookup,
    refElementSearch,
    refConstantLookup,
    refUnitConvert,
    refHttpStatus,
    refMimeType,
  ],
  resources: [
    refCountriesResource,
    refElementsResource,
    refTimezonesResource,
    refTimezonesSlashCatchResource,
  ],
  prompts: [],
  instructions:
    'Pure in-memory reference data server. No external API calls, no auth required. ' +
    'Use ref_geo_lookup/search for country data, ref_timezone_lookup/convert for timezone operations, ' +
    'ref_element_lookup/search for periodic table, ref_constant_lookup for CODATA 2022 physical constants, ' +
    'ref_unit_convert for unit conversion, ref_http_status for HTTP status codes, ' +
    'ref_mime_type for MIME type and file extension lookups.',
  // Public hosted-catalog server — serve full inventory without auth gate.
  // landing.requireAuth defaults to true when MCP_AUTH_MODE is jwt/oauth (0.9.13).
  landing: { requireAuth: false },

  setup() {
    // Initialize order matters: timezone service must init before geo (geo uses it for country→tz mapping)
    initTimezoneService();
    initGeoService();
    initElementsService();
    initConstantsService();
    initUnitsService();
    initHttpStatusService();
    initMimeService();
  },
});
