import {
    Controller,
    Post,
    Get,
    Patch,
    Delete,
    Param,
    Body,
    Req,
    Res,
    UseGuards,
    Logger,
    BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBasicAuth } from '@nestjs/swagger';
import { PdfService } from './pdf.service';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';
import { buildSSEHeaders } from '../../common/utils/sse-headers';
import type { FastifyRequest, FastifyReply } from 'fastify';

@ApiTags('pdf')
@ApiBasicAuth()
@Controller('api/pdf')
@UseGuards(BasicAuthGuard)
export class PdfController {
    private readonly logger = new Logger(PdfController.name);

    constructor(private readonly pdfService: PdfService) { }

    /* ─── Upload PDF ─── */
    @Post('upload')
    @ApiOperation({ summary: 'Upload a PDF and create a session' })
    async upload(@Req() request: FastifyRequest) {
        const file = await request.file();
        if (!file) {
            throw new BadRequestException('No file provided');
        }

        const buffer = await file.toBuffer();
        const fileName = file.filename || 'document.pdf';

        const result = await this.pdfService.uploadAndExtract(buffer, fileName);
        return result;
    }

    /* ─── List Sessions ─── */
    @Get('sessions')
    @ApiOperation({ summary: 'List all PDF sessions' })
    async listSessions() {
        const sessions = await this.pdfService.listSessions();
        return sessions;
    }

    /* ─── Get Session ─── */
    @Get('sessions/:id')
    @ApiOperation({ summary: 'Get a PDF session with messages' })
    async getSession(@Param('id') id: string) {
        const session = await this.pdfService.getSession(id);
        return session;
    }

    /* ─── Chat (Streaming SSE) ─── */
    @Post('sessions/:id/chat')
    @ApiOperation({ summary: 'Chat with AI about the PDF (streaming)' })
    async chat(
        @Param('id') id: string,
        @Body() body: { message: string },
        @Req() req: FastifyRequest,
        @Res({ passthrough: false }) reply: FastifyReply,
    ) {
        // Set SSE + CORS headers for raw streaming (bypasses Fastify's send pipeline)
        reply.raw.writeHead(200, buildSSEHeaders(reply, req));

        try {
            for await (const chunk of this.pdfService.chatStream(id, body.message)) {
                const sseData = JSON.stringify(chunk);
                reply.raw.write(`data: ${sseData}\n\n`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Stream error';
            this.logger.error(`SSE error: ${msg}`);
            reply.raw.write(`data: ${JSON.stringify({ type: 'error', content: msg })}\n\n`);
        }

        reply.raw.end();
    }

    /* ─── Regenerate PDF ─── */
    @Post('sessions/:id/regenerate')
    @ApiOperation({ summary: 'Regenerate PDF from current document state' })
    async regenerate(@Param('id') id: string) {
        const result = await this.pdfService.regeneratePdf(id);
        return result;
    }

    /* ─── Download PDF ─── */
    @Get('sessions/:id/download')
    @ApiOperation({ summary: 'Download the current PDF file' })
    async download(@Param('id') id: string, @Res({ passthrough: false }) reply: FastifyReply) {
        const session = await this.pdfService.getSession(id);
        const filePath = this.pdfService.getFilePath(session);

        const fs = await import('fs');
        const stream = fs.createReadStream(filePath);

        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `inline; filename="${session.fileName}"`);
        reply.send(stream);
    }

    /* ─── Update Content (Manual Edit) ─── */
    @Patch('sessions/:id/content')
    @ApiOperation({ summary: 'Save manually edited document content' })
    async updateContent(@Param('id') id: string, @Body() body: { html: string }) {
        const result = await this.pdfService.updateContent(id, body.html);
        return result;
    }

    /* ─── Replace Text in PDF ─── */
    @Post('sessions/:id/replace-text')
    @ApiOperation({ summary: 'Find and replace text in the original PDF' })
    async replaceText(
        @Param('id') id: string,
        @Body() body: { replacements: Array<{ find: string; replace: string }> },
    ) {
        const result = await this.pdfService.replaceTextInPdf(id, body.replacements);
        return result;
    }

    /* ─── Delete Session ─── */
    @Delete('sessions/:id')
    @ApiOperation({ summary: 'Delete a PDF session' })
    async deleteSession(@Param('id') id: string) {
        const result = await this.pdfService.deleteSession(id);
        return result;
    }
}
