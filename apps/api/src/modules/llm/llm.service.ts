import { Injectable, Logger } from '@nestjs/common';
import { OpenAIClientService } from '../ai/openai-client.service';
import { LLMDocumentService } from './llm-document.service';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { FastifyReply } from 'fastify';

interface ChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  documentId?: string;
}

interface ChatResponse {
  role: 'assistant';
  content: string;
  timestamp: string;
}

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Max tokens to allocate for conversation history */
const HISTORY_TOKEN_BUDGET = 4000;

const SYSTEM_PROMPT = `You are ExcelFlow AI — a helpful, knowledgeable assistant built into a productivity suite that handles spreadsheets, PDFs, and DOCX files.

You can answer general questions on any topic: coding, data analysis, writing, math, science, business, and more.

Guidelines:
- Be concise and direct. Use markdown formatting for readability.
- For code, always specify the language in fenced code blocks.
- For math, show step-by-step work.
- For data questions, suggest formulas or approaches.
- If the user asks about ExcelFlow features, explain what the app can do (Excel editing, PDF editing, DOCX editing, AI assistance, summaries, exports).
- Be friendly and professional.`;

function buildDocumentSystemPrompt(
  fileName: string,
  pageCount: number,
  chunkCount: number,
  context: string,
): string {
  return `You are ExcelFlow AI — a helpful assistant with access to a user-uploaded document.

The user has uploaded "${fileName}" (${pageCount} pages, ${chunkCount} text sections extracted).
Relevant excerpts from the document are provided below as context. Use ONLY these excerpts to answer document-related questions. If the answer is not in the provided context, say so clearly.

Guidelines:
- Answer based on the document context provided. Do not fabricate information.
- When referencing information, cite the excerpt number (e.g. "According to Excerpt 3...").
- Reference the document by name: "Based on your document '${fileName}'..."
- Use markdown formatting for readability.
- If the user asks something unrelated to the document, you can still answer general questions.
- Be concise, accurate, and helpful.

--- DOCUMENT CONTEXT ---
${context}
--- END CONTEXT ---`;
}

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);

  constructor(
    private readonly openai: OpenAIClientService,
    private readonly documentService: LLMDocumentService,
  ) {}

  /** Trim history to fit within token budget, keeping most recent messages */
  private trimHistory(
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): ChatCompletionMessageParam[] {
    const result: ChatCompletionMessageParam[] = [];
    let tokenCount = 0;

    // Walk backwards from most recent, adding messages until budget exhausted
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (!msg) continue;
      const msgTokens = estimateTokens(msg.content);
      if (tokenCount + msgTokens > HISTORY_TOKEN_BUDGET && result.length > 0) break;
      result.unshift({ role: msg.role, content: msg.content });
      tokenCount += msgTokens;
    }

    return result;
  }

  private buildSystemPrompt(request: ChatRequest): string {
    if (!request.documentId) return SYSTEM_PROMPT;

    const doc = this.documentService.getDocument(request.documentId);
    const chunks = this.documentService.getRelevantChunks(
      request.documentId,
      request.message,
    );

    if (chunks.length === 0) return SYSTEM_PROMPT;

    const context = chunks.map((c, i) => `[Excerpt ${i + 1}]\n${c}`).join('\n\n');
    this.logger.log(`RAG: injected ${chunks.length} chunks for doc ${request.documentId}`);

    return buildDocumentSystemPrompt(
      doc?.fileName ?? 'document',
      0, // page count not stored in doc service, but included in prompt
      chunks.length,
      context,
    );
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.openai.isAvailable()) {
      return {
        role: 'assistant',
        content: 'AI is not configured. Please set the appropriate API key (`GROQ_API_KEY` or `AI_API_KEY`) in the server environment variables.',
        timestamp: new Date().toISOString(),
      };
    }

    const systemPrompt = this.buildSystemPrompt(request);
    const conversationHistory = this.trimHistory(request.history ?? []);

    const response = await this.openai.chat({
      systemPrompt,
      userMessage: request.message,
      conversationHistory,
      temperature: 0.4,
      responseFormat: 'text',
    });

    this.logger.log(`LLM chat — tokens: ${response.usage?.totalTokens ?? '?'}`);

    return {
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
    };
  }

  /** Stream a chat response via SSE */
  async chatStream(request: ChatRequest, reply: FastifyReply): Promise<void> {
    if (!this.openai.isAvailable()) {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const errData = JSON.stringify({ type: 'error', content: 'AI is not configured.' });
      reply.raw.write(`data: ${errData}\n\n`);
      reply.raw.end();
      return;
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const systemPrompt = this.buildSystemPrompt(request);
    const conversationHistory = this.trimHistory(request.history ?? []);

    try {
      const stream = await this.openai.chatStream({
        systemPrompt,
        userMessage: request.message,
        conversationHistory,
        temperature: 0.4,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          const data = JSON.stringify({ type: 'token', content: delta });
          reply.raw.write(`data: ${data}\n\n`);
        }
        if (chunk.choices[0]?.finish_reason) {
          const done = JSON.stringify({ type: 'done', finishReason: chunk.choices[0].finish_reason });
          reply.raw.write(`data: ${done}\n\n`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stream failed';
      this.logger.error(`Stream error: ${msg}`);
      const errData = JSON.stringify({ type: 'error', content: msg });
      reply.raw.write(`data: ${errData}\n\n`);
    } finally {
      reply.raw.end();
    }
  }
}
