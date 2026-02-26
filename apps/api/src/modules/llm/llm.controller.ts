import { Body, Controller, Delete, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBasicAuth } from '@nestjs/swagger';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';
import { LLMService } from './llm.service';
import { LLMDocumentService } from './llm-document.service';
import type { FastifyRequest } from 'fastify';
import { PDFParse } from 'pdf-parse';

interface ChatBody {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  documentId?: string;
}

@ApiTags('llm')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('api/llm')
export class LLMController {
  constructor(
    private readonly llmService: LLMService,
    private readonly documentService: LLMDocumentService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'General-purpose LLM chat with optional document RAG' })
  async chat(@Body() body: ChatBody) {
    const result = await this.llmService.chat({
      message: body.message,
      history: body.history,
      documentId: body.documentId,
    });
    return { success: true, data: result };
  }

  @Post('document/upload')
  @ApiOperation({ summary: 'Upload a PDF for document-aware chat (RAG)' })
  async uploadDocument(@Req() req: FastifyRequest) {
    const file = await req.file();
    if (!file) {
      return { success: false, error: 'No file uploaded' };
    }

    const fileName = file.filename;
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext !== 'pdf') {
      return { success: false, error: 'Only PDF files are supported' };
    }

    const buffer = await file.toBuffer();
    if (buffer.length > 20 * 1024 * 1024) {
      return { success: false, error: 'File too large. Maximum size is 20MB.' };
    }

    // Extract text from PDF using pdf-parse v2
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text;
    const pageCount = result.total;

    if (!text || text.trim().length < 10) {
      await parser.destroy();
      return {
        success: false,
        error: 'Could not extract text from this PDF. It may be image-based or empty.',
      };
    }

    await parser.destroy();

    // Generate document ID and store chunks
    const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const doc = this.documentService.storeDocument(id, fileName, text);

    return {
      success: true,
      data: {
        documentId: doc.id,
        fileName: doc.fileName,
        totalChunks: doc.totalChunks,
        totalChars: doc.totalChars,
        pageCount,
      },
    };
  }

  @Delete('document/:id')
  @ApiOperation({ summary: 'Remove an uploaded document from context' })
  removeDocument(@Param('id') id: string) {
    const removed = this.documentService.removeDocument(id);
    return { success: true, data: { removed } };
  }
}
