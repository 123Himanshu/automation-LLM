import { Module } from '@nestjs/common';
import { LLMController } from './llm.controller';
import { LLMService } from './llm.service';
import { LLMDocumentService } from './llm-document.service';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [AIModule],
  controllers: [LLMController],
  providers: [LLMService, LLMDocumentService],
})
export class LLMModule {}
