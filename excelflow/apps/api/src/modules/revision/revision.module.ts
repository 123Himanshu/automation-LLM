import { Module } from '@nestjs/common';
import { RevisionService } from './revision.service';
import { RevisionRepository } from './revision.repository';
import { RevisionController } from './revision.controller';

@Module({
  controllers: [RevisionController],
  providers: [RevisionService, RevisionRepository],
  exports: [RevisionService],
})
export class RevisionModule {}
