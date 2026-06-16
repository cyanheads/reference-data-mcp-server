/**
 * @fileoverview Geo service — country lookup and search from countries-list dataset.
 * @module services/geo/geo-service
 */

import type { Context } from '@cyanheads/mcp-ts-core';
import {
  countries,
  getCountryData,
  getEmojiFlag,
  languages,
  type TLanguageCode,
} from 'countries-list';
import { getTimezoneService } from '../timezone/timezone-service.js';
import type { CountryRecord, CountrySummary, Currency } from './types.js';

// Continent code → name mapping
const CONTINENT_NAMES: Record<string, string> = {
  AF: 'Africa',
  AN: 'Antarctic',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'Americas',
  OC: 'Oceania',
  SA: 'Americas',
};

// Subregion data — not available in countries-list, maintained manually for major regions
const SUBREGIONS: Record<string, string> = {
  DZ: 'Northern Africa',
  EG: 'Northern Africa',
  LY: 'Northern Africa',
  MA: 'Northern Africa',
  SD: 'Northern Africa',
  TN: 'Northern Africa',
  EH: 'Northern Africa',
  BJ: 'Western Africa',
  BF: 'Western Africa',
  CV: 'Western Africa',
  CI: 'Western Africa',
  GM: 'Western Africa',
  GH: 'Western Africa',
  GN: 'Western Africa',
  GW: 'Western Africa',
  LR: 'Western Africa',
  ML: 'Western Africa',
  MR: 'Western Africa',
  NE: 'Western Africa',
  NG: 'Western Africa',
  SH: 'Western Africa',
  SN: 'Western Africa',
  SL: 'Western Africa',
  TG: 'Western Africa',
  AO: 'Middle Africa',
  CM: 'Middle Africa',
  CF: 'Middle Africa',
  TD: 'Middle Africa',
  CG: 'Middle Africa',
  CD: 'Middle Africa',
  GQ: 'Middle Africa',
  GA: 'Middle Africa',
  ST: 'Middle Africa',
  ZM: 'Middle Africa',
  ZW: 'Middle Africa',
  BI: 'Eastern Africa',
  KM: 'Eastern Africa',
  DJ: 'Eastern Africa',
  ER: 'Eastern Africa',
  ET: 'Eastern Africa',
  KE: 'Eastern Africa',
  MG: 'Eastern Africa',
  MW: 'Eastern Africa',
  MU: 'Eastern Africa',
  MZ: 'Eastern Africa',
  RE: 'Eastern Africa',
  RW: 'Eastern Africa',
  SC: 'Eastern Africa',
  SO: 'Eastern Africa',
  SS: 'Eastern Africa',
  TZ: 'Eastern Africa',
  UG: 'Eastern Africa',
  YT: 'Eastern Africa',
  BW: 'Southern Africa',
  SZ: 'Southern Africa',
  LS: 'Southern Africa',
  NA: 'Southern Africa',
  ZA: 'Southern Africa',
  KZ: 'Central Asia',
  KG: 'Central Asia',
  TJ: 'Central Asia',
  TM: 'Central Asia',
  UZ: 'Central Asia',
  CN: 'Eastern Asia',
  HK: 'Eastern Asia',
  JP: 'Eastern Asia',
  MN: 'Eastern Asia',
  KP: 'Eastern Asia',
  KR: 'Eastern Asia',
  MO: 'Eastern Asia',
  TW: 'Eastern Asia',
  AF: 'Southern Asia',
  BD: 'Southern Asia',
  BT: 'Southern Asia',
  IN: 'Southern Asia',
  IR: 'Southern Asia',
  MV: 'Southern Asia',
  NP: 'Southern Asia',
  PK: 'Southern Asia',
  LK: 'Southern Asia',
  BN: 'South-Eastern Asia',
  KH: 'South-Eastern Asia',
  TL: 'South-Eastern Asia',
  ID: 'South-Eastern Asia',
  LA: 'South-Eastern Asia',
  MY: 'South-Eastern Asia',
  MM: 'South-Eastern Asia',
  PH: 'South-Eastern Asia',
  SG: 'South-Eastern Asia',
  TH: 'South-Eastern Asia',
  VN: 'South-Eastern Asia',
  AM: 'Western Asia',
  AZ: 'Western Asia',
  BH: 'Western Asia',
  CY: 'Western Asia',
  GE: 'Western Asia',
  IQ: 'Western Asia',
  IL: 'Western Asia',
  JO: 'Western Asia',
  KW: 'Western Asia',
  LB: 'Western Asia',
  OM: 'Western Asia',
  PS: 'Western Asia',
  QA: 'Western Asia',
  SA: 'Western Asia',
  SY: 'Western Asia',
  TR: 'Western Asia',
  AE: 'Western Asia',
  YE: 'Western Asia',
  BY: 'Eastern Europe',
  BG: 'Eastern Europe',
  CZ: 'Eastern Europe',
  HU: 'Eastern Europe',
  PL: 'Eastern Europe',
  MD: 'Eastern Europe',
  RO: 'Eastern Europe',
  RU: 'Eastern Europe',
  SK: 'Eastern Europe',
  UA: 'Eastern Europe',
  AX: 'Northern Europe',
  DK: 'Northern Europe',
  EE: 'Northern Europe',
  FI: 'Northern Europe',
  FO: 'Northern Europe',
  IS: 'Northern Europe',
  IE: 'Northern Europe',
  IM: 'Northern Europe',
  LV: 'Northern Europe',
  LT: 'Northern Europe',
  NO: 'Northern Europe',
  SJ: 'Northern Europe',
  SE: 'Northern Europe',
  GB: 'Northern Europe',
  AL: 'Southern Europe',
  AD: 'Southern Europe',
  BA: 'Southern Europe',
  HR: 'Southern Europe',
  GI: 'Southern Europe',
  GR: 'Southern Europe',
  VA: 'Southern Europe',
  IT: 'Southern Europe',
  MK: 'Southern Europe',
  MT: 'Southern Europe',
  ME: 'Southern Europe',
  PT: 'Southern Europe',
  SM: 'Southern Europe',
  RS: 'Southern Europe',
  SI: 'Southern Europe',
  ES: 'Southern Europe',
  AT: 'Western Europe',
  BE: 'Western Europe',
  FR: 'Western Europe',
  DE: 'Western Europe',
  LI: 'Western Europe',
  LU: 'Western Europe',
  MC: 'Western Europe',
  NL: 'Western Europe',
  CH: 'Western Europe',
  BZ: 'Central America',
  CR: 'Central America',
  SV: 'Central America',
  GT: 'Central America',
  HN: 'Central America',
  MX: 'Central America',
  NI: 'Central America',
  PA: 'Central America',
  AG: 'Caribbean',
  BS: 'Caribbean',
  BB: 'Caribbean',
  CU: 'Caribbean',
  DM: 'Caribbean',
  DO: 'Caribbean',
  GD: 'Caribbean',
  GP: 'Caribbean',
  HT: 'Caribbean',
  JM: 'Caribbean',
  MQ: 'Caribbean',
  MS: 'Caribbean',
  PR: 'Caribbean',
  BL: 'Caribbean',
  KN: 'Caribbean',
  LC: 'Caribbean',
  MF: 'Caribbean',
  VC: 'Caribbean',
  TT: 'Caribbean',
  TC: 'Caribbean',
  VI: 'Caribbean',
  VG: 'Caribbean',
  AW: 'Caribbean',
  CW: 'Caribbean',
  SX: 'Caribbean',
  CA: 'Northern America',
  GL: 'Northern America',
  PM: 'Northern America',
  US: 'Northern America',
  AR: 'South America',
  BO: 'South America',
  BR: 'South America',
  CL: 'South America',
  CO: 'South America',
  EC: 'South America',
  FK: 'South America',
  GF: 'South America',
  GY: 'South America',
  PY: 'South America',
  PE: 'South America',
  SR: 'South America',
  UY: 'South America',
  VE: 'South America',
  AU: 'Australia and New Zealand',
  CX: 'Australia and New Zealand',
  CC: 'Australia and New Zealand',
  NZ: 'Australia and New Zealand',
  NF: 'Australia and New Zealand',
  FJ: 'Melanesia',
  NC: 'Melanesia',
  PG: 'Melanesia',
  SB: 'Melanesia',
  VU: 'Melanesia',
  GU: 'Micronesia',
  KI: 'Micronesia',
  MH: 'Micronesia',
  FM: 'Micronesia',
  NR: 'Micronesia',
  MP: 'Micronesia',
  PW: 'Micronesia',
  AS: 'Polynesia',
  CK: 'Polynesia',
  PF: 'Polynesia',
  NU: 'Polynesia',
  PN: 'Polynesia',
  WS: 'Polynesia',
  TK: 'Polynesia',
  TO: 'Polynesia',
  TV: 'Polynesia',
  WF: 'Polynesia',
  AQ: 'Antarctic',
};

// Currency names and symbols — limited set for the most common ones
const CURRENCY_INFO: Record<string, { name: string; symbol: string | null }> = {
  USD: { name: 'United States Dollar', symbol: '$' },
  EUR: { name: 'Euro', symbol: '€' },
  GBP: { name: 'British Pound Sterling', symbol: '£' },
  JPY: { name: 'Japanese Yen', symbol: '¥' },
  CNY: { name: 'Chinese Yuan', symbol: '¥' },
  INR: { name: 'Indian Rupee', symbol: '₹' },
  AUD: { name: 'Australian Dollar', symbol: 'A$' },
  CAD: { name: 'Canadian Dollar', symbol: 'CA$' },
  CHF: { name: 'Swiss Franc', symbol: 'Fr.' },
  KRW: { name: 'South Korean Won', symbol: '₩' },
  BRL: { name: 'Brazilian Real', symbol: 'R$' },
  MXN: { name: 'Mexican Peso', symbol: '$' },
  SEK: { name: 'Swedish Krona', symbol: 'kr' },
  NOK: { name: 'Norwegian Krone', symbol: 'kr' },
  DKK: { name: 'Danish Krone', symbol: 'kr' },
  NZD: { name: 'New Zealand Dollar', symbol: 'NZ$' },
  SGD: { name: 'Singapore Dollar', symbol: 'S$' },
  HKD: { name: 'Hong Kong Dollar', symbol: 'HK$' },
  RUB: { name: 'Russian Ruble', symbol: '₽' },
  ZAR: { name: 'South African Rand', symbol: 'R' },
  TRY: { name: 'Turkish Lira', symbol: '₺' },
  SAR: { name: 'Saudi Riyal', symbol: 'ر.س' },
  AED: { name: 'UAE Dirham', symbol: 'د.إ' },
  THB: { name: 'Thai Baht', symbol: '฿' },
  MYR: { name: 'Malaysian Ringgit', symbol: 'RM' },
  IDR: { name: 'Indonesian Rupiah', symbol: 'Rp' },
  PHP: { name: 'Philippine Peso', symbol: '₱' },
  VND: { name: 'Vietnamese Dong', symbol: '₫' },
  EGP: { name: 'Egyptian Pound', symbol: '£' },
  PLN: { name: 'Polish Zloty', symbol: 'zł' },
  CZK: { name: 'Czech Koruna', symbol: 'Kč' },
  HUF: { name: 'Hungarian Forint', symbol: 'Ft' },
  ILS: { name: 'Israeli New Shekel', symbol: '₪' },
  PKR: { name: 'Pakistani Rupee', symbol: '₨' },
  BDT: { name: 'Bangladeshi Taka', symbol: '৳' },
  NGN: { name: 'Nigerian Naira', symbol: '₦' },
  KES: { name: 'Kenyan Shilling', symbol: 'KSh' },
  GHS: { name: 'Ghanaian Cedi', symbol: '₵' },
  QAR: { name: 'Qatari Riyal', symbol: 'ر.ق' },
  KWD: { name: 'Kuwaiti Dinar', symbol: 'KD' },
  COP: { name: 'Colombian Peso', symbol: '$' },
  ARS: { name: 'Argentine Peso', symbol: '$' },
  CLP: { name: 'Chilean Peso', symbol: '$' },
  PEN: { name: 'Peruvian Sol', symbol: 'S/' },
  UAH: { name: 'Ukrainian Hryvnia', symbol: '₴' },
  CRC: { name: 'Costa Rican Colón', symbol: '₡' },
};

function getCurrencyInfo(code: string): Currency {
  const info = CURRENCY_INFO[code];
  return {
    code,
    name: info?.name ?? code,
    symbol: info?.symbol ?? null,
  };
}

function normalizeCountry(alpha2: string): CountryRecord {
  const data = getCountryData(alpha2 as 'US');
  const flag = getEmojiFlag(alpha2 as 'US');
  const continentCode = data.continent;
  const region = CONTINENT_NAMES[continentCode] ?? continentCode;
  const subregion = SUBREGIONS[alpha2] ?? null;

  // Build language list
  const langs = (data.languages ?? []).map((code) => ({
    code,
    name: languages[code as TLanguageCode]?.name ?? code,
  }));

  // Build currency list
  const currencies = (data.currency ?? []).map(getCurrencyInfo);

  // Get timezones via timezone service if initialized, else fallback to Intl
  let timezones: string[] = [];
  try {
    timezones = getTimezoneService().getTimezonesByCountry(alpha2);
  } catch {
    // Fallback: filter all IANA timezones that might match (no reliable fallback without tzdb)
    timezones = [];
  }

  return {
    alpha2,
    alpha3: data.iso3 ?? alpha2,
    name: data.name,
    native_name: data.native ?? data.name,
    capital: data.capital ?? null,
    region,
    subregion,
    population: null, // countries-list doesn't include population
    area_km2: null, // countries-list doesn't include area
    languages: langs,
    currencies,
    calling_codes: (data.phone ?? []).map((p) => `+${p}`),
    tld: `.${alpha2.toLowerCase()}`,
    flag,
    borders: [], // countries-list doesn't include borders
    timezones,
  };
}

export class GeoService {
  private readonly byAlpha2: Map<string, CountryRecord> = new Map();
  private readonly byAlpha3: Map<string, string> = new Map();
  private readonly byName: Map<string, string> = new Map();
  private readonly all: CountryRecord[] = [];

  constructor() {
    for (const alpha2 of Object.keys(countries)) {
      const record = normalizeCountry(alpha2);
      this.byAlpha2.set(alpha2.toUpperCase(), record);
      this.byAlpha3.set(record.alpha3.toUpperCase(), alpha2.toUpperCase());
      this.byName.set(record.name.toLowerCase(), alpha2.toUpperCase());
      if (record.native_name && record.native_name !== record.name) {
        this.byName.set(record.native_name.toLowerCase(), alpha2.toUpperCase());
      }
      this.all.push(record);
    }
  }

  lookupByAlpha2(code: string): CountryRecord | undefined {
    return this.byAlpha2.get(code.toUpperCase());
  }

  lookupByAlpha3(code: string): CountryRecord | undefined {
    const alpha2 = this.byAlpha3.get(code.toUpperCase());
    return alpha2 ? this.byAlpha2.get(alpha2) : undefined;
  }

  lookupByName(name: string): CountryRecord | undefined {
    return this.lookupByNameTracked(name)?.record;
  }

  /**
   * Name lookup that reports which path resolved the match — exact map hit vs.
   * the starts-with/contains fuzzy fallback. The tool layer uses `fuzzy` to emit
   * an enrichment notice so an agent knows whether to normalize the canonical name.
   */
  private lookupByNameTracked(name: string): { record: CountryRecord; fuzzy: boolean } | undefined {
    // Exact match
    const exact = this.byName.get(name.toLowerCase());
    if (exact) {
      const record = this.byAlpha2.get(exact);
      return record ? { record, fuzzy: false } : undefined;
    }

    // Fuzzy: find any country whose name starts with or contains the query
    const lower = name.toLowerCase();
    for (const [key, alpha2] of this.byName) {
      if (key.startsWith(lower) || key.includes(lower)) {
        const record = this.byAlpha2.get(alpha2);
        return record ? { record, fuzzy: true } : undefined;
      }
    }
    return;
  }

  lookup(
    query: string,
    by: 'auto' | 'name' | 'alpha2' | 'alpha3' | 'numeric',
    ctx: Context,
  ): { record: CountryRecord; fuzzy: boolean } | 'numeric_unsupported' | undefined {
    ctx.log.debug('Geo lookup', { query, by });

    if (by === 'numeric') {
      return 'numeric_unsupported';
    }

    // Code lookups (alpha2/alpha3) are always exact; only the name path can be fuzzy.
    if (by === 'alpha2') {
      const record = this.lookupByAlpha2(query);
      return record ? { record, fuzzy: false } : undefined;
    }
    if (by === 'alpha3') {
      const record = this.lookupByAlpha3(query);
      return record ? { record, fuzzy: false } : undefined;
    }
    if (by === 'name') {
      return this.lookupByNameTracked(query);
    }

    // auto: try alpha2, alpha3 (exact), then name (may be fuzzy)
    if (query.length === 2) {
      const record = this.lookupByAlpha2(query);
      if (record) return { record, fuzzy: false };
    }
    if (query.length === 3) {
      const record = this.lookupByAlpha3(query);
      if (record) return { record, fuzzy: false };
    }
    return this.lookupByNameTracked(query);
  }

  search(
    opts: {
      keyword?: string;
      region?: string;
      subregion?: string;
      language?: string;
      currency?: string;
      limit?: number;
    },
    ctx: Context,
  ): { results: CountrySummary[]; total_matches: number } {
    const { keyword, region, subregion, language, currency, limit = 20 } = opts;

    if (!keyword && !region && !subregion && !language && !currency) {
      return { results: [], total_matches: 0 };
    }

    ctx.log.debug('Geo search', opts);

    const keyLower = keyword?.toLowerCase();
    const regionLower = region?.toLowerCase();
    const subregionLower = subregion?.toLowerCase();
    const langQuery = language?.toLowerCase();
    const currQuery = currency?.toUpperCase();

    const matched = this.all.filter((c) => {
      if (keyLower) {
        const inName = c.name.toLowerCase().includes(keyLower);
        const inNative = c.native_name?.toLowerCase().includes(keyLower);
        const inCapital = c.capital?.toLowerCase().includes(keyLower);
        const inSubregion = c.subregion?.toLowerCase().includes(keyLower);
        if (!inName && !inNative && !inCapital && !inSubregion) return false;
      }
      if (regionLower && !c.region.toLowerCase().includes(regionLower)) return false;
      if (subregionLower && c.subregion?.toLowerCase() !== subregionLower) return false;
      if (langQuery) {
        const hasLang = c.languages.some(
          (l) => l.code.toLowerCase() === langQuery || l.name.toLowerCase() === langQuery,
        );
        if (!hasLang) return false;
      }
      if (currQuery) {
        const hasCurr = c.currencies.some(
          (cur) => cur.code === currQuery || cur.name.toUpperCase().includes(currQuery),
        );
        if (!hasCurr) return false;
      }
      return true;
    });

    const total_matches = matched.length;
    const results = matched.slice(0, Math.min(limit, 100)).map((c) => {
      // When filtering by currency, show the matched currency code rather than always the primary.
      let currency_code = c.currencies[0]?.code ?? null;
      if (currQuery) {
        const matched_currency = c.currencies.find((cur) => cur.code === currQuery);
        if (matched_currency) currency_code = matched_currency.code;
      }
      return {
        alpha2: c.alpha2,
        alpha3: c.alpha3,
        name: c.name,
        capital: c.capital,
        region: c.region,
        currency_code,
        flag: c.flag,
      };
    });

    return { results, total_matches };
  }

  getAllCountries(): CountryRecord[] {
    return this.all;
  }
}

// --- Init/accessor pattern ---

let _service: GeoService | undefined;

export function initGeoService(): void {
  _service = new GeoService();
}

export function getGeoService(): GeoService {
  if (!_service) throw new Error('GeoService not initialized — call initGeoService() in setup()');
  return _service;
}
