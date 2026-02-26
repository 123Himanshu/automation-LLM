import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBasicAuth } from '@nestjs/swagger';
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard';
import { LLMService } from './llm.service';

interface ChatBody {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

@ApiTags('llm')
@ApiBasicAuth()
@UseGuards(BasicAuthGuard)
@Controller('api/llm')
export class LLMController {
  constructor(private readonly llmService: LLMService) {}

  @Post('chat')
  @ApiOperation({ summary: 'General-purpose LLM chat', description: 'Send a message and get an AI response. Supports conversation history.' })
  async chat(@Body() body: ChatBody) {
    const result = await this.llmService.chat({
      message: body.message,
      history: body.history,
    });
    return { success: true, data: result };
  }
}
