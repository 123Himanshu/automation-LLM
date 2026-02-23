import { Injectable } from '@nestjs/common';
import type { CellValue, ColumnType, ColumnStats } from '@excelflow/shared';
import { isDateValue } from '@excelflow/shared';
import { DataNormalizerService } from './data-normalizer.service';

@Injectable()
export class ColumnDetectorService {
  constructor(private readonly normalizer: DataNormalizerService) {}
  detectType(values: CellValue[]): ColumnType {
    const nonEmpty = values.filter((v) => v !== null && v !== '' && v !== undefined);
    if (nonEmpty.length === 0) return 'empty';

    const numericCount = nonEmpty.filter((v) => typeof v === 'number').length;
    const dateCount = nonEmpty.filter((v) => isDateValue(v)).length;

    if (numericCount / nonEmpty.length > 0.8) return 'numeric';
    if (dateCount / nonEmpty.length > 0.8) return 'date';

    // Use normalized unique count so "Raja" and "raja " count as one value
    const normalizedKeys = new Set(
      nonEmpty.map((v) => this.normalizer.toGroupKey(v)).filter((k) => k !== null),
    );
    const uniqueRatio = normalizedKeys.size / nonEmpty.length;
    if (uniqueRatio < 0.3 && nonEmpty.length > 5) return 'category';

    return 'text';
  }

  computeStats(header: string, values: CellValue[], type: ColumnType): ColumnStats {
    const nonEmpty = values.filter((v) => v !== null && v !== '' && v !== undefined);
    const missing = values.length - nonEmpty.length;
    const normalizedKeys = new Set(
      nonEmpty.map((v) => this.normalizer.toGroupKey(v)).filter((k) => k !== null),
    );
    const unique = normalizedKeys.size;

    const base: ColumnStats = {
      header,
      type,
      count: values.length,
      missing,
      unique,
    };

    if (type === 'numeric') {
      return this.computeNumericStats(base, nonEmpty as number[]);
    }

    if (type === 'category' || type === 'text') {
      return this.computeCategoryStats(base, nonEmpty);
    }

    if (type === 'date') {
      return this.computeDateStats(base, nonEmpty);
    }

    return base;
  }

  private computeNumericStats(base: ColumnStats, values: number[]): ColumnStats {
    if (values.length === 0) return base;

    const nums = values.filter((v) => typeof v === 'number');
    const sum = nums.reduce((a, b) => a + b, 0);
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const mean = sum / nums.length;

    return { ...base, sum, min, max, mean };
  }

  private computeCategoryStats(base: ColumnStats, values: CellValue[]): ColumnStats {
    const topValues = this.normalizer
      .computeNormalizedFrequency(values)
      .slice(0, 50);

    return { ...base, topValues };
  }

  private computeDateStats(base: ColumnStats, values: CellValue[]): ColumnStats {
    const dates = values
      .map((v) => (typeof v === 'string' ? Date.parse(v) : typeof v === 'number' ? v : NaN))
      .filter((d) => !isNaN(d))
      .sort((a, b) => a - b);

    if (dates.length === 0) return base;

    return {
      ...base,
      min: new Date(dates[0]!).toISOString(),
      max: new Date(dates[dates.length - 1]!).toISOString(),
    };
  }
}
