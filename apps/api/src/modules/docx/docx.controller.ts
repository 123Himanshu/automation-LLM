import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBasicAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';
import { buildSSEHeaders } from '../../common/utils/sse-headers';
import { DocxService } from './docx.service';

@ApiTags('docx')
@ApiBasicAuth()
@Controller('api/docx')
@UseGuards(BasicAuthGuard)
export class DocxController {
  private readonly logger = new Logger(DocxController.name);

  constructor(private readonly docxService: DocxService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a DOCX and create a session' })
  async upload(@Req() request: FastifyRequest) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const buffer = await file.toBuffer();
    const fileName = file.filename || 'document.docx';
    return this.docxService.uploadAndExtract(buffer, fileName);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List all DOCX sessions' })
  async listSessions() {
    return this.docxService.listSessions();
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get a DOCX session with messages' })
  async getSession(@Param('id') id: string) {
    return this.docxService.getSession(id);
  }

  @Post('sessions/:id/chat')
  @ApiOperation({ summary: 'Chat with AI about the DOCX (streaming)' })
  async chat(
    @Param('id') id: string,
    @Body() body: { message: string },
    @Res({ passthrough: false }) reply: FastifyReply,
  ) {
    // Set SSE + CORS headers for raw streaming (bypasses Fastify's send pipeline)
    reply.raw.writeHead(200, buildSSEHeaders(reply));

    try {
      for await (const chunk of this.docxService.chatStream(id, body.message)) {
        reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Stream error';
      this.logger.error(`SSE error: ${message}`);
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: message })}\n\n`);
    }

    reply.raw.end();
  }

  @Post('sessions/:id/regenerate')
  @ApiOperation({ summary: 'Regenerate DOCX from current document state' })
  async regenerate(@Param('id') id: string) {
    return this.docxService.regenerateDocx(id);
  }

  @Get('sessions/:id/download')
  @ApiOperation({ summary: 'Download the current DOCX file' })
  async download(@Param('id') id: string, @Res({ passthrough: false }) reply: FastifyReply) {
    const session = await this.docxService.getSession(id);
    const filePath = this.docxService.getFilePath(session);
    const fs = await import('fs');
    const stream = fs.createReadStream(filePath);

    reply.header(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    reply.header('Content-Disposition', `attachment; filename="${session.fileName}"`);
    reply.send(stream);
  }

  @Patch('sessions/:id/content')
  @ApiOperation({ summary: 'Save manually edited DOCX content' })
  async updateContent(@Param('id') id: string, @Body() body: { html: string }) {
    return this.docxService.updateContent(id, body.html);
  }

  @Post('sessions/:id/replace-text')
  @ApiOperation({ summary: 'Find and replace text in the original DOCX' })
  async replaceText(
    @Param('id') id: string,
    @Body() body: { replacements: Array<{ find: string; replace: string }> },
  ) {
    return this.docxService.replaceTextInDocx(id, body.replacements);
  }

  @Delete('sessions/:id')
  @ApiOperation({ summary: 'Delete a DOCX session' })
  async deleteSession(@Param('id') id: string) {
    return this.docxService.deleteSession(id);
  }
}

