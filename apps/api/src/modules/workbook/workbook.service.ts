import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { WorkbookRepository } from './workbook.repository';
import { XlsxParserService } from './xlsx-parser.service';
import { S3Service } from '../../common/services/s3.service';
import { classifyWorkbook, CLASSIFICATION_THRESHOLDS, FILE_LIMITS } from '@excelflow/shared';
import type { Sheet, WorkbookClassification, WorkbookMetrics } from '@excelflow/shared';
import * as path from 'path';

/** Callback for cleaning up HyperFormula instances on workbook deletion.
 *  Set by ActionModule to avoid circular dependency with RecalcService. */
type HfCleanupFn = (workbookId: string) => void;
let hfCleanupFn: HfCleanupFn | null = null;

interface UploadResult {
  id: string;
  name: string;
  classification: WorkbookClassification;
  sheetCount: number;
  revisionId: string;
}

/** In-memory workbook state cache with LRU eviction and TTL */
const CACHE_MAX_SIZE = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  sheets: Sheet[];
  metrics: WorkbookMetrics;
  lastAccess: number;
}

const workbookCache = new Map<string, CacheEntry>();

/** Evict oldest entries when cache exceeds max size, and expired entries */
function evictCache(): void {
  const now = Date.now();

  // First pass: remove expired entries
  for (const [key, entry] of workbookCache) {
    if (now - entry.lastAccess > CACHE_TTL_MS) {
      workbookCache.delete(key);
    }
  }

  // Second pass: if still over limit, evict LRU
  if (workbookCache.size > CACHE_MAX_SIZE) {
    const sorted = [...workbookCache.entries()].sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess,
    );
    const toRemove = sorted.slice(0, workbookCache.size - CACHE_MAX_SIZE);
    for (const [key] of toRemove) {
      workbookCache.delete(key);
    }
  }
}

@Injectable()
export class WorkbookService {
  private readonly logger = new Logger(WorkbookService.name);

  constructor(
    private readonly repo: WorkbookRepository,
    private readonly parser: XlsxParserService,
    private readonly s3: S3Service,
  ) {}

  /** Register HyperFormula cleanup callback (called by ActionModule on init) */
  static registerHfCleanup(fn: HfCleanupFn): void {
    hfCleanupFn = fn;
  }

  async upload(
    fileBuffer: Buffer,
    originalName: string,
  ): Promise<UploadResult> {
    const ext = path.extname(originalName).toLowerCase();
    if (!FILE_LIMITS.ALLOWED_EXTENSIONS.includes(ext as '.xlsx' | '.csv')) {
      throw new BadRequestException(`Unsupported file type: ${ext}`);
    }

    if (fileBuffer.length > FILE_LIMITS.MAX_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException(
        `File exceeds maximum size of ${FILE_LIMITS.MAX_UPLOAD_SIZE_BYTES / 1024 / 1024}MB`,
      );
    }

    // Parse from buffer (no disk write)
    const { sheets, metrics } = await this.parser.parseBuffer(fileBuffer, ext);

    if (metrics.usedCells > CLASSIFICATION_THRESHOLDS.MAX_CELL_COUNT) {
      throw new BadRequestException(
        `Workbook exceeds maximum of ${CLASSIFICATION_THRESHOLDS.MAX_CELL_COUNT.toLocaleString()} cells`,
      );
    }

    const classification = classifyWorkbook(metrics);

    // Save to DB first to get the ID
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const workbook = await this.repo.create({
      name: path.basename(originalName, ext),
      classification,
      filePath: '', // placeholder, updated after S3 upload
      sheetCount: sheets.length,
      usedCells: metrics.usedCells,
    });

    // Upload to S3
    const s3Key = `uploads/${workbook.id}/${sanitizedName}`;
    const contentType = ext === '.csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    await this.s3.upload(s3Key, fileBuffer, contentType);

    // Update DB with S3 key
    await this.repo.updateFilePath(workbook.id, s3Key);

    // Cache in memory
    workbookCache.set(workbook.id, { sheets, metrics, lastAccess: Date.now() });
    evictCache();

    this.logger.log(
      `Uploaded workbook ${workbook.id}: ${classification} mode, ${metrics.usedCells} cells → s3://${s3Key}`,
    );

    return {
      id: workbook.id,
      name: workbook.name,
      classification,
      sheetCount: sheets.length,
      revisionId: 'R0',
    };
  }

  async getById(id: string) {
    const workbook = await this.repo.findById(id);
    if (!workbook) throw new NotFoundException(`Workbook ${id} not found`);
    return workbook;
  }

  async getSheets(id: string): Promise<Sheet[]> {
    const cached = workbookCache.get(id);
    if (cached) {
      cached.lastAccess = Date.now();
      return cached.sheets;
    }

    const workbook = await this.getById(id);

    // Handle empty workbooks (no file in S3)
    if (!workbook.filePath) {
      const sheet = this.parser.createEmptySheet('Sheet1');
      const metrics: WorkbookMetrics = {
        usedCells: 0, formulaCount: 0, volatileCount: 0,
        sheetCount: 1, crossSheetDeps: 0, maxColumns: 0,
        mergeCount: 0, styleDensity: 0,
      };
      workbookCache.set(id, { sheets: [sheet], metrics, lastAccess: Date.now() });
      evictCache();
      return [sheet];
    }

    // Download from S3 and re-parse
    const buffer = await this.s3.download(workbook.filePath);
    const ext = path.extname(workbook.filePath).toLowerCase();
    const { sheets, metrics } = await this.parser.parseBuffer(buffer, ext);
    workbookCache.set(id, { sheets, metrics, lastAccess: Date.now() });
    evictCache();
    return sheets;
  }

  async getSheetData(
    workbookId: string,
    sheetId: string,
    range?: { startRow: number; endRow: number },
  ) {
    const sheets = await this.getSheets(workbookId);
    const sheet = sheets.find((s) => s.id === sheetId);
    if (!sheet) throw new NotFoundException(`Sheet ${sheetId} not found`);

    if (!range) return sheet;

    const filtered: Record<string, unknown> = {};
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const rowMatch = ref.match(/\d+/);
      if (!rowMatch) continue;
      const row = parseInt(rowMatch[0], 10) - 1;
      if (row >= range.startRow && row <= range.endRow) {
        filtered[ref] = cell;
      }
    }

    return { ...sheet, cells: filtered };
  }

  async listAll() {
    return this.repo.findAll();
  }

  async createEmpty(name?: string): Promise<UploadResult> {
    const sheet = this.parser.createEmptySheet('Sheet1');
    const classification = 'normal' as WorkbookClassification;

    const workbook = await this.repo.create({
      name: name ?? 'Untitled Workbook',
      classification,
      filePath: '',
      sheetCount: 1,
      usedCells: 0,
    });

    const metrics: WorkbookMetrics = {
      usedCells: 0, formulaCount: 0, volatileCount: 0,
      sheetCount: 1, crossSheetDeps: 0, maxColumns: 0,
      mergeCount: 0, styleDensity: 0,
    };

    workbookCache.set(workbook.id, { sheets: [sheet], metrics, lastAccess: Date.now() });
    evictCache();
    this.logger.log(`Created empty workbook ${workbook.id}`);

    return {
      id: workbook.id,
      name: workbook.name,
      classification,
      sheetCount: 1,
      revisionId: 'R0',
    };
  }

  /** Evict workbook from memory cache */
  evictCache(id: string): void {
    workbookCache.delete(id);
  }

  /** Get cached sheets for action engine */
  getCachedSheets(id: string): Sheet[] | undefined {
    return workbookCache.get(id)?.sheets;
  }

  /** Update cached sheets after action */
  updateCachedSheets(id: string, sheets: Sheet[]): void {
    const existing = workbookCache.get(id);
    if (existing) {
      existing.sheets = sheets;
      existing.lastAccess = Date.now();
    }
  }

  /** Delete workbook: DB record, S3 objects, memory cache, HyperFormula instance */
  async deleteWorkbook(id: string): Promise<void> {
    const workbook = await this.getById(id);

    // Clean up S3 objects (uploads + exports for this workbook)
    await this.s3.deleteByPrefix(`uploads/${id}/`).catch((err: unknown) => {
      this.logger.warn(`Failed to delete S3 uploads for workbook ${id}: ${err instanceof Error ? err.message : err}`);
    });
    await this.s3.deleteByPrefix(`exports/${id}/`).catch((err: unknown) => {
      this.logger.warn(`Failed to delete S3 exports for workbook ${id}: ${err instanceof Error ? err.message : err}`);
    });

    this.evictCache(id);
    if (hfCleanupFn) hfCleanupFn(id);
    await this.repo.delete(id);
    this.logger.log(`Deleted workbook ${id}`);
  }

  /** Rename workbook in DB */
  async renameWorkbook(id: string, name: string): Promise<void> {
    await this.getById(id);
    await this.repo.updateName(id, name);
    this.logger.log(`Renamed workbook ${id} to "${name}"`);
  }
}
