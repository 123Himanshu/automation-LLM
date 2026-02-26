import { Injectable, Logger } from '@nestjs/common';
import { OpenAIClientService } from '../ai/openai-client.service';
import { LLMDocumentService } from './llm-document.service';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

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

const SYSTEM_PROMPT = `You are ExcelFlow AI — a helpful, knowledgeable assistant built into a productivity suite that handles spreadsheets, PDFs, and DOCX files.

You can answer general questions on any topic: coding, data analysis, writing, math, science, business, and more.

Guidelines:
- Be concise and direct. Use markdown formatting for readability.
- For code, always specify the language in fenced code blocks.
- For math, show step-by-step work.
- For data questions, suggest formulas or approaches.
- If the user asks about ExcelFlow features, explain what the app can do (Excel editing, PDF editing, DOCX editing, AI assistance, summaries, exports).
- Be friendly and professional.`;

const DOCUMENT_SYSTEM_PROMPT = `You are ExcelFlow AI — a helpful assistant with access to a user-uploaded document.

The user has uploaded a PDF document. Relevant excerpts from the document are provided below as context. Use ONLY these excerpts to answer document-related questions. If the answer is not in the provided context, say so clearly.

Guidelines:
- Answer based on the document context provided. Do not fabricate information.
- Quote specific parts of the document when relevant.
- Use markdown formatting for readability.
- If the user asks something unrelated to the document, you can still answer general questions.
- Be concise, accurate, and helpful.

--- DOCUMENT CONTEXT ---
{context}
--- END CONTEXT ---`;

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);

  constructor(
    private readonly openai: OpenAIClientService,
    private readonly documentService: LLMDocumentService,
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.openai.isAvailable()) {
      return {
        role: 'assistant',
        content: 'AI is not configured. Please set the appropriate API key (`GROQ_API_KEY` or `AI_API_KEY`) in the server environment variables.',
        timestamp: new Date().toISOString(),
      };
    }

    const conversationHistory: ChatCompletionMessageParam[] = (request.history ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Build system prompt — with or without document context (RAG)
    let systemPrompt = SYSTEM_PROMPT;

    if (request.documentId) {
      const chunks = this.documentService.getRelevantChunks(
        request.documentId,
        request.message,
      );
      if (chunks.length > 0) {
        const context = chunks
          .map((c, i) => `[Excerpt ${i + 1}]\n${c}`)
          .join('\n\n');
        systemPrompt = DOCUMENT_SYSTEM_PROMPT.replace('{context}', context);
        this.logger.log(
          `RAG: injected ${chunks.length} chunks for doc ${request.documentId}`,
        );
      }
    }

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
}
