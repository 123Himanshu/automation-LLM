import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { XlsxExportService } from './xlsx-export.service';
import { PdfExportService } from './pdf-export.service';
import { WorkbookModule } from '../workbook/workbook.module';
import { JobModule } from '../job/job.module';

@Module({
  imports: [WorkbookModule, JobModule],
  controllers: [ExportController],
  providers: [ExportService, XlsxExportService, PdfExportService],
  exports: [ExportService],
})
export class ExportModule {}
