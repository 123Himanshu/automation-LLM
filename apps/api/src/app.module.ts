import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { S3Module } from './common/services/s3.module';
import { WorkbookModule } from './modules/workbook/workbook.module';
import { RevisionModule } from './modules/revision/revision.module';
import { ActionModule } from './modules/action/action.module';
import { JobModule } from './modules/job/job.module';
import { ExportModule } from './modules/export/export.module';
import { SummaryModule } from './modules/summary/summary.module';
import { AIModule } from './modules/ai/ai.module';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { DocxModule } from './modules/docx/docx.module';
import { LLMModule } from './modules/llm/llm.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    S3Module,
    WorkbookModule,
    RevisionModule,
    ActionModule,
    JobModule,
    ExportModule,
    SummaryModule,
    AIModule,
    CleanupModule,
    PdfModule,
    DocxModule,
    LLMModule,
  ],
})
export class AppModule { }
