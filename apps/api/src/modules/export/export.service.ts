import { Injectable, Logger } from '@nestjs/common';
import { XlsxExportService } from './xlsx-export.service';
import { PdfExportService } from './pdf-export.service';
import { WorkbookService } from '../workbook/workbook.service';
import { JobService } from '../job/job.service';
import { S3Service } from '../../common/services/s3.service';
import type { ExportResult, PdfPrintSettings } from '@excelflow/shared';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly xlsxExport: XlsxExportService,
    private readonly pdfExport: PdfExportService,
    private readonly workbookService: WorkbookService,
    private readonly jobService: JobService,
    private readonly s3: S3Service,
  ) {}

  async exportXlsx(workbookId: string, revisionId: string, sheetIds?: string[]): Promise<ExportResult> {
    const workbook = await this.workbookService.getById(workbookId);
    let sheets = await this.workbookService.getSheets(workbookId);
    if (sheetIds && sheetIds.length > 0) {
      sheets = sheets.filter((s) => sheetIds.includes(s.id));
    }
    const rawFileName = `${workbook.name}-${revisionId}.xlsx`;
    const fileName = this.sanitizeFileName(rawFileName);
    const s3Key = `exports/${workbookId}/${fileName}`;

    if (workbook.classification === 'normal') {
      const buffer = await this.xlsxExport.exportToBuffer(sheets);
      await this.s3.upload(
        s3Key, buffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      const downloadUrl = `/api/workbooks/${workbookId}/export/download/${encodeURIComponent(fileName)}`;
      this.logger.log(`XLSX export complete → s3://${s3Key}`);
      return { downloadUrl, fileName, isAsync: false };
    }

    // Async export for large/heavy
    const jobId = await this.jobService.createAndRun(
      workbookId,
      'export_xlsx',
      async (_jobId, updateProgress) => {
        await updateProgress(10);
        const buffer = await this.xlsxExport.exportToBuffer(sheets);
        await updateProgress(80);
        await this.s3.upload(
          s3Key, buffer,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        await updateProgress(100);
        const downloadUrl = `/api/workbooks/${workbookId}/export/download/${encodeURIComponent(fileName)}`;
        return { downloadUrl, fileName };
      },
    );

    return { jobId, isAsync: true };
  }

  async exportPdf(
    workbookId: string,
    revisionId: string,
    settings: PdfPrintSettings,
  ): Promise<ExportResult> {
    const workbook = await this.workbookService.getById(workbookId);
    let sheets = await this.workbookService.getSheets(workbookId);
    if (settings.sheetIds && settings.sheetIds.length > 0) {
      sheets = sheets.filter((s) => settings.sheetIds!.includes(s.id));
    }
    const rawFileName = `${workbook.name}-${revisionId}.pdf`;
    const fileName = this.sanitizeFileName(rawFileName);
    const s3Key = `exports/${workbookId}/${fileName}`;

    // PDF always runs as job (Playwright is heavy)
    const jobId = await this.jobService.createAndRun(
      workbookId,
      'export_pdf',
      async (_jobId, updateProgress) => {
        await updateProgress(10);
        const buffer = await this.pdfExport.exportToBuffer(sheets, settings);
        await updateProgress(80);
        await this.s3.upload(s3Key, buffer, 'application/pdf');
        await updateProgress(100);
        const basePath = `/api/workbooks/${workbookId}/export/download/${encodeURIComponent(fileName)}`;
        return {
          downloadUrl: basePath,
          previewUrl: `${basePath}?mode=inline`,
          fileName,
        };
      },
    );

    return { jobId, isAsync: true };
  }

  /** Sanitize a file name to safe characters only */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/\.\./g, '')
      .replace(/[/\\]/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/^_+/, '') || 'unnamed-export';
  }

  /** Resolve S3 key for an export file — hardened against path traversal */
  resolveExportS3Key(workbookId: string, fileName: string): string {
    let decoded = fileName;
    try { decoded = decodeURIComponent(fileName); } catch { /* keep original if malformed */ }
    const sanitized = this.sanitizeFileName(decoded);
    return `exports/${workbookId}/${sanitized}`;
  }
}
