import { Controller, Get, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBasicAuth, ApiResponse } from '@nestjs/swagger';
import { JobService } from './job.service';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';

@ApiTags('jobs')
@ApiBasicAuth()
@Controller('api/jobs')
@UseGuards(BasicAuthGuard)
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get job status', description: 'Returns the current status, progress, and result of an async job.' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job status with progress and result' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getStatus(@Param('id') id: string) {
    return this.jobService.getStatus(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel job', description: 'Cancels a running or pending job.' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job cancelled' })
  async cancel(@Param('id') id: string) {
    await this.jobService.cancel(id);
    return { cancelled: true };
  }
}
