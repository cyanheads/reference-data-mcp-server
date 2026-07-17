/**
 * @fileoverview Timezone service domain types.
 * @module services/timezone/types
 */

export interface TimezoneRecord {
  alternate_names: string[];
  countries: string[];
  current_offset_hours: number;
  dst_abbreviation: string | null;
  dst_active: boolean;
  iana_id: string;
  major_cities: string[];
  standard_abbreviation: string | null;
  standard_offset_hours: number;
}

export interface ConversionResult {
  source: {
    datetime: string;
    tz: string;
    offset: string;
  };
  target: {
    datetime: string;
    tz: string;
    offset: string;
  };
  utc_equivalent: string;
}

/**
 * A reason a format-valid local datetime cannot be converted from its source zone, paired
 * with an actionable recovery hint. Returned by TimezoneService.validateConvertibleDatetime;
 * the tool handler raises it as the `invalid_datetime` error.
 */
export interface DatetimeIssue {
  hint: string;
  message: string;
}
