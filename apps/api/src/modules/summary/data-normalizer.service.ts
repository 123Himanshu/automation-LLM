import { Injectable } from '@nestjs/common';
import type { CellValue } from '@excelflow/shared';

/**
 * Normalizes dirty spreadsheet data for accurate grouping and aggregation.
 *
 * Handles common data quality issues:
 * - Leading/trailing whitespace: "  Raja " → "Raja"
 * - Multiple internal spaces: "Sunil  Kumar" → "Sunil Kumar"
 * - Case inconsistency: "tagged" vs "TAGGED" vs "Tagged" → "TAGGED"
 * - Null-like strings: "null", "N/A", "NA", "-" → treated as empty
 * - Numeric strings in text columns: "  42 " → "42"
 */

/** Maps normalized key → preferred display label (most frequent original form) */
interface NormalizationMap {
  /** normalized key → display label */
  keyToDisplay: Map<string, string>;
  /** original value → normalized key */
  valueToKey: Map<string, string>;
}

const NULL_LIKE_VALUES = new Set([
  'null', 'none', 'n/a', 'na', 'nil', '-', '--', 'undefined', '',
]);

@Injectable()
export class DataNormalizerService {
  /**
   * Normalizes a single cell value for grouping purposes.
   * Returns null for empty/null-like values.
   */
  normalizeValue(value: CellValue): string | null {
    if (value === null || value === undefined) return null;

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    const trimmed = String(value).trim().replace(/\s+/g, ' ');
    if (trimmed === '' || NULL_LIKE_VALUES.has(trimmed.toLowerCase())) {
      return null;
    }

    return trimmed;
  }

  /**
   * Normalizes a value and returns its canonical grouping key (uppercased).
   * Use this for frequency counting and cross-tab matching.
   */
  toGroupKey(value: CellValue): string | null {
    const normalized = this.normalizeValue(value);
    if (normalized === null) return null;
    return normalized.toUpperCase();
  }

  /**
   * Builds a normalization map for an array of values.
   * Groups values by their canonical key and picks the most frequent
   * original form as the display label.
   *
   * Example: ["Raja", "raja", "RAJA", "Raja"] →
   *   key "RAJA" → display "Raja" (most frequent)
   */
  buildNormalizationMap(values: CellValue[]): NormalizationMap {
    // Count frequency of each normalized form (preserving case)
    const normalizedFreq = new Map<string, Map<string, number>>();

    for (const v of values) {
      const normalized = this.normalizeValue(v);
      if (normalized === null) continue;

      const key = normalized.toUpperCase();
      if (!normalizedFreq.has(key)) {
        normalizedFreq.set(key, new Map());
      }
      const forms = normalizedFreq.get(key)!;
      forms.set(normalized, (forms.get(normalized) ?? 0) + 1);
    }

    const keyToDisplay = new Map<string, string>();
    const valueToKey = new Map<string, string>();

    for (const [key, forms] of normalizedFreq) {
      // Pick the most frequent form as display label
      let bestForm = '';
      let bestCount = 0;
      for (const [form, count] of forms) {
        if (count > bestCount) {
          bestForm = form;
          bestCount = count;
        }
      }
      keyToDisplay.set(key, bestForm);

      // Map all original forms to this key
      for (const form of forms.keys()) {
        valueToKey.set(form, key);
      }
    }

    return { keyToDisplay, valueToKey };
  }

  /**
   * Normalizes an array of values and returns frequency counts
   * using canonical grouping. Returns entries sorted by count desc.
   */
  computeNormalizedFrequency(
    values: CellValue[],
  ): Array<{ value: string; count: number }> {
    const map = this.buildNormalizationMap(values);
    const freq = new Map<string, number>();

    for (const v of values) {
      const normalized = this.normalizeValue(v);
      if (normalized === null) continue;
      const key = normalized.toUpperCase();
      freq.set(key, (freq.get(key) ?? 0) + 1);
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        value: map.keyToDisplay.get(key) ?? key,
        count,
      }));
  }
}
