import { Controller, Get, Post, Param, Query, Body, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBasicAuth, ApiResponse } from '@nestjs/swagger';
import { ExportService } from './export.service';
import { S3Service } from '../../common/services/s3.service';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { pdfPrintSettingsSchema } from '@excelflow/shared';
import type { PdfPrintSettingsInput } from '@excelflow/shared';
import type { FastifyReply } from 'fastify';
import * as path from 'path';

@ApiTags('export')
@ApiBasicAuth()
@Controller('api/workbooks/:workbookId/export')
@UseGuards(BasicAuthGuard)
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly s3: S3Service,
  ) {}

  @Get('xlsx')
  @ApiOperation({ summary: 'Export as XLSX' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiQuery({ name: 'rev', required: false, description: 'Revision ID' })
  @ApiQuery({ name: 'sheetIds', required: false, description: 'Comma-separated sheet IDs to export' })
  @ApiResponse({ status: 200, description: 'Download URL or job ID' })
  async exportXlsx(
    @Param('workbookId') workbookId: string,
    @Query('rev') revisionId: string,
    @Query('sheetIds') sheetIdsParam?: string,
  ) {
    const sheetIds = sheetIdsParam ? sheetIdsParam.split(',').filter(Boolean) : undefined;
    return this.exportService.exportXlsx(workbookId, revisionId ?? 'latest', sheetIds);
  }

  @Post('pdf')
  @ApiOperation({ summary: 'Export as PDF' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiQuery({ name: 'rev', required: false, description: 'Revision ID' })
  @ApiResponse({ status: 200, description: 'Job ID for tracking' })
  async exportPdf(
    @Param('workbookId') workbookId: string,
    @Query('rev') revisionId: string,
    @Body(new ZodValidationPipe(pdfPrintSettingsSchema)) settings: PdfPrintSettingsInput,
  ) {
    return this.exportService.exportPdf(workbookId, revisionId ?? 'latest', settings);
  }

  @Get('download/:fileName')
  @ApiOperation({ summary: 'Download exported file from S3' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiParam({ name: 'fileName', description: 'File name to download' })
  @ApiQuery({ name: 'mode', required: false, description: 'inline or attachment' })
  async downloadFile(
    @Param('workbookId') workbookId: string,
    @Param('fileName') fileName: string,
    @Query('mode') mode: string | undefined,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const s3Key = this.exportService.resolveExportS3Key(workbookId, fileName);

    let stream: import('stream').Readable;
    let contentLength: number;
    try {
      const result = await this.s3.getStream(s3Key);
      stream = result.stream;
      contentLength = result.contentLength;
    } catch {
      throw new NotFoundException('Export file not found');
    }

    const ext = path.extname(fileName).toLowerCase();
    const contentType = ext === '.pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    const disposition = mode === 'inline' ? 'inline' : 'attachment';

    // Sanitize fileName for Content-Disposition header to prevent HTTP header injection.
    // Strip control chars, quotes, newlines, and non-ASCII. RFC 6266 recommends
    // filename* with UTF-8 encoding for non-ASCII names.
    const safeFileName = fileName
      .replace(/[\r\n\t]/g, '')       // strip control chars that enable header injection
      .replace(/["\\]/g, '_')         // strip quotes and backslashes
      .replace(/[^\x20-\x7E]/g, '_'); // strip non-printable / non-ASCII

    reply
      .header('Content-Type', contentType)
      .header('Content-Disposition', `${disposition}; filename="${safeFileName}"`)
      .header('Content-Length', contentLength)
      .send(stream);
  }
}
