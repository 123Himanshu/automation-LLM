import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBasicAuth, ApiResponse } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { WorkbookService } from './workbook.service';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';

@ApiTags('workbooks')
@ApiBasicAuth()
@Controller('api/workbooks')
@UseGuards(BasicAuthGuard)
export class WorkbookController {
  constructor(private readonly workbookService: WorkbookService) {}

  @Post('create')
  @ApiOperation({ summary: 'Create empty workbook', description: 'Creates a new empty workbook with a single blank sheet.' })
  @ApiResponse({ status: 201, description: 'Workbook created' })
  async createEmpty(@Req() request: FastifyRequest) {
    const body = request.body as { name?: string } | undefined;
    return this.workbookService.createEmpty(body?.name);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload XLSX/CSV file', description: 'Uploads and parses an Excel or CSV file into a workbook.' })
  @ApiResponse({ status: 201, description: 'File uploaded and parsed' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async upload(@Req() request: FastifyRequest) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const buffer = await file.toBuffer();
    return this.workbookService.upload(buffer, file.filename);
  }

  @Get()
  @ApiOperation({ summary: 'List all workbooks' })
  @ApiResponse({ status: 200, description: 'Array of workbook metadata' })
  async listAll() {
    return this.workbookService.listAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workbook by ID' })
  @ApiParam({ name: 'id', description: 'Workbook ID' })
  @ApiResponse({ status: 200, description: 'Workbook metadata' })
  @ApiResponse({ status: 404, description: 'Workbook not found' })
  async getById(@Param('id') id: string) {
    const workbook = await this.workbookService.getById(id);
    // Shape response to WorkbookMeta — never leak filePath (S3 key) to frontend
    return {
      id: workbook.id,
      name: workbook.name,
      classification: workbook.classification,
      sheetCount: workbook.sheetCount,
      usedCells: workbook.usedCells,
      createdAt: workbook.createdAt,
      updatedAt: workbook.updatedAt,
    };
  }

  @Get(':id/sheets')
  @ApiOperation({ summary: 'List sheets in workbook', description: 'Returns sheet summaries (id, name, usedRange) without cell data.' })
  @ApiParam({ name: 'id', description: 'Workbook ID' })
  async getSheets(@Param('id') id: string) {
    const sheets = await this.workbookService.getSheets(id);
    return sheets.map((s) => ({
      id: s.id,
      name: s.name,
      usedRange: s.usedRange,
      frozenRows: s.frozenRows,
      frozenCols: s.frozenCols,
    }));
  }

  @Get(':id/sheets/:sheetId')
  @ApiOperation({ summary: 'Get sheet data', description: 'Returns full sheet with cell data. Supports optional row range for chunked loading.' })
  @ApiParam({ name: 'id', description: 'Workbook ID' })
  @ApiParam({ name: 'sheetId', description: 'Sheet ID' })
  @ApiQuery({ name: 'startRow', required: false, description: 'Start row (0-based)' })
  @ApiQuery({ name: 'endRow', required: false, description: 'End row (0-based)' })
  @ApiResponse({ status: 200, description: 'Sheet with cell data' })
  @ApiResponse({ status: 404, description: 'Sheet not found' })
  async getSheetData(
    @Param('id') workbookId: string,
    @Param('sheetId') sheetId: string,
    @Query('startRow') startRow?: string,
    @Query('endRow') endRow?: string,
  ) {
    const range =
      startRow !== undefined && endRow !== undefined
        ? { startRow: parseInt(startRow, 10), endRow: parseInt(endRow, 10) }
        : undefined;

    return this.workbookService.getSheetData(workbookId, sheetId, range);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workbook' })
  @ApiParam({ name: 'id', description: 'Workbook ID' })
  @ApiResponse({ status: 200, description: 'Workbook deleted' })
  @ApiResponse({ status: 404, description: 'Workbook not found' })
  async deleteWorkbook(@Param('id') id: string) {
    await this.workbookService.deleteWorkbook(id);
    return { success: true };
  }

  @Patch(':id/rename')
  @ApiOperation({ summary: 'Rename workbook' })
  @ApiParam({ name: 'id', description: 'Workbook ID' })
  @ApiResponse({ status: 200, description: 'Workbook renamed' })
  @ApiResponse({ status: 404, description: 'Workbook not found' })
  async renameWorkbook(@Param('id') id: string, @Req() request: FastifyRequest) {
    const body = request.body as { name?: string } | undefined;
    if (!body?.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw new BadRequestException('Name is required');
    }
    await this.workbookService.renameWorkbook(id, body.name.trim());
    return { success: true };
  }
}
