import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { DocxController } from './docx.controller';
import { DocxService } from './docx.service';

@Module({
  imports: [AIModule],
  controllers: [DocxController],
  providers: [DocxService],
  exports: [DocxService],
})
export class DocxModule {}

