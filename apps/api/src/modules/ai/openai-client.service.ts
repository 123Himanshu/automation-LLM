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

/** Which LLM backend to route a request to */
export type LLMTarget = 'openai' | 'groq';

interface ClientSlot {
  client: OpenAI;
  model: string;
  maxTokens: number;
  label: string;
}

/**
 * Dual-provider LLM client.
 *
 * - OpenAI  → used for Excel/spreadsheet AI features (structured JSON, tool calls)
 * - Groq    → used for LLM chat, PDF workspace, DOCX workspace (fast inference)
 *
 * Each consumer picks a target via `chat(req, 'groq')` or defaults to OpenAI.
 */
@Injectable()
export class OpenAIClientService implements OnModuleInit {
  private readonly logger = new Logger(OpenAIClientService.name);
  private openaiSlot: ClientSlot | null = null;
  private groqSlot: ClientSlot | null = null;
  /** Fallback default when no target is specified */
  private defaultTarget: LLMTarget = 'openai';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const configuredMaxTokens = this.config.get<number>('AI_MAX_TOKENS');
    const maxTokens =
      typeof configuredMaxTokens === 'number' && Number.isFinite(configuredMaxTokens)
        ? configuredMaxTokens
        : 4096;

    // ── OpenAI slot ──
    const openAiKey = this.config.get<string>('AI_API_KEY');
    const openAiBaseUrl = this.config.get<string>('AI_BASE_URL');
    const openAiModel = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o';

    if (openAiKey) {
      this.openaiSlot = {
        client: new OpenAI({
          apiKey: openAiKey,
          ...(openAiBaseUrl ? { baseURL: openAiBaseUrl } : {}),
          timeout: 120_000,
        }),
        model: openAiModel,
        maxTokens,
        label: `OpenAI (${openAiModel})`,
      };
      this.logger.log(`OpenAI client initialized (model: ${openAiModel})`);
    } else {
      this.logger.warn('AI_API_KEY not set — OpenAI features disabled');
    }

    // ── Groq slot ──
    const groqKey = this.config.get<string>('GROQ_API_KEY');
    const groqModel = this.config.get<string>('AI_MODEL') ?? 'llama-3.3-70b-versatile';

    if (groqKey) {
      this.groqSlot = {
        client: new OpenAI({
          apiKey: groqKey,
          baseURL: 'https://api.groq.com/openai/v1',
          timeout: 120_000,
        }),
        model: groqModel,
        maxTokens,
        label: `Groq (${groqModel})`,
      };
      this.logger.log(`Groq client initialized (model: ${groqModel})`);
    } else {
      this.logger.warn('GROQ_API_KEY not set — Groq features disabled');
    }

    // Determine default: prefer whatever is available
    if (this.openaiSlot) this.defaultTarget = 'openai';
    else if (this.groqSlot) this.defaultTarget = 'groq';
  }

  /** Check if at least one provider is configured */
  isAvailable(target?: LLMTarget): boolean {
    if (target) return this.getSlot(target) !== null;
    return this.openaiSlot !== null || this.groqSlot !== null;
  }

  private getSlot(target?: LLMTarget): ClientSlot | null {
    const t = target ?? this.defaultTarget;
    if (t === 'groq') return this.groqSlot ?? this.openaiSlot;
    return this.openaiSlot ?? this.groqSlot;
  }

  private requireSlot(target?: LLMTarget): ClientSlot {
    const slot = this.getSlot(target);
    if (!slot) {
      throw new Error(
        'No LLM client initialized — set AI_API_KEY (OpenAI) and/or GROQ_API_KEY (Groq) in .env',
      );
    }
    return slot;
  }

  async chat(request: LLMRequest, target?: LLMTarget): Promise<LLMResponse> {
    const slot = this.requireSlot(target);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      ...(request.conversationHistory ?? []),
      { role: 'user', content: request.userMessage },
    ];

    const completion = await slot.client.chat.completions.create({
      model: slot.model,
      messages,
      max_tokens: request.maxTokens ?? slot.maxTokens,
      temperature: request.temperature ?? 0.2,
      ...(request.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error(`No response from ${slot.label}`);
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
  async chatStream(request: LLMRequest, target?: LLMTarget): Promise<Stream<ChatCompletionChunk>> {
    const slot = this.requireSlot(target);

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      ...(request.conversationHistory ?? []),
      { role: 'user', content: request.userMessage },
    ];

    return slot.client.chat.completions.create({
      model: slot.model,
      messages,
      max_tokens: request.maxTokens ?? slot.maxTokens,
      temperature: request.temperature ?? 0.2,
      stream: true,
    });
  }
}
