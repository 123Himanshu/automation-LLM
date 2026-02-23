import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export interface LLMRequest {
  systemPrompt: string;
  userMessage: string;
  conversationHistory?: ChatCompletionMessageParam[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
}

export interface LLMResponse {
  content: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: string;
}

@Injectable()
export class OpenAIClientService implements OnModuleInit {
  private readonly logger = new Logger(OpenAIClientService.name);
  private client: OpenAI | null = null;
  private model = 'gpt-4o';
  private maxTokens = 16384;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('AI_API_KEY');
    this.model = this.config.get<string>('AI_MODEL') ?? 'gpt-4o';
    this.maxTokens = parseInt(this.config.get<string>('AI_MAX_TOKENS') ?? '4096', 10);

    if (apiKey) {
      this.client = new OpenAI({ apiKey, timeout: 120_000 }); // 2 minute timeout
      this.logger.log(`OpenAI client initialized (model: ${this.model})`);
    } else {
      this.logger.warn('AI_API_KEY not set — AI features disabled');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized — set AI_API_KEY in .env');
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      ...(request.conversationHistory ?? []),
      { role: 'user', content: request.userMessage },
    ];

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: request.maxTokens ?? this.maxTokens,
      temperature: request.temperature ?? 0.2,
      ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    });

    const choice = completion.choices[0];
    if (!choice) throw new Error('No response from OpenAI');

    return {
      content: choice.message.content ?? '',
      usage: completion.usage
        ? {
            promptTokens: completion.usage.prompt_tokens,
            completionTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
      finishReason: choice.finish_reason ?? 'unknown',
    };
  }
}
