import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBasicAuth, ApiResponse } from '@nestjs/swagger';
import { ActionService } from './action.service';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { actionBatchBodySchema } from '@excelflow/shared';
import type { ActionBatchBodyInput } from '@excelflow/shared';

@ApiTags('actions')
@ApiBasicAuth()
@Controller('api/workbooks/:workbookId/actions')
@UseGuards(BasicAuthGuard)
export class ActionController {
  constructor(private readonly actionService: ActionService) {}

  @Post()
  @ApiOperation({ summary: 'Apply action batch', description: 'Validates and applies a batch of actions (cell edits, formatting, structural changes) to the workbook. Returns changed cells and new revision ID.' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiResponse({ status: 200, description: 'Actions applied, returns revisionId and changedCells' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 422, description: 'Invalid action data' })
  async applyActions(
    @Param('workbookId') workbookId: string,
    @Body(new ZodValidationPipe(actionBatchBodySchema)) body: ActionBatchBodyInput,
  ) {
    return this.actionService.applyBatch({
      ...body,
      workbookId,
    });
  }
}
