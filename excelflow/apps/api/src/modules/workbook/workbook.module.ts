import { Module } from '@nestjs/common';
import { WorkbookController } from './workbook.controller';
import { WorkbookService } from './workbook.service';
import { WorkbookRepository } from './workbook.repository';
import { XlsxParserService } from './xlsx-parser.service';

@Module({
  controllers: [WorkbookController],
  providers: [WorkbookService, WorkbookRepository, XlsxParserService],
  exports: [WorkbookService, WorkbookRepository],
})
export class WorkbookModule {}
