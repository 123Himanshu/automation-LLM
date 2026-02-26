import { Injectable, Logger } from '@nestjs/common';
import { OpenAIClientService } from '../ai/openai-client.service';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

interface ChatRequest {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
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

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);

  constructor(private readonly openai: OpenAIClientService) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.openai.isAvailable()) {
      return {
        role: 'assistant',
        content: 'AI is not configured. Please set `AI_API_KEY` in the server environment variables.',
        timestamp: new Date().toISOString(),
      };
    }

    const conversationHistory: ChatCompletionMessageParam[] = (request.history ?? []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.openai.chat({
      systemPrompt: SYSTEM_PROMPT,
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
