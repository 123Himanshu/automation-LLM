import { Controller, Post, Get, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBasicAuth, ApiResponse } from '@nestjs/swagger';
import { SummaryService } from './summary.service';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { summaryRequestBodySchema } from '@excelflow/shared';
import type { SummaryRequestBodyInput } from '@excelflow/shared';

@ApiTags('summary')
@ApiBasicAuth()
@Controller('api/workbooks/:workbookId/summary')
@UseGuards(BasicAuthGuard)
export class SummaryController {
  constructor(private readonly summaryService: SummaryService) {}

  @Get('columns')
  @ApiOperation({ summary: 'Get available columns', description: 'Returns column headers for the active sheet, used to populate the column selection checkboxes in the summary modal.' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiQuery({ name: 'activeSheet', required: false, description: 'Sheet ID or name' })
  @ApiResponse({ status: 200, description: 'Array of column header names' })
  async getColumns(
    @Param('workbookId') workbookId: string,
    @Query('activeSheet') activeSheet?: string,
  ) {
    return this.summaryService.getAvailableColumns(workbookId, activeSheet);
  }

  @Post()
  @ApiOperation({ summary: 'Generate quick summary', description: 'Analyzes column types and computes statistics. If AI is configured, uses LLM for intelligent summary. Supports selectedColumns for checkbox-based column filtering.' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiResponse({ status: 200, description: 'Summary generated, returns new revision' })
  async generateSummary(
    @Param('workbookId') workbookId: string,
    @Body(new ZodValidationPipe(summaryRequestBodySchema)) body: SummaryRequestBodyInput,
  ) {
    return this.summaryService.generateSummary({
      workbookId,
      scope: body.scope,
      outputLocation: body.outputLocation,
      depth: body.depth,
      mode: body.mode,
      activeSheet: body.activeSheet,
      selectedRange: body.selectedRange,
      selectedColumns: body.selectedColumns,
      pivotRowField: body.pivotRowField,
      pivotColumnField: body.pivotColumnField,
      pivotValueField: body.pivotValueField,
      pivotAggregation: body.pivotAggregation,
    });
  }
}
