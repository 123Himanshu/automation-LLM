import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OpenAIClientService } from '../ai/openai-client.service';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

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

interface PdfTextElement {
  text: string;
  x: number;
  y: number;
  w: number;
  fontSize: number;
  isBold: boolean;
  isItalic: boolean;
  page: number;
}

interface PdfPageDimension {
  width: number;
  height: number;
}

interface ParsedPdfData {
  elements: PdfTextElement[];
  numpages: number;
  pageDimensions: PdfPageDimension[];
}

interface OverlayTextLine {
  page: number;
  y: number;
  xMin: number;
  xMax: number;
  fontSize: number;
  text: string;
}

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);
  private readonly uploadsDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openai: OpenAIClientService,
  ) {
    this.uploadsDir = path.resolve(process.cwd(), 'uploads', 'pdf');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  async uploadAndExtract(fileBuffer: Buffer, fileName: string) {
    const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(this.uploadsDir, safeName);
    fs.writeFileSync(filePath, fileBuffer);

    const { extractedText, documentHtml, numpages } = await this.extractWithPdf2Json(filePath);

    const session = await this.prisma['pdfSession'].create({
      data: {
        name: fileName.replace(/\.pdf$/i, ''),
        fileName,
        filePath,
        extractedText,
        documentHtml,
      },
    });

    this.logger.log(`PDF session created: ${session.id} (${numpages} pages)`);

    return {
      id: session.id,
      name: session.name,
      fileName: session.fileName,
      pageCount: numpages,
      createdAt: session.createdAt,
    };
  }

  private async extractWithPdf2Json(
    filePath: string,
  ): Promise<{ extractedText: string; documentHtml: string; numpages: number }> {
    const parsed = await this.parsePdfWithPdf2Json(filePath);
    const documentHtml = this.elementsToHtml(parsed.elements);
    const extractedText = this.htmlToPlainText(documentHtml);
    return { extractedText, documentHtml, numpages: parsed.numpages };
  }

  private async parsePdfWithPdf2Json(filePath: string): Promise<ParsedPdfData> {
    const PDFParser = (await import('pdf2json')).default;

    return new Promise((resolve, reject) => {
      const pdfParser = new PDFParser(null, true);
      const parseTimeoutMs = 20_000;
      let settled = false;

      const settleResolve = (value: ParsedPdfData) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };

      const timer = setTimeout(() => {
        settleReject(new Error(`PDF parse timed out after ${parseTimeoutMs}ms`));
      }, parseTimeoutMs);

      pdfParser.on('pdfParser_dataError', (errData: unknown) => {
        this.logger.error('pdf2json error', errData as object);
        settleReject(new Error('Failed to parse PDF'));
      });

      pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
        try {
          const pages = Array.isArray(pdfData?.Pages) ? pdfData.Pages : [];
          const elements: PdfTextElement[] = [];
          const pageDimensions: PdfPageDimension[] = [];

          for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
            const page = pages[pageIdx];
            pageDimensions.push({
              width: Number(page?.Width || 0),
              height: Number(page?.Height || 0),
            });

            const texts = Array.isArray(page?.Texts) ? page.Texts : [];
            for (const textItem of texts) {
              const runs = Array.isArray(textItem?.R) ? textItem.R : [];
              for (const run of runs) {
                const encoded = String(run?.T || '');
                let decoded = encoded;
                try {
                  decoded = decodeURIComponent(encoded);
                } catch {
                  // Keep raw token if decode fails.
                }
                if (!decoded.trim()) continue;

                const fontSize = run?.TS ? Number(run.TS[1]) : 12;
                const fontStyle = run?.TS ? Number(run.TS[2]) : 0;
                const isBold = fontStyle === 1 || fontStyle === 3;
                const isItalic = fontStyle === 2 || fontStyle === 3;

                elements.push({
                  text: decoded,
                  x: Number(textItem?.x || 0),
                  y: Number(textItem?.y || 0),
                  w: Number(textItem?.w || 0),
                  fontSize,
                  isBold,
                  isItalic,
                  page: pageIdx,
                });
              }
            }
          }

          settleResolve({
            elements,
            numpages: pages.length,
            pageDimensions,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown parse error';
          settleReject(new Error(message));
        }
      });

      try {
        pdfParser.parseBuffer(Buffer.from(fs.readFileSync(filePath)));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown parse error';
        settleReject(new Error(message));
      }
    });
  }

  private elementsToHtml(
    elements: Array<{
      text: string;
      x: number;
      y: number;
      fontSize: number;
      isBold: boolean;
      isItalic: boolean;
      page: number;
    }>,
  ): string {
    if (elements.length === 0) return '<p>No content extracted.</p>';

    interface Line {
      y: number;
      page: number;
      parts: Array<{ text: string; x: number; fontSize: number; isBold: boolean; isItalic: boolean }>;
    }

    const lines: Line[] = [];
    const yThreshold = 0.3;

    for (const el of elements) {
      const line = lines.find((entry) => entry.page === el.page && Math.abs(entry.y - el.y) < yThreshold);
      if (line) {
        line.parts.push({
          text: el.text,
          x: el.x,
          fontSize: el.fontSize,
          isBold: el.isBold,
          isItalic: el.isItalic,
        });
      } else {
        lines.push({
          y: el.y,
          page: el.page,
          parts: [
            {
              text: el.text,
              x: el.x,
              fontSize: el.fontSize,
              isBold: el.isBold,
              isItalic: el.isItalic,
            },
          ],
        });
      }
    }

    lines.sort((a, b) => a.page - b.page || a.y - b.y);
    for (const line of lines) {
      line.parts.sort((a, b) => a.x - b.x);
    }

    const fontSizes = elements.map((el) => el.fontSize);
    const bodySize = this.mode(fontSizes);

    const yGaps: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i]!.page === lines[i - 1]!.page) {
        yGaps.push(lines[i]!.y - lines[i - 1]!.y);
      }
    }
    yGaps.sort((a, b) => a - b);
    const medianGap = yGaps.length > 0 ? yGaps[Math.floor(yGaps.length / 2)]! : 1;
    const largeGapThreshold = medianGap * 1.3;

    const htmlParts: string[] = [];
    let inList = false;

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx]!;
      const fullText = line.parts.map((part) => part.text).join(' ').trim();
      if (!fullText) continue;

      if (idx > 0 && lines[idx - 1]!.page === line.page) {
        const gap = line.y - lines[idx - 1]!.y;
        if (gap > medianGap * 2.5) {
          if (inList) {
            htmlParts.push('</ul>');
            inList = false;
          }
          htmlParts.push('<div style="height:16px;"></div>');
        } else if (gap > largeGapThreshold) {
          if (inList) {
            htmlParts.push('</ul>');
            inList = false;
          }
          htmlParts.push('<div style="height:10px;"></div>');
        }
      }

      const maxFontSize = Math.max(...line.parts.map((part) => part.fontSize));
      const allBold = line.parts.every((part) => part.isBold);
      const isBullet = /^[\u2022\u25CF\u25CB\u25AA\u25B8\u2219\u00B7]/.test(fullText);
      const styledText = this.buildStyledText(line.parts);

      if (maxFontSize >= bodySize * 1.5) {
        if (inList) {
          htmlParts.push('</ul>');
          inList = false;
        }
        htmlParts.push(`<h1>${styledText}</h1>`);
      } else if (maxFontSize > bodySize * 1.1 && allBold) {
        if (inList) {
          htmlParts.push('</ul>');
          inList = false;
        }
        htmlParts.push(`<h2>${styledText}</h2>`);
      } else if (allBold && fullText.length < 80) {
        if (inList) {
          htmlParts.push('</ul>');
          inList = false;
        }
        htmlParts.push(`<h3>${styledText}</h3>`);
      } else if (isBullet) {
        if (!inList) {
          htmlParts.push('<ul>');
          inList = true;
        }
        const bulletText = styledText.replace(/^[\u2022\u25CF\u25CB\u25AA\u25B8\u2219\u00B7]\s*/, '');
        htmlParts.push(`<li>${bulletText}</li>`);
      } else {
        if (inList) {
          htmlParts.push('</ul>');
          inList = false;
        }
        htmlParts.push(`<p>${styledText}</p>`);
      }
    }

    if (inList) htmlParts.push('</ul>');
    return htmlParts.join('\n');
  }

  private buildStyledText(
    parts: Array<{ text: string; fontSize: number; isBold: boolean; isItalic: boolean }>,
  ): string {
    return parts
      .map((part) => {
        let text = this.escapeHtml(part.text);
        if (part.isBold && part.isItalic) text = `<strong><em>${text}</em></strong>`;
        else if (part.isBold) text = `<strong>${text}</strong>`;
        else if (part.isItalic) text = `<em>${text}</em>`;
        return text;
      })
      .join(' ');
  }

  private mode(values: number[]): number {
    const freq = new Map<number, number>();
    for (const value of values) {
      freq.set(value, (freq.get(value) || 0) + 1);
    }

    let maxCount = 0;
    let modeValue = values[0] || 12;
    for (const [value, count] of freq) {
      if (count > maxCount) {
        maxCount = count;
        modeValue = value;
      }
    }
    return modeValue;
  }

  async listSessions() {
    return this.prisma['pdfSession'].findMany({
      where: {
        OR: [
          { fileName: { endsWith: '.pdf' } },
          { fileName: { endsWith: '.PDF' } },
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

    if (!session || !/\.pdf$/i.test(session.fileName)) throw new NotFoundException('PDF session not found');
    return session;
  }

  async deleteSession(id: string) {
    const session = await this.prisma['pdfSession'].findUnique({ where: { id } });
    if (!session) throw new NotFoundException('PDF session not found');

    if (fs.existsSync(session.filePath)) {
      try {
        fs.unlinkSync(session.filePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown delete error';
        this.logger.warn(`Failed to delete PDF file ${session.filePath}: ${message}`);
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

    const systemPrompt = this.buildPdfSystemPrompt(session.extractedText, session.documentHtml);

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
      this.logger.error(`Chat error: ${message}`);
      yield { type: 'error', content: message };
    }
  }

  async updateContent(sessionId: string, html: string) {
    const session = await this.prisma['pdfSession'].findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('PDF session not found');

    await this.prisma['pdfSession'].update({
      where: { id: sessionId },
      data: { documentHtml: html },
    });

    return { success: true };
  }

  async replaceTextInPdf(sessionId: string, replacements: Array<{ find: string; replace: string }>) {
    const session = await this.prisma['pdfSession'].findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('PDF session not found');
    if (!fs.existsSync(session.filePath)) throw new NotFoundException('PDF file not found on disk');

    const replacementSpecs = this.normalizeReplacementSpecs(replacements);
    if (replacementSpecs.length === 0) {
      return { success: true, replacementsApplied: 0 };
    }

    const nextExtractedText = this.applySpecsToText(session.extractedText || '', replacementSpecs);
    const nextDocumentHtml = this.applySpecsToText(session.documentHtml || '', replacementSpecs);

    const applyResult = await this.applyReplacementSpecsToSession(
      sessionId,
      session.filePath,
      replacementSpecs,
      'modified',
      { extractedText: nextExtractedText, documentHtml: nextDocumentHtml },
    );

    return {
      success: true,
      replacementsApplied: applyResult.applied,
      mode: applyResult.mode,
      message:
        applyResult.applied === 0
          ? 'No matching text fragments were found. No changes applied.'
          : applyResult.mode === 'overlay'
            ? `Applied ${applyResult.applied} change(s) using overlay fallback for complex font encoding.`
            : `Applied ${applyResult.applied} style-preserving change(s).`,
    };
  }

  async regeneratePdf(sessionId: string) {
    const session = await this.prisma['pdfSession'].findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('PDF session not found');
    if (!fs.existsSync(session.filePath)) throw new NotFoundException('PDF file not found on disk');

    const sourceText = session.extractedText || '';
    const targetText = this.htmlToPlainText(session.documentHtml || '');
    const diffPlan = this.buildLineReplacementSpecs(sourceText, targetText);
    const appendCandidates = this.extractAppendCandidates(sourceText, targetText, diffPlan.insertedLines);
    const changed = this.normalizeLine(sourceText) !== this.normalizeLine(targetText);

    if (diffPlan.replacements.length === 0) {
      if (appendCandidates.length > 0) {
        const appendResult = await this.appendInsertedLinesToPdfSession(
          sessionId,
          session.filePath,
          appendCandidates,
          'regenerated',
          { extractedText: targetText, documentHtml: session.documentHtml || '' },
        );

        if (appendResult.applied > 0) {
          const truncatedMessage = appendResult.truncated
            ? ' Some additional inserted lines were omitted due to size limits.'
            : '';
          return {
            success: true,
            replacementsApplied: appendResult.applied,
            mode: 'append',
            skippedInsertions: appendResult.truncated ? diffPlan.skippedInsertions : 0,
            message: `Applied ${appendResult.applied} inserted line(s) by appending content to the end of the PDF.${truncatedMessage}`,
          };
        }
      }

      return {
        success: true,
        replacementsApplied: 0,
        skippedInsertions: diffPlan.skippedInsertions,
        message: changed
          ? 'Changes were detected, but this PDF structure could not be mapped for replacement.'
          : 'No changes detected.',
      };
    }

    const nextExtractedText = this.applySpecsToText(sourceText, diffPlan.replacements);
    const nextDocumentHtml = session.documentHtml || '';

    const applyResult = await this.applyReplacementSpecsToSession(
      sessionId,
      session.filePath,
      diffPlan.replacements,
      'regenerated',
      { extractedText: nextExtractedText, documentHtml: nextDocumentHtml },
    );

    if (appendCandidates.length > 0) {
      const appendResult = await this.appendInsertedLinesToPdfSession(
        sessionId,
        applyResult.filePath,
        appendCandidates,
        'regenerated',
        { extractedText: targetText, documentHtml: nextDocumentHtml },
      );

      if (appendResult.applied > 0) {
        const truncatedMessage = appendResult.truncated
          ? ' Some additional inserted lines were omitted due to size limits.'
          : '';

        if (applyResult.applied > 0) {
          const baseMessage =
            applyResult.mode === 'overlay'
              ? `Applied ${applyResult.applied} change(s) using overlay fallback for complex font encoding.`
              : `Applied ${applyResult.applied} style-preserving change(s).`;
          return {
            success: true,
            replacementsApplied: applyResult.applied + appendResult.applied,
            mode: 'append',
            skippedInsertions: appendResult.truncated ? diffPlan.skippedInsertions : 0,
            message:
              `${baseMessage} Added ${appendResult.applied} inserted line(s) at the end of the PDF.` +
              truncatedMessage,
          };
        }

        return {
          success: true,
          replacementsApplied: appendResult.applied,
          mode: 'append',
          skippedInsertions: appendResult.truncated ? diffPlan.skippedInsertions : 0,
          message: `Applied ${appendResult.applied} inserted line(s) by appending content to the end of the PDF.${truncatedMessage}`,
        };
      }
    }

    return {
      success: true,
      replacementsApplied: applyResult.applied,
      mode: applyResult.mode,
      skippedInsertions: diffPlan.skippedInsertions,
      message:
        applyResult.applied === 0
          ? 'No matching text fragments were found in this PDF. No changes applied.'
          : applyResult.mode === 'overlay'
            ? diffPlan.skippedInsertions > 0
              ? `Applied ${applyResult.applied} change(s) using overlay fallback for complex font encoding. ${diffPlan.skippedInsertions} insertion block(s) were skipped.`
              : `Applied ${applyResult.applied} change(s) using overlay fallback for complex font encoding.`
          : diffPlan.skippedInsertions > 0
            ? `Applied ${applyResult.applied} style-preserving change(s). ${diffPlan.skippedInsertions} insertion block(s) were skipped to preserve original formatting.`
            : `Applied ${applyResult.applied} style-preserving change(s).`,
    };
  }

  getFilePath(session: { filePath: string }) {
    if (!fs.existsSync(session.filePath)) {
      throw new NotFoundException('PDF file not found on disk');
    }
    return session.filePath;
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
  ): Promise<{ applied: number; filePath: string; mode: 'none' | 'native' | 'overlay' }> {
    let pdfResult = await this.applyReplacementsToPdfFile(currentFilePath, replacements, filePrefix);
    let mode: 'none' | 'native' | 'overlay' = pdfResult.changed ? 'native' : 'none';

    if (!pdfResult.changed && replacements.length > 0) {
      if (this.shouldUseOverlayFallback(pdfResult.literalTokens, pdfResult.hexTokens)) {
        const fallbackResult = await this.applyOverlayReplacementsToPdfFile(
          currentFilePath,
          replacements,
          filePrefix,
        );
        if (fallbackResult.changed) {
          pdfResult = {
            ...fallbackResult,
            literalTokens: pdfResult.literalTokens,
            hexTokens: pdfResult.hexTokens,
          };
          mode = 'overlay';
        }
      } else {
        this.logger.debug(
          `Overlay fallback skipped (literalTokens=${pdfResult.literalTokens}, hexTokens=${pdfResult.hexTokens})`,
        );
      }
    }

    if (!pdfResult.changed) {
      return { applied: 0, filePath: currentFilePath, mode: 'none' };
    }

    await this.prisma['pdfSession'].update({
      where: { id: sessionId },
      data: {
        filePath: pdfResult.filePath,
        extractedText: nextSessionState.extractedText,
        documentHtml: nextSessionState.documentHtml,
      },
    });

    if (currentFilePath !== pdfResult.filePath && fs.existsSync(currentFilePath)) {
      try {
        fs.unlinkSync(currentFilePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown cleanup error';
        this.logger.warn(`Failed to remove old PDF ${currentFilePath}: ${message}`);
      }
    }

    return {
      applied: pdfResult.applied,
      filePath: pdfResult.filePath,
      mode,
    };
  }

  private async applyReplacementsToPdfFile(
    sourceFilePath: string,
    specs: ReplacementSpec[],
    filePrefix: 'modified' | 'regenerated',
  ): Promise<{ changed: boolean; applied: number; filePath: string; literalTokens: number; hexTokens: number }> {
    const { PDFDocument, PDFName, PDFArray } = await import('pdf-lib');
    const existingPdfBytes = fs.readFileSync(sourceFilePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();

    const states: ReplacementRuntimeState[] = specs.map((spec) => ({
      find: spec.find,
      replace: spec.replace,
      remaining: spec.maxOccurrences ?? Number.POSITIVE_INFINITY,
      applied: 0,
    }));

    let hasAnyStreamChange = false;
    const literalRegex = /\((?:\\.|[^\\()])*\)/g;
    const hexRegex = /<(?:[0-9A-Fa-f\s]{2,})>/g;
    let literalTokens = 0;
    let hexTokens = 0;

    for (const page of pages) {
      const contentsRef = (page as any).node.get(PDFName.of('Contents'));
      if (!contentsRef) continue;

      const refs: unknown[] = [];
      if (contentsRef instanceof PDFArray) {
        for (let i = 0; i < contentsRef.size(); i++) {
          refs.push(contentsRef.get(i));
        }
      } else {
        refs.push(contentsRef);
      }

      for (const ref of refs) {
        const stream = (pdfDoc as any).context.lookup(ref);
        if (!stream) continue;

        const rawBytes = stream.getContents?.() ?? stream.contents;
        if (!rawBytes) continue;

        const bytes = rawBytes instanceof Uint8Array ? rawBytes : new Uint8Array(rawBytes);
        if (bytes.length === 0) continue;

        let decodedBytes: Uint8Array;
        try {
          const filters = this.getStreamFilterNames(stream, PDFName, PDFArray);
          decodedBytes = this.decodePdfStreamBytes(bytes, filters);
        } catch {
          // Skip streams we cannot decode safely.
          continue;
        }

        const streamContent = new TextDecoder('latin1').decode(decodedBytes);
        literalTokens += streamContent.match(literalRegex)?.length ?? 0;
        hexTokens += streamContent.match(hexRegex)?.length ?? 0;
        let streamModified = false;

        const updatedStreamContent = streamContent.replace(literalRegex, (token) => {
          const literal = token.slice(1, -1);
          const decoded = this.decodePdfString(literal);
          let updated = decoded;

          for (const state of states) {
            if (state.remaining <= 0) continue;
            const maxForThisToken = Number.isFinite(state.remaining) ? state.remaining : Number.MAX_SAFE_INTEGER;
            const replaced = this.replaceTextLeftToRight(updated, state.find, state.replace, maxForThisToken);
            if (replaced.count > 0) {
              updated = replaced.output;
              state.applied += replaced.count;
              if (Number.isFinite(state.remaining)) {
                state.remaining -= replaced.count;
              }
            }
          }

          if (updated !== decoded) {
            streamModified = true;
            return `(${this.encodePdfString(updated)})`;
          }
          return token;
        });

        if (streamModified) {
          hasAnyStreamChange = true;
          const newStream = (pdfDoc as any).context.flateStream(
            this.toLatin1Bytes(updatedStreamContent),
          );
          (pdfDoc as any).context.assign(ref, newStream);
        }
      }
    }

    const applied = states.reduce((sum, state) => sum + state.applied, 0);
    if (!hasAnyStreamChange || applied === 0) {
      return { changed: false, applied: 0, filePath: sourceFilePath, literalTokens, hexTokens };
    }

    const modifiedBytes = await pdfDoc.save();
    const newFileName = `${filePrefix}-${Date.now()}.pdf`;
    const newFilePath = path.join(this.uploadsDir, newFileName);
    fs.writeFileSync(newFilePath, modifiedBytes);

    return {
      changed: true,
      applied,
      filePath: newFilePath,
      literalTokens,
      hexTokens,
    };
  }

  private async applyOverlayReplacementsToPdfFile(
    sourceFilePath: string,
    specs: ReplacementSpec[],
    filePrefix: 'modified' | 'regenerated',
  ): Promise<{ changed: boolean; applied: number; filePath: string }> {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const existingPdfBytes = fs.readFileSync(sourceFilePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    if (pages.length === 0) {
      return { changed: false, applied: 0, filePath: sourceFilePath };
    }

    let parsed: ParsedPdfData;
    try {
      parsed = await this.parsePdfWithPdf2Json(sourceFilePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown parse error';
      this.logger.warn(`Overlay fallback parse failed: ${message}`);
      return { changed: false, applied: 0, filePath: sourceFilePath };
    }

    if (parsed.elements.length === 0) {
      return { changed: false, applied: 0, filePath: sourceFilePath };
    }

    const overlayLines = this.groupElementsIntoOverlayLines(parsed.elements);
    if (overlayLines.length === 0) {
      return { changed: false, applied: 0, filePath: sourceFilePath };
    }

    const drawFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const states: ReplacementRuntimeState[] = specs.map((spec) => ({
      find: spec.find,
      replace: spec.replace,
      remaining: spec.maxOccurrences ?? Number.POSITIVE_INFINITY,
      applied: 0,
    }));

    let hasChanges = false;

    for (const line of overlayLines) {
      if (line.page < 0 || line.page >= pages.length) continue;

      const originalText = this.normalizeLine(line.text);
      if (!originalText) continue;

      let updatedText = originalText;
      let lineApplied = 0;

      for (const state of states) {
        if (state.remaining <= 0) continue;
        const maxForLine = Number.isFinite(state.remaining) ? state.remaining : Number.MAX_SAFE_INTEGER;
        const replaced = this.replaceTextLeftToRight(updatedText, state.find, state.replace, maxForLine);
        if (replaced.count > 0) {
          updatedText = this.normalizeLine(replaced.output);
          lineApplied += replaced.count;
          state.applied += replaced.count;
          if (Number.isFinite(state.remaining)) {
            state.remaining -= replaced.count;
          }
        }
      }

      if (lineApplied === 0 || updatedText === originalText) continue;

      const page = pages[line.page]!;
      const pageMeta = parsed.pageDimensions[line.page];
      const xScale =
        pageMeta && pageMeta.width > 0 ? page.getWidth() / pageMeta.width : 16;
      const yScale =
        pageMeta && pageMeta.height > 0 ? page.getHeight() / pageMeta.height : 16;

      const x = line.xMin * xScale;
      const fontSize = Math.max(7, Math.min(24, line.fontSize || 11));
      const baselineY = page.getHeight() - line.y * yScale;

      const oldWidth = Math.max(18, (line.xMax - line.xMin) * xScale);
      const newWidth = drawFont.widthOfTextAtSize(updatedText, fontSize);
      const boxWidth = Math.max(oldWidth, newWidth) + 4;
      const boxHeight = fontSize * 1.35;

      page.drawRectangle({
        x: Math.max(0, x - 1),
        y: Math.max(0, baselineY - 1),
        width: Math.min(page.getWidth(), boxWidth),
        height: Math.min(page.getHeight(), boxHeight),
        color: rgb(1, 1, 1),
      });

      page.drawText(updatedText, {
        x: Math.max(0, x),
        y: Math.max(0, baselineY + fontSize * 0.08),
        size: fontSize,
        font: drawFont,
        color: rgb(0, 0, 0),
      });

      hasChanges = true;
    }

    const applied = states.reduce((sum, state) => sum + state.applied, 0);
    if (!hasChanges || applied === 0) {
      return { changed: false, applied: 0, filePath: sourceFilePath };
    }

    const modifiedBytes = await pdfDoc.save();
    const newFileName = `${filePrefix}-overlay-${Date.now()}.pdf`;
    const newFilePath = path.join(this.uploadsDir, newFileName);
    fs.writeFileSync(newFilePath, modifiedBytes);

    this.logger.log(`Applied overlay fallback replacements: ${applied}`);

    return {
      changed: true,
      applied,
      filePath: newFilePath,
    };
  }

  private async appendInsertedLinesToPdfSession(
    sessionId: string,
    currentFilePath: string,
    insertedLines: string[],
    filePrefix: 'modified' | 'regenerated',
    nextSessionState: { extractedText: string; documentHtml: string },
  ): Promise<{ applied: number; filePath: string; truncated: boolean }> {
    const appendResult = await this.appendInsertedLinesToPdfFile(currentFilePath, insertedLines, filePrefix);
    if (!appendResult.changed) {
      return { applied: 0, filePath: currentFilePath, truncated: appendResult.truncated };
    }

    await this.prisma['pdfSession'].update({
      where: { id: sessionId },
      data: {
        filePath: appendResult.filePath,
        extractedText: nextSessionState.extractedText,
        documentHtml: nextSessionState.documentHtml,
      },
    });

    if (currentFilePath !== appendResult.filePath && fs.existsSync(currentFilePath)) {
      try {
        fs.unlinkSync(currentFilePath);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown cleanup error';
        this.logger.warn(`Failed to remove old PDF ${currentFilePath}: ${message}`);
      }
    }

    return {
      applied: appendResult.applied,
      filePath: appendResult.filePath,
      truncated: appendResult.truncated,
    };
  }

  private async appendInsertedLinesToPdfFile(
    sourceFilePath: string,
    insertedLines: string[],
    filePrefix: 'modified' | 'regenerated',
  ): Promise<{ changed: boolean; applied: number; filePath: string; truncated: boolean }> {
    const meaningfulLines = insertedLines
      .map((line) => this.normalizeLine(line))
      .filter((line) => line.length > 0);

    if (meaningfulLines.length === 0) {
      return { changed: false, applied: 0, filePath: sourceFilePath, truncated: false };
    }

    const maxLines = 120;
    const limitedLines = meaningfulLines.slice(0, maxLines);
    const truncated = meaningfulLines.length > maxLines;

    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const existingPdfBytes = fs.readFileSync(sourceFilePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });
    const existingPages = pdfDoc.getPages();

    const baseWidth = existingPages.length > 0 ? existingPages[existingPages.length - 1]!.getWidth() : 612;
    const baseHeight = existingPages.length > 0 ? existingPages[existingPages.length - 1]!.getHeight() : 792;

    const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const headingFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const bodyFontSize = 11;
    const bodyLineHeight = 15;
    const marginX = 48;
    const topY = baseHeight - 56;
    const bottomY = 48;
    const maxWidth = baseWidth - marginX * 2;

    let page = pdfDoc.addPage([baseWidth, baseHeight]);
    let y = topY;

    for (const line of limitedLines) {
      const headingLike = this.looksLikeHeadingLine(line);
      const font = headingLike ? headingFont : bodyFont;
      const fontSize = headingLike ? 15 : bodyFontSize;
      const lineHeight = headingLike ? 20 : bodyLineHeight;

      const wrapped = this.wrapTextToWidth(line, font, fontSize, maxWidth);
      for (const row of wrapped) {
        if (y < bottomY + lineHeight) {
          page = pdfDoc.addPage([baseWidth, baseHeight]);
          y = topY;
        }

        page.drawText(row, {
          x: marginX,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;
      }

      y -= headingLike ? 8 : 3;
    }

    const modifiedBytes = await pdfDoc.save();
    const newFileName = `${filePrefix}-append-${Date.now()}.pdf`;
    const newFilePath = path.join(this.uploadsDir, newFileName);
    fs.writeFileSync(newFilePath, modifiedBytes);

    return {
      changed: true,
      applied: limitedLines.length,
      filePath: newFilePath,
      truncated,
    };
  }

  private wrapTextToWidth(
    text: string,
    font: { widthOfTextAtSize: (value: string, size: number) => number },
    fontSize: number,
    maxWidth: number,
  ): string[] {
    const line = this.normalizeLine(text);
    if (!line) return [];

    const words = line.split(' ');
    const rows: string[] = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        if (current) rows.push(current);
        current = word;
      }
    }
    if (current) rows.push(current);

    return rows.length > 0 ? rows : [line];
  }

  private looksLikeHeadingLine(line: string): boolean {
    const normalized = this.normalizeLine(line);
    if (!normalized) return false;
    if (normalized.length > 70) return false;
    if (/[.!?]/.test(normalized)) return false;
    return /^[A-Z][A-Za-z0-9 &()\-/:]{2,}$/.test(normalized);
  }

  private groupElementsIntoOverlayLines(elements: PdfTextElement[]): OverlayTextLine[] {
    if (elements.length === 0) return [];

    const yThreshold = 0.3;
    const buckets: Array<{
      page: number;
      y: number;
      parts: Array<{ text: string; x: number; w: number; fontSize: number }>;
    }> = [];

    for (const element of elements) {
      const existing = buckets.find(
        (entry) => entry.page === element.page && Math.abs(entry.y - element.y) < yThreshold,
      );
      if (existing) {
        existing.parts.push({
          text: element.text,
          x: element.x,
          w: element.w,
          fontSize: element.fontSize,
        });
      } else {
        buckets.push({
          page: element.page,
          y: element.y,
          parts: [
            {
              text: element.text,
              x: element.x,
              w: element.w,
              fontSize: element.fontSize,
            },
          ],
        });
      }
    }

    buckets.sort((a, b) => a.page - b.page || a.y - b.y);
    for (const line of buckets) {
      line.parts.sort((a, b) => a.x - b.x);
    }

    return buckets
      .map((line) => {
        const normalizedText = this.normalizeLine(line.parts.map((part) => part.text).join(' '));
        if (!normalizedText) return null;

        const xMin = Math.min(...line.parts.map((part) => part.x));
        const xMax = Math.max(
          ...line.parts.map((part) => part.x + Math.max(part.w, part.text.length * 0.25)),
        );
        const fontSize = Math.max(...line.parts.map((part) => part.fontSize || 11));

        return {
          page: line.page,
          y: line.y,
          xMin,
          xMax,
          fontSize,
          text: normalizedText,
        } satisfies OverlayTextLine;
      })
      .filter((line): line is OverlayTextLine => line !== null);
  }

  private getStreamFilterNames(stream: any, PDFNameClass: any, PDFArrayClass: any): string[] {
    if (!stream?.dict?.get) return [];

    const filterObj = stream.dict.get(PDFNameClass.of('Filter'));
    if (!filterObj) return [];

    if (filterObj instanceof PDFNameClass) {
      const value =
        typeof (filterObj as any).decodeText === 'function'
          ? (filterObj as any).decodeText()
          : String(filterObj);
      return [this.normalizeFilterName(value)];
    }

    if (filterObj instanceof PDFArrayClass) {
      const names: string[] = [];
      for (let i = 0; i < (filterObj as any).size(); i++) {
        const item = (filterObj as any).get(i);
        const itemCtor = item?.constructor?.name;
        if (itemCtor === 'PDFName') {
          const itemName =
            typeof item.decodeText === 'function' ? item.decodeText() : String(item);
          names.push(this.normalizeFilterName(itemName));
        } else if (item && typeof item.toString === 'function') {
          names.push(this.normalizeFilterName(item.toString()));
        }
      }
      return names;
    }

    return this.normalizePdfFilterObject(filterObj);
  }

  private normalizePdfFilterObject(filterObj: unknown): string[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asAny = filterObj as any;
    const ctorName = asAny?.constructor?.name;

    if (ctorName === 'PDFName') {
      const text = typeof asAny.decodeText === 'function' ? asAny.decodeText() : String(asAny);
      return [this.normalizeFilterName(text)];
    }

    if (ctorName === 'PDFArray' && typeof asAny.size === 'function' && typeof asAny.get === 'function') {
      const names: string[] = [];
      for (let i = 0; i < asAny.size(); i++) {
        const item = asAny.get(i);
        const itemName = this.normalizePdfFilterObject(item);
        if (itemName.length > 0) names.push(itemName[0]!);
      }
      return names;
    }

    if (typeof asAny?.toString === 'function') {
      const raw = String(asAny.toString());
      // Handles e.g. "/FlateDecode" or "[ /ASCII85Decode /FlateDecode ]"
      const matches = raw.match(/\/[A-Za-z0-9]+/g);
      if (matches && matches.length > 0) {
        return matches.map((entry) => this.normalizeFilterName(entry));
      }
      return [this.normalizeFilterName(raw)];
    }

    return [];
  }

  private normalizeFilterName(name: string): string {
    return name.trim().replace(/^\//, '');
  }

  private decodePdfStreamBytes(bytes: Uint8Array, filters: string[]): Uint8Array {
    if (filters.length === 0) return bytes;

    let data = Buffer.from(bytes);
    for (const filter of filters) {
      switch (filter) {
        case 'ASCII85Decode':
        case 'A85': {
          data = Buffer.from(this.decodeAscii85(data));
          break;
        }
        case 'FlateDecode':
        case 'Fl': {
          data = zlib.inflateSync(data);
          break;
        }
        default: {
          throw new Error(`Unsupported PDF stream filter: ${filter}`);
        }
      }
    }

    return new Uint8Array(data);
  }

  private decodeAscii85(inputBytes: Uint8Array): Uint8Array {
    let input = new TextDecoder('latin1').decode(inputBytes);
    input = input.replace(/\s+/g, '');
    input = input.replace(/^<~/, '').replace(/~>$/, '');

    const output: number[] = [];
    let chunk: number[] = [];

    const pushChunk = (values: number[], effectiveLength: number) => {
      let acc = 0;
      for (const value of values) {
        acc = acc * 85 + value;
      }
      const bytes = [
        (acc >>> 24) & 0xff,
        (acc >>> 16) & 0xff,
        (acc >>> 8) & 0xff,
        acc & 0xff,
      ];
      output.push(...bytes.slice(0, effectiveLength));
    };

    for (let i = 0; i < input.length; i++) {
      const char = input[i]!;

      if (char === 'z' && chunk.length === 0) {
        output.push(0, 0, 0, 0);
        continue;
      }

      const code = char.charCodeAt(0);
      if (code < 33 || code > 117) continue;

      chunk.push(code - 33);
      if (chunk.length === 5) {
        pushChunk(chunk, 4);
        chunk = [];
      }
    }

    if (chunk.length > 0) {
      const originalLength = chunk.length;
      while (chunk.length < 5) chunk.push(84);
      pushChunk(chunk, originalLength - 1);
    }

    return Uint8Array.from(output);
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

  private decodePdfString(raw: string): string {
    let result = '';

    for (let i = 0; i < raw.length; i++) {
      const char = raw[i]!;
      if (char !== '\\') {
        result += char;
        continue;
      }

      i += 1;
      if (i >= raw.length) {
        result += '\\';
        break;
      }

      const escaped = raw[i]!;
      if (escaped >= '0' && escaped <= '7') {
        let octal = escaped;
        const nextOne = raw[i + 1];
        if (nextOne && nextOne >= '0' && nextOne <= '7') {
          octal += nextOne;
          i += 1;
        }
        const nextTwo = raw[i + 1];
        if (nextTwo && nextTwo >= '0' && nextTwo <= '7') {
          octal += nextTwo;
          i += 1;
        }
        result += String.fromCharCode(parseInt(octal, 8));
        continue;
      }

      switch (escaped) {
        case 'n':
          result += '\n';
          break;
        case 'r':
          result += '\r';
          break;
        case 't':
          result += '\t';
          break;
        case 'b':
          result += '\b';
          break;
        case 'f':
          result += '\f';
          break;
        case '(':
          result += '(';
          break;
        case ')':
          result += ')';
          break;
        case '\\':
          result += '\\';
          break;
        case '\n':
          break;
        case '\r':
          if (raw[i + 1] === '\n') i += 1;
          break;
        default:
          result += escaped;
      }
    }

    return result;
  }

  private encodePdfString(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\f/g, '\\f')
      .replace(/\u0008/g, '\\b');
  }

  private toLatin1Bytes(text: string): Uint8Array {
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
      bytes[i] = text.charCodeAt(i) & 0xff;
    }
    return bytes;
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
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      })
      .replace(/&#([0-9]+);/g, (_, dec: string) => {
        const code = Number.parseInt(dec, 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      });
  }

  private normalizeLine(value: string): string {
    return value
      .replace(/\u00a0/g, ' ')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  private shouldUseOverlayFallback(literalTokens: number, hexTokens: number): boolean {
    if (hexTokens <= 0) return false;
    if (literalTokens === 0) return true;
    // Only treat as complex when hex tokens strongly dominate.
    return hexTokens >= 20 && hexTokens > literalTokens * 2;
  }

  private buildLineReplacementSpecs(
    sourceText: string,
    targetText: string,
  ): { replacements: ReplacementSpec[]; skippedInsertions: number; insertedLines: string[] } {
    const sourceLines = this.toNormalizedLines(sourceText);
    const targetLines = this.toNormalizedLines(targetText);

    const ops = this.diffLines(sourceLines, targetLines);
    const replacements: ReplacementSpec[] = [];
    let skippedInsertions = 0;
    const insertedLines: string[] = [];

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
        const remainingInserts = pendingInserts.slice(paired);
        const normalizedInsertLines = remainingInserts
          .map((line) => this.normalizeLine(line))
          .filter((line) => line.length > 0);
        const insertBlock = this.normalizeLine(remainingInserts.join(' '));
        let anchored = false;

        if (insertBlock) {
          if (pendingDeletes.length > 0) {
            const anchorDelete = this.normalizeLine(pendingDeletes[pendingDeletes.length - 1] || '');
            if (anchorDelete) {
              replacements.push({
                find: anchorDelete,
                replace: `${anchorDelete} ${insertBlock}`,
                maxOccurrences: 1,
              });
              anchored = true;
            }
          }
        }

        if (!anchored) {
          insertedLines.push(...normalizedInsertLines);
          skippedInsertions += remainingInserts.length;
        }
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
      insertedLines: insertedLines.filter((line, idx) => idx === 0 || line !== insertedLines[idx - 1]),
    };
  }

  private extractAppendCandidates(
    sourceText: string,
    targetText: string,
    fallbackInsertedLines: string[],
  ): string[] {
    const sourceLines = this.toNormalizedLines(sourceText);
    const targetLines = this.toNormalizedLines(targetText);

    const sourceCounts = this.countLineFrequency(sourceLines);
    const targetCounts = this.countLineFrequency(targetLines);

    const byTailAnchor = this.extractTailByAnchor(sourceLines, targetLines);
    const bySubsequence = byTailAnchor.length > 0 ? [] : this.extractTailBySubsequence(sourceLines, targetLines);
    const raw =
      byTailAnchor.length > 0
        ? byTailAnchor
        : bySubsequence.length > 0
          ? bySubsequence
          : fallbackInsertedLines.map((line) => this.normalizeLine(line)).filter((line) => line.length > 0);

    const result: string[] = [];
    const seen = new Set<string>();
    for (const line of raw) {
      const normalized = this.normalizeLine(line);
      if (!normalized || seen.has(normalized)) continue;

      const srcCount = sourceCounts.get(normalized) || 0;
      const tgtCount = targetCounts.get(normalized) || 0;
      if (tgtCount <= srcCount) continue;

      seen.add(normalized);
      result.push(normalized);
    }

    return result;
  }

  private extractTailByAnchor(sourceLines: string[], targetLines: string[]): string[] {
    if (sourceLines.length === 0 || targetLines.length === 0) return [];
    const maxWindow = Math.min(8, sourceLines.length, targetLines.length);

    for (let window = maxWindow; window >= 2; window--) {
      const tail = sourceLines.slice(sourceLines.length - window);
      const start = this.findLastSubsequenceIndex(targetLines, tail);
      if (start === -1) continue;
      return targetLines.slice(start + window);
    }

    return [];
  }

  private extractTailBySubsequence(sourceLines: string[], targetLines: string[]): string[] {
    if (sourceLines.length === 0 || targetLines.length === 0) return [];

    let src = 0;
    let lastMatchTarget = -1;
    for (let tgt = 0; tgt < targetLines.length && src < sourceLines.length; tgt++) {
      if (targetLines[tgt] === sourceLines[src]) {
        lastMatchTarget = tgt;
        src += 1;
      }
    }

    const minMatches = Math.max(1, Math.floor(sourceLines.length * 0.7));
    if (src < minMatches) return [];

    return targetLines.slice(lastMatchTarget + 1);
  }

  private findLastSubsequenceIndex(haystack: string[], needle: string[]): number {
    if (needle.length === 0 || haystack.length < needle.length) return -1;

    for (let i = haystack.length - needle.length; i >= 0; i--) {
      let matched = true;
      for (let j = 0; j < needle.length; j++) {
        if (haystack[i + j] !== needle[j]) {
          matched = false;
          break;
        }
      }
      if (matched) return i;
    }

    return -1;
  }

  private countLineFrequency(lines: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    for (const line of lines) {
      freq.set(line, (freq.get(line) || 0) + 1);
    }
    return freq;
  }

  private toNormalizedLines(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((line) => this.normalizeLine(line))
      .filter((line) => line.length > 0);
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
      // Insertion-only changes are represented as contextual replacements.
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

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private buildPdfSystemPrompt(extractedText: string, currentHtml: string): string {
    const maxTextLen = 8000;
    const truncatedText =
      extractedText.length > maxTextLen
        ? `${extractedText.slice(0, maxTextLen)}\n\n[... text truncated for context length ...]`
        : extractedText;

    return `You are an AI assistant helping the user edit and improve a PDF document.

The user has uploaded a PDF document. Here is the extracted text content:

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
