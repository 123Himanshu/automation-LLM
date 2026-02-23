import { Global, Module } from '@nestjs/common';
import { JobService } from './job.service';
import { JobRepository } from './job.repository';
import { JobController } from './job.controller';

@Global()
@Module({
  controllers: [JobController],
  providers: [JobService, JobRepository],
  exports: [JobService],
})
export class JobModule {}
