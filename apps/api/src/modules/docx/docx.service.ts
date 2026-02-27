import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OpenAIClientService } from '../ai/openai-client.service';
import * as fs from 'fs';
import * as path from 'path';

interface ChatStreamChunk {
  type: 'delta' | 'done' | 'error' | 'content_updated';
  content?: string;
  documentHtml?: string;
}

interface ReplacementSpec {
  find: string;
  replace: string;
  maxOccurrences?: number;
}

interface ReplacementRuntimeState {
  find: string;
  replace: string;
  remaining: number;
  applied: number;
}

interface DiffOp {
  type: 'keep' | 'delete' | 'insert';
  value: string;
}

interface TextNode {
  text: string;
}

@Injectable()
export class DocxService {
  private readonly logger = new Logger(DocxService.name);
  private readonly uploadsDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIClientService,
  ) {
    this.uploadsDir = path.resolve(process.cwd(), 'uploads', 'docx');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async uploadAndExtract(fileBuffer: Buffer, fileName: string) {
    if (!this.isDocxFileName(fileName)) {
      throw new BadRequestException('Only .docx files are supported in DOCX workspace');
    }

    const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(this.uploadsDir, safeName);
    fs.writeFileSync(filePath, fileBuffer);

    const { extractedText, documentHtml } = await this.extractWithMammoth(fileBuffer);

    const session = await this.prisma['pdfSession'].create({
      data: {
        name: fileName.replace(/\.docx$/i, ''),
        fileName,
        filePath,
        extractedText,
        documentHtml,
      },
    });

    return {
      id: session.id,
      name: session.name,
      fileName: session.fileName,
      pageCount: 1,
      createdAt: session.createdAt,
    };
  }

  private async extractWithMammoth(
    fileBuffer: Buffer,
  ): Promise<{ extractedText: string; documentHtml: string }> {
    const mammoth = await import('mammoth');
    const [htmlResult, textResult] = await Promise.all([
      mammoth.convertToHtml({ buffer: fileBuffer }),
      mammoth.extractRawText({ buffer: fileBuffer }),
    ]);

    const documentHtml =
      typeof htmlResult.value === 'string' && htmlResult.value.trim().length > 0
        ? htmlResult.value
        : '<p>No content extracted.</p>';

    const extractedTextRaw =
      typeof textResult.value === 'string' && textResult.value.trim().length > 0
        ? textResult.value
        : this.htmlToPlainText(documentHtml);

    const extractedText = extractedTextRaw
      .split(/\r?\n/)
      .map((line) => this.normalizeLine(line))
      .filter((line) => line.length > 0)
      .join('\n');

    return { extractedText, documentHtml };
  }

  async listSessions() {
    return this.prisma['pdfSession'].findMany({
      where: {
        OR: [
          { fileName: { endsWith: '.docx' } },
          { fileName: { endsWith: '.DOCX' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        fileName: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getSession(id: string) {
    const session = await this.prisma['pdfSession'].findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session || !this.isDocxFileName(session.fileName)) {
      throw new NotFoundException('DOCX session not found');
    }
    return session;
  }

  async deleteSession(id: string) {
    const session = await this.getSession(id);

    if (fs.existsSync(session.filePath)) {
      try {
        fs.unlinkSync(session.filePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown delete error';
        this.logger.warn(`Failed to delete DOCX file ${session.filePath}: ${message}`);
      }
    }

    await this.prisma['pdfSession'].delete({ where: { id } });
    return { success: true };
  }

  async *chatStream(sessionId: string, userMessage: string): AsyncGenerator<ChatStreamChunk> {
    const session = await this.getSession(sessionId);

    await this.prisma['pdfChatMessage'].create({
      data: { sessionId, role: 'user', content: userMessage },
    });

    const recentMessages = session.messages.slice(-20);
    const conversationHistory = recentMessages.map((message: { role: string; content: string }) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));

    const systemPrompt = this.buildDocxSystemPrompt(session.extractedText, session.documentHtml);

    try {
      const response = await this.openai.chat({
        systemPrompt,
        userMessage,
        conversationHistory,
        temperature: 0.3,
        responseFormat: 'text',
      }, 'groq');

      const fullContent = response.content;
      const docMatch = fullContent.match(/<document>([\s\S]*?)<\/document>/);

      if (docMatch) {
        const newHtml = docMatch[1]!.trim();
        const chatResponse = fullContent.replace(/<document>[\s\S]*?<\/document>/, '').trim();

        await this.prisma['pdfSession'].update({
          where: { id: sessionId },
          data: { documentHtml: newHtml },
        });

        const chunks = this.splitIntoChunks(chatResponse || 'Document updated successfully.', 20);
        for (const chunk of chunks) {
          yield { type: 'delta', content: chunk };
        }

        yield { type: 'content_updated', documentHtml: newHtml };
      } else {
        const chunks = this.splitIntoChunks(fullContent, 20);
        for (const chunk of chunks) {
          yield { type: 'delta', content: chunk };
        }
      }

      const assistantContent = docMatch
        ? fullContent.replace(/<document>[\s\S]*?<\/document>/, '').trim() || 'Document updated.'
        : fullContent;

      await this.prisma['pdfChatMessage'].create({
        data: { sessionId, role: 'assistant', content: assistantContent },
      });

      yield { type: 'done' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI request failed';
      this.logger.error(`DOCX chat error: ${message}`);
      yield { type: 'error', content: message };
    }
  }

  async updateContent(sessionId: string, html: string) {
    const session = await this.getSession(sessionId);

    await this.prisma['pdfSession'].update({
      where: { id: session.id },
      data: { documentHtml: html },
    });

    return { success: true };
  }

  async replaceTextInDocx(sessionId: string, replacements: Array<{ find: string; replace: string }>) {
    const session = await this.getSession(sessionId);
    if (!fs.existsSync(session.filePath)) throw new NotFoundException('DOCX file not found on disk');

    const replacementSpecs = this.normalizeReplacementSpecs(replacements);
    if (replacementSpecs.length === 0) {
      return { success: true, replacementsApplied: 0 };
    }

    const nextExtractedText = this.applySpecsToText(session.extractedText || '', replacementSpecs);
    const nextDocumentHtml = this.applySpecsToText(session.documentHtml || '', replacementSpecs);

    const applyResult = await this.applyReplacementSpecsToSession(
      session.id,
      session.filePath,
      replacementSpecs,
      'modified',
      { extractedText: nextExtractedText, documentHtml: nextDocumentHtml },
    );

    return {
      success: true,
      replacementsApplied: applyResult.applied,
    };
  }

  async regenerateDocx(sessionId: string) {
    const session = await this.getSession(sessionId);
    if (!fs.existsSync(session.filePath)) throw new NotFoundException('DOCX file not found on disk');

    const sourceText = session.extractedText || '';
    const targetText = this.htmlToPlainText(session.documentHtml || '');
    const diffPlan = this.buildLineReplacementSpecs(sourceText, targetText);

    if (diffPlan.replacements.length === 0) {
      const changed = this.normalizeLine(sourceText) !== this.normalizeLine(targetText);
      return {
        success: true,
        replacementsApplied: 0,
        skippedInsertions: diffPlan.skippedInsertions,
        message: changed
          ? 'No safe replacements detected. Insert-only changes were skipped to preserve original formatting.'
          : 'No changes detected.',
      };
    }

    const nextExtractedText = this.applySpecsToText(sourceText, diffPlan.replacements);
    const nextDocumentHtml = session.documentHtml || '';

    const applyResult = await this.applyReplacementSpecsToSession(
      session.id,
      session.filePath,
      diffPlan.replacements,
      'regenerated',
      { extractedText: nextExtractedText, documentHtml: nextDocumentHtml },
    );

    return {
      success: true,
      replacementsApplied: applyResult.applied,
      skippedInsertions: diffPlan.skippedInsertions,
      message:
        applyResult.applied === 0
          ? 'No matching text fragments were found in the DOCX XML stream. No changes applied to preserve original formatting.'
          : diffPlan.skippedInsertions > 0
            ? `Applied ${applyResult.applied} style-preserving change(s). ${diffPlan.skippedInsertions} insertion block(s) were skipped to preserve original formatting.`
            : `Applied ${applyResult.applied} style-preserving change(s).`,
    };
  }

  getFilePath(session: { filePath: string }) {
    if (!fs.existsSync(session.filePath)) {
      throw new NotFoundException('DOCX file not found on disk');
    }
    return session.filePath;
  }

  private isDocxFileName(fileName: string): boolean {
    return /\.docx$/i.test(fileName);
  }

  private normalizeReplacementSpecs(specs: ReplacementSpec[]): ReplacementSpec[] {
    return specs
      .map((spec) => ({
        find: this.normalizeLine(spec.find),
        replace: spec.replace ?? '',
        maxOccurrences:
          spec.maxOccurrences !== undefined && Number.isFinite(spec.maxOccurrences)
            ? Math.max(1, Math.floor(spec.maxOccurrences))
            : undefined,
      }))
      .filter((spec) => {
        if (!spec.find) return false;
        if (spec.find === spec.replace) return false;
        if (spec.find.length < 2) return false;
        if (!/[A-Za-z0-9]/.test(spec.find) && spec.find.length < 4) return false;
        return true;
      });
  }

  private async applyReplacementSpecsToSession(
    sessionId: string,
    currentFilePath: string,
    replacements: ReplacementSpec[],
    filePrefix: 'modified' | 'regenerated',
    nextSessionState: { extractedText: string; documentHtml: string },
  ): Promise<{ applied: number; filePath: string }> {
    const docxResult = await this.applyReplacementsToDocxFile(currentFilePath, replacements, filePrefix);

    if (!docxResult.changed) {
      return { applied: 0, filePath: currentFilePath };
    }

    await this.prisma['pdfSession'].update({
      where: { id: sessionId },
      data: {
        filePath: docxResult.filePath,
        extractedText: nextSessionState.extractedText,
        documentHtml: nextSessionState.documentHtml,
      },
    });

    if (currentFilePath !== docxResult.filePath && fs.existsSync(currentFilePath)) {
      try {
        fs.unlinkSync(currentFilePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown cleanup error';
        this.logger.warn(`Failed to remove old DOCX ${currentFilePath}: ${message}`);
      }
    }

    return {
      applied: docxResult.applied,
      filePath: docxResult.filePath,
    };
  }

  private async applyReplacementsToDocxFile(
    sourceFilePath: string,
    specs: ReplacementSpec[],
    filePrefix: 'modified' | 'regenerated',
  ): Promise<{ changed: boolean; applied: number; filePath: string }> {
    const JSZip = (await import('jszip')).default;
    const fileBytes = fs.readFileSync(sourceFilePath);
    const zip = await JSZip.loadAsync(fileBytes);
    const documentXmlFile = zip.file('word/document.xml');

    if (!documentXmlFile) {
      throw new NotFoundException('DOCX document.xml not found');
    }

    const documentXml = await documentXmlFile.async('string');
    const textNodes = this.extractDocxTextNodes(documentXml);

    if (textNodes.length === 0) {
      return { changed: false, applied: 0, filePath: sourceFilePath };
    }

    const states: ReplacementRuntimeState[] = specs.map((spec) => ({
      find: spec.find,
      replace: spec.replace,
      remaining: spec.maxOccurrences ?? Number.POSITIVE_INFINITY,
      applied: 0,
    }));

    let hasAnyChange = false;

    for (const state of states) {
      let searchFrom = 0;
      while (state.remaining > 0) {
        const fullText = textNodes.map((node) => node.text).join('');
        const matchIndex = fullText.indexOf(state.find, searchFrom);
        if (matchIndex === -1) break;

        this.replaceRangeInTextNodes(
          textNodes,
          matchIndex,
          matchIndex + state.find.length,
          state.replace,
        );

        state.applied += 1;
        if (Number.isFinite(state.remaining)) {
          state.remaining -= 1;
        }
        hasAnyChange = true;
        searchFrom = matchIndex + state.replace.length;
      }
    }

    const applied = states.reduce((sum, state) => sum + state.applied, 0);
    if (!hasAnyChange || applied === 0) {
      return { changed: false, applied: 0, filePath: sourceFilePath };
    }

    let nodeIndex = 0;
    const updatedXml = documentXml.replace(
      /(<w:t\b[^>]*>)([\s\S]*?)(<\/w:t>)/g,
      (_match, openTag: string, _nodeText: string, closeTag: string) => {
        const node = textNodes[nodeIndex];
        nodeIndex += 1;
        if (!node) return `${openTag}${_nodeText}${closeTag}`;
        return `${openTag}${this.encodeXmlText(node.text)}${closeTag}`;
      },
    );

    zip.file('word/document.xml', updatedXml);
    const newBytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    const newFileName = `${filePrefix}-${Date.now()}.docx`;
    const newFilePath = path.join(this.uploadsDir, newFileName);
    fs.writeFileSync(newFilePath, newBytes);

    return {
      changed: true,
      applied,
      filePath: newFilePath,
    };
  }

  private extractDocxTextNodes(documentXml: string): TextNode[] {
    const nodes: TextNode[] = [];
    const regex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(documentXml)) !== null) {
      const rawText = match[1] ?? '';
      nodes.push({ text: this.decodeXmlEntities(rawText) });
    }
    return nodes;
  }

  private replaceRangeInTextNodes(
    nodes: TextNode[],
    start: number,
    end: number,
    replacement: string,
  ): void {
    if (end <= start) return;

    let cumulative = 0;
    let firstIndex = -1;
    let lastIndex = -1;
    let firstOffset = 0;
    let lastOffset = 0;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      const nodeStart = cumulative;
      const nodeEnd = nodeStart + node.text.length;

      if (firstIndex === -1 && start < nodeEnd && end > nodeStart) {
        firstIndex = i;
        firstOffset = Math.max(0, start - nodeStart);
      }
      if (firstIndex !== -1 && end <= nodeEnd) {
        lastIndex = i;
        lastOffset = Math.max(0, end - nodeStart);
        break;
      }

      cumulative = nodeEnd;
    }

    if (firstIndex === -1) return;
    if (lastIndex === -1) {
      lastIndex = nodes.length - 1;
      const lastNodeStart =
        nodes
          .slice(0, lastIndex)
          .reduce((sum, node) => sum + node.text.length, 0);
      lastOffset = Math.max(0, end - lastNodeStart);
    }

    if (firstIndex === lastIndex) {
      const node = nodes[firstIndex]!;
      node.text =
        node.text.slice(0, firstOffset) +
        replacement +
        node.text.slice(lastOffset);
      return;
    }

    const firstNode = nodes[firstIndex]!;
    const lastNode = nodes[lastIndex]!;

    const before = firstNode.text.slice(0, firstOffset);
    const after = lastNode.text.slice(lastOffset);
    firstNode.text = `${before}${replacement}${after}`;

    for (let i = firstIndex + 1; i <= lastIndex; i++) {
      nodes[i]!.text = '';
    }
  }

  private applySpecsToText(input: string, specs: ReplacementSpec[]): string {
    let output = input;
    for (const spec of specs) {
      if (!spec.find) continue;
      const maxOccurrences =
        spec.maxOccurrences !== undefined && Number.isFinite(spec.maxOccurrences)
          ? Math.max(1, Math.floor(spec.maxOccurrences))
          : Number.MAX_SAFE_INTEGER;
      const replaced = this.replaceTextLeftToRight(output, spec.find, spec.replace, maxOccurrences);
      output = replaced.output;
    }
    return output;
  }

  private replaceTextLeftToRight(
    input: string,
    find: string,
    replace: string,
    maxOccurrences: number,
  ): { output: string; count: number } {
    if (!find || maxOccurrences <= 0) return { output: input, count: 0 };

    let output = '';
    let cursor = 0;
    let count = 0;

    while (count < maxOccurrences) {
      const index = input.indexOf(find, cursor);
      if (index === -1) break;

      output += input.slice(cursor, index);
      output += replace;
      cursor = index + find.length;
      count += 1;
    }

    if (count === 0) return { output: input, count: 0 };
    output += input.slice(cursor);
    return { output, count };
  }

  private htmlToPlainText(html: string): string {
    const withBreaks = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|section|article)>/gi, '\n')
      .replace(/<\/(ul|ol|table)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<[^>]+>/g, ' ');

    const decoded = this.decodeHtmlEntities(withBreaks);
    return decoded
      .split(/\r?\n/)
      .map((line) => this.normalizeLine(line))
      .filter((line) => line.length > 0)
      .join('\n');
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_match: string, hex: string) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&#([0-9]+);/g, (_match: string, dec: string) => {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      });
  }

  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_match: string, hex: string) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&#([0-9]+);/g, (_match: string, dec: string) => {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      });
  }

  private encodeXmlText(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private normalizeLine(value: string): string {
    return value
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private buildLineReplacementSpecs(
    sourceText: string,
    targetText: string,
  ): { replacements: ReplacementSpec[]; skippedInsertions: number } {
    const sourceLines = sourceText
      .split(/\r?\n/)
      .map((line) => this.normalizeLine(line))
      .filter((line) => line.length > 0);
    const targetLines = targetText
      .split(/\r?\n/)
      .map((line) => this.normalizeLine(line))
      .filter((line) => line.length > 0);

    const ops = this.diffLines(sourceLines, targetLines);
    const replacements: ReplacementSpec[] = [];
    let skippedInsertions = 0;

    let pendingDeletes: string[] = [];
    let pendingInserts: string[] = [];

    const flushSegment = () => {
      if (pendingDeletes.length === 0 && pendingInserts.length === 0) return;

      const paired = Math.min(pendingDeletes.length, pendingInserts.length);
      for (let i = 0; i < paired; i++) {
        const find = pendingDeletes[i]!;
        const replace = pendingInserts[i]!;
        const candidates = this.buildLineReplacementCandidates(find, replace);
        replacements.push(...candidates);
      }

      for (let i = paired; i < pendingDeletes.length; i++) {
        replacements.push({
          find: pendingDeletes[i]!,
          replace: '',
          maxOccurrences: 1,
        });
      }

      if (pendingInserts.length > paired) {
        skippedInsertions += pendingInserts.length - paired;
      }

      pendingDeletes = [];
      pendingInserts = [];
    };

    for (const op of ops) {
      if (op.type === 'keep') {
        flushSegment();
      } else if (op.type === 'delete') {
        pendingDeletes.push(op.value);
      } else {
        pendingInserts.push(op.value);
      }
    }
    flushSegment();

    return {
      replacements: this.normalizeReplacementSpecs(replacements),
      skippedInsertions,
    };
  }

  private buildLineReplacementCandidates(sourceLine: string, targetLine: string): ReplacementSpec[] {
    const oldLine = this.normalizeLine(sourceLine);
    const newLine = this.normalizeLine(targetLine);
    if (!oldLine || oldLine === newLine) return [];

    const oldWords = oldLine.split(' ').filter((word) => word.length > 0);
    const newWords = newLine.split(' ').filter((word) => word.length > 0);
    const candidates: ReplacementSpec[] = [];

    const pushCandidate = (find: string, replace: string) => {
      const normalizedFind = this.normalizeLine(find);
      const normalizedReplace = this.normalizeLine(replace);
      if (!normalizedFind) return;
      if (normalizedFind === normalizedReplace) return;
      if (candidates.some((spec) => spec.find === normalizedFind && spec.replace === normalizedReplace)) return;
      candidates.push({ find: normalizedFind, replace: normalizedReplace, maxOccurrences: 1 });
    };

    let prefix = 0;
    while (
      prefix < oldWords.length &&
      prefix < newWords.length &&
      oldWords[prefix] === newWords[prefix]
    ) {
      prefix += 1;
    }

    let suffix = 0;
    while (
      suffix < oldWords.length - prefix &&
      suffix < newWords.length - prefix &&
      oldWords[oldWords.length - 1 - suffix] === newWords[newWords.length - 1 - suffix]
    ) {
      suffix += 1;
    }

    const oldCore = oldWords.slice(prefix, oldWords.length - suffix);
    const newCore = newWords.slice(prefix, newWords.length - suffix);

    if (oldCore.length > 0) {
      const coreFind = oldCore.join(' ');
      const coreReplace = newCore.join(' ');
      const leftContext = prefix > 0 ? oldWords[prefix - 1] : '';
      const rightContext = suffix > 0 ? oldWords[oldWords.length - suffix] : '';

      if (leftContext || rightContext) {
        const contextualFind = [leftContext, coreFind, rightContext].filter(Boolean).join(' ');
        const contextualReplace = [leftContext, coreReplace, rightContext].filter(Boolean).join(' ');
        pushCandidate(contextualFind, contextualReplace);
      }

      pushCandidate(coreFind, coreReplace);
    } else if (newCore.length > 0) {
      const leftContext = oldWords.slice(Math.max(0, prefix - 2), prefix);
      const rightContext = oldWords.slice(prefix, Math.min(oldWords.length, prefix + 2));
      if (leftContext.length + rightContext.length > 0) {
        const find = [...leftContext, ...rightContext].join(' ');
        const replace = [...leftContext, ...newCore, ...rightContext].join(' ');
        pushCandidate(find, replace);
      }
    }

    pushCandidate(oldLine, newLine);
    return candidates;
  }

  private diffLines(sourceLines: string[], targetLines: string[]): DiffOp[] {
    const n = sourceLines.length;
    const m = targetLines.length;
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        if (sourceLines[i] === targetLines[j]) {
          dp[i]![j] = dp[i + 1]![j + 1]! + 1;
        } else {
          dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
        }
      }
    }

    const ops: DiffOp[] = [];
    let i = 0;
    let j = 0;

    while (i < n && j < m) {
      if (sourceLines[i] === targetLines[j]) {
        ops.push({ type: 'keep', value: sourceLines[i]! });
        i += 1;
        j += 1;
      } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
        ops.push({ type: 'delete', value: sourceLines[i]! });
        i += 1;
      } else {
        ops.push({ type: 'insert', value: targetLines[j]! });
        j += 1;
      }
    }

    while (i < n) {
      ops.push({ type: 'delete', value: sourceLines[i]! });
      i += 1;
    }

    while (j < m) {
      ops.push({ type: 'insert', value: targetLines[j]! });
      j += 1;
    }

    return ops;
  }

  private buildDocxSystemPrompt(extractedText: string, currentHtml: string): string {
    const maxTextLen = 8000;
    const truncatedText =
      extractedText.length > maxTextLen
        ? `${extractedText.slice(0, maxTextLen)}\n\n[... text truncated for context length ...]`
        : extractedText;

    return `You are an AI assistant helping the user edit and improve a DOCX document.

The user has uploaded a DOCX. Here is the extracted text content:

<extracted_text>
${truncatedText}
</extracted_text>

Here is the current editable HTML state of the document:

<current_document>
${currentHtml.slice(0, maxTextLen)}
</current_document>

INSTRUCTIONS:
- Answer questions about the document content.
- If the user asks to modify content, return the FULL updated HTML wrapped in <document>...</document>.
- Keep the original structure and wording as much as possible; apply only the requested changes.
- Do not add external CSS or restyle the document.
- Outside <document>, provide a short explanation of what you changed.
- If no document edit is required, respond normally without <document> tags.`;
  }

  private splitIntoChunks(text: string, wordsPerChunk: number): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }
    return chunks.length > 0 ? chunks : [text];
  }
}
