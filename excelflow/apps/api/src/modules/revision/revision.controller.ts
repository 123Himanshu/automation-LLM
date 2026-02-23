import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBasicAuth, ApiResponse } from '@nestjs/swagger';
import { RevisionService } from './revision.service';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';

@ApiTags('revisions')
@ApiBasicAuth()
@Controller('api/workbooks/:workbookId/revisions')
@UseGuards(BasicAuthGuard)
export class RevisionController {
  constructor(private readonly revisionService: RevisionService) {}

  @Get()
  @ApiOperation({ summary: 'List revisions', description: 'Returns all revisions for a workbook, ordered by version.' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  async list(@Param('workbookId') workbookId: string) {
    return this.revisionService.listRevisions(workbookId);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Get latest revision' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  async getLatest(@Param('workbookId') workbookId: string) {
    return this.revisionService.getLatest(workbookId);
  }

  @Get(':version')
  @ApiOperation({ summary: 'Get revision by version number' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiParam({ name: 'version', description: 'Version number' })
  async getByVersion(
    @Param('workbookId') workbookId: string,
    @Param('version') version: string,
  ) {
    return this.revisionService.getByVersion(workbookId, parseInt(version, 10));
  }

  @Post(':revId/revert')
  @ApiOperation({ summary: 'Revert to revision', description: 'Creates a new revision that reverts the workbook state to the specified revision.' })
  @ApiParam({ name: 'workbookId', description: 'Workbook ID' })
  @ApiParam({ name: 'revId', description: 'Revision ID to revert to' })
  @ApiResponse({ status: 200, description: 'Revert successful, returns new revision' })
  async revert(
    @Param('workbookId') workbookId: string,
    @Param('revId') revId: string,
  ) {
    return this.revisionService.revertToRevision(workbookId, revId);
  }
}
