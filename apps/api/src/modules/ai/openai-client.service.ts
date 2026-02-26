import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { Stream } from 'openai/streaming';
import type { ChatCompletionChunk } from 'openai/resources/chat/completions';

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

type AIProvider = 'openai' | 'groq';

@Injectable()
export class OpenAIClientService implements OnModuleInit {
  private readonly logger = new Logger(OpenAIClientService.name);
  private client: OpenAI | null = null;
  private provider: AIProvider = 'openai';
  private model = 'gpt-4o';
  private maxTokens = 4096;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.provider = (this.config.get<string>('AI_PROVIDER') as AIProvider | undefined) ?? 'openai';

    const openAiApiKey = this.config.get<string>('AI_API_KEY');
    const groqApiKey = this.config.get<string>('GROQ_API_KEY');
    const baseUrlFromEnv = this.config.get<string>('AI_BASE_URL');

    const defaultModel = this.provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o';
    this.model = this.config.get<string>('AI_MODEL') ?? defaultModel;

    const configuredMaxTokens = this.config.get<number>('AI_MAX_TOKENS');
    this.maxTokens =
      typeof configuredMaxTokens === 'number' && Number.isFinite(configuredMaxTokens)
        ? configuredMaxTokens
        : 4096;

    const apiKey = this.provider === 'groq' ? (groqApiKey ?? openAiApiKey) : openAiApiKey;
    const baseURL =
      this.provider === 'groq'
        ? (baseUrlFromEnv ?? 'https://api.groq.com/openai/v1')
        : baseUrlFromEnv;

    if (apiKey) {
      this.client = new OpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        timeout: 120_000,
      });
      this.logger.log(
        `LLM client initialized (provider: ${this.provider}, model: ${this.model}${baseURL ? `, baseURL: ${baseURL}` : ''})`,
      );
    } else {
      this.logger.warn(
        this.provider === 'groq'
          ? 'No Groq key found (set GROQ_API_KEY or AI_API_KEY) - AI features disabled'
          : 'AI_API_KEY not set - AI features disabled',
      );
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!this.client) {
      throw new Error(
        this.provider === 'groq'
          ? 'LLM client not initialized - set GROQ_API_KEY (or AI_API_KEY) in .env'
          : 'LLM client not initialized - set AI_API_KEY in .env',
      );
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
    if (!choice) {
      throw new Error(`No response from ${this.provider === 'groq' ? 'Groq' : 'OpenAI'}`);
    }

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

  /** Create a streaming chat completion — returns an async iterable of chunks */
  async chatStream(request: LLMRequest): Promise<Stream<ChatCompletionChunk>> {
    if (!this.client) {
      throw new Error(
        this.provider === 'groq'
          ? 'LLM client not initialized - set GROQ_API_KEY (or AI_API_KEY) in .env'
          : 'LLM client not initialized - set AI_API_KEY in .env',
      );
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      ...(request.conversationHistory ?? []),
      { role: 'user', content: request.userMessage },
    ];

    return this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: request.maxTokens ?? this.maxTokens,
      temperature: request.temperature ?? 0.2,
      stream: true,
    });
  }
}
