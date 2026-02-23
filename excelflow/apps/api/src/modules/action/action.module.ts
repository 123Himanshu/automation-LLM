import { Module } from '@nestjs/common';
import { ActionController } from './action.controller';
import { ActionService } from './action.service';
import { ActionValidatorService } from './action-validator.service';
import { RecalcService } from './recalc.service';
import { StructuralActionService } from './structural-action.service';
import { WorkbookModule } from '../workbook/workbook.module';
import { RevisionModule } from '../revision/revision.module';

@Module({
  imports: [WorkbookModule, RevisionModule],
  controllers: [ActionController],
  providers: [ActionService, ActionValidatorService, RecalcService, StructuralActionService],
  exports: [ActionService, RecalcService],
})
export class ActionModule {}
