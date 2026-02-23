import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBasicAuth, ApiResponse } from '@nestjs/swagger';
import { AIService } from './ai.service';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { aiPromptBodySchema, aiConfirmBodySchema } from '@excelflow/shared';
import type { AiPromptBodyInput, AiConfirmBodyInput, AIToolCall } from '@excelflow/shared';

@ApiTags('ai')
@ApiBasicAuth()
@Controller('api/workbooks/:workbookId/ai')
@UseGuards(BasicAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('prompt')
  @ApiOperation({ summary: 'Send AI prompt', description: 'Sends a natural language prompt to the AI assistant. Returns a context-aware response about the workbook data.' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiResponse({ status: 200, description: 'AI response message' })
  async prompt(
    @Param('workbookId') workbookId: string,
    @Body(new ZodValidationPipe(aiPromptBodySchema)) body: AiPromptBodyInput,
  ) {
    return this.aiService.processPrompt({
      workbookId,
      message: body.message,
      activeSheet: body.activeSheet,
      selectedRange: body.selectedRange,
      history: body.history,
    });
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm AI tool call', description: 'Confirms and executes a pending AI tool call that required user confirmation.' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiResponse({ status: 200, description: 'Tool call execution result' })
  async confirmToolCall(
    @Param('workbookId') workbookId: string,
    @Body(new ZodValidationPipe(aiConfirmBodySchema)) body: AiConfirmBodyInput,
  ) {
    return this.aiService.executeToolCall(workbookId, {
      ...body.toolCall,
      actions: body.toolCall.actions as AIToolCall['actions'],
      requiresConfirmation: false,
    });
  }
}
