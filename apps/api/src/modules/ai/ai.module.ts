import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { AISummaryService } from './ai-summary.service';
import { AIAuditService } from './ai-audit.service';
import { ConcurrencyGuardService } from './concurrency-guard.service';
import { ContextBuilderService } from './context-builder.service';
import { CrossTabBuilderService } from './cross-tab-builder.service';
import { OpenAIClientService } from './openai-client.service';
import { PromptBuilderService } from './prompt-builder.service';
import { WorkbookModule } from '../workbook/workbook.module';
import { ActionModule } from '../action/action.module';
import { SummaryModule } from '../summary/summary.module';

@Module({
  imports: [WorkbookModule, ActionModule, SummaryModule],
  controllers: [AIController],
  providers: [
    AIService,
    AISummaryService,
    AIAuditService,
    ConcurrencyGuardService,
    ContextBuilderService,
    CrossTabBuilderService,
    OpenAIClientService,
    PromptBuilderService,
  ],
  exports: [AIService, AIAuditService, ConcurrencyGuardService, OpenAIClientService, ContextBuilderService, PromptBuilderService],
})
export class AIModule {}
