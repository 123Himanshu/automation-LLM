import { Module } from '@nestjs/common';
import { SummaryController } from './summary.controller';
import { SummaryService } from './summary.service';
import { ColumnDetectorService } from './column-detector.service';
import { DataNormalizerService } from './data-normalizer.service';
import { PivotBuilderService } from './pivot-builder.service';
import { WorkbookModule } from '../workbook/workbook.module';
import { ActionModule } from '../action/action.module';

@Module({
  imports: [WorkbookModule, ActionModule],
  controllers: [SummaryController],
  providers: [SummaryService, ColumnDetectorService, DataNormalizerService, PivotBuilderService],
  exports: [SummaryService, ColumnDetectorService, DataNormalizerService, PivotBuilderService],
})
export class SummaryModule {}
