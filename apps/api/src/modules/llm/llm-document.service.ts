import { Injectable, Logger } from '@nestjs/common';

/** A chunk of document text with metadata for RAG retrieval */
export interface DocumentChunk {
  index: number;
  text: string;
  /** Lowercased tokens for keyword matching */
  tokens: Set<string>;
}

export interface StoredDocument {
  id: string;
  fileName: string;
  totalChunks: number;
  totalChars: number;
  uploadedAt: string;
  chunks: DocumentChunk[];
}

/** Max characters per chunk — keeps context windows manageable */
const CHUNK_SIZE = 1500;
/** Overlap between chunks to preserve context at boundaries */
const CHUNK_OVERLAP = 200;
/** Max chunks to inject into a single prompt */
const MAX_CONTEXT_CHUNKS = 8;
/** Auto-cleanup documents older than 2 hours */
const TTL_MS = 2 * 60 * 60 * 1000;

/**
 * In-memory document store with chunking and keyword-based retrieval.
 *
 * Best-practice RAG approach:
 * 1. Extract text from PDF
 * 2. Split into overlapping chunks
 * 3. On query, rank chunks by keyword relevance (TF-based)
 * 4. Inject only top-K relevant chunks into the LLM prompt
 *
 * This avoids sending the entire document to the LLM, saving tokens
 * and improving answer quality by focusing on relevant sections.
 */
@Injectable()
export class LLMDocumentService {
  private readonly logger = new Logger(LLMDocumentService.name);
  private readonly documents = new Map<string, StoredDocument>();

  constructor() {
    // Periodic cleanup of expired documents
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /** Store a document by chunking its text */
  storeDocument(id: string, fileName: string, rawText: string): StoredDocument {
    const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const chunks = this.chunkText(cleanText);

    const doc: StoredDocument = {
      id,
      fileName,
      totalChunks: chunks.length,
      totalChars: cleanText.length,
      uploadedAt: new Date().toISOString(),
      chunks,
    };

    this.documents.set(id, doc);
    this.logger.log(
      `Stored document "${fileName}" (${chunks.length} chunks, ${cleanText.length} chars)`,
    );
    return doc;
  }

  /** Retrieve top-K relevant chunks for a query using keyword scoring */
  getRelevantChunks(documentId: string, query: string): string[] {
    const doc = this.documents.get(documentId);
    if (!doc) return [];

    const queryTokens = this.tokenize(query);
    if (queryTokens.size === 0) {
      // No meaningful query tokens — return first chunks as overview
      return doc.chunks.slice(0, MAX_CONTEXT_CHUNKS).map((c) => c.text);
    }

    // Score each chunk by how many query tokens it contains (TF-based)
    const scored = doc.chunks.map((chunk) => {
      let score = 0;
      for (const token of queryTokens) {
        if (chunk.tokens.has(token)) score += 1;
      }
      return { chunk, score };
    });

    // Sort by score descending, take top K
    scored.sort((a, b) => b.score - a.score);
    const topChunks = scored
      .slice(0, MAX_CONTEXT_CHUNKS)
      .filter((s) => s.score > 0);

    // If no chunks matched, return first few as fallback
    if (topChunks.length === 0) {
      return doc.chunks.slice(0, 3).map((c) => c.text);
    }

    // Return in original document order for coherence
    return topChunks
      .sort((a, b) => a.chunk.index - b.chunk.index)
      .map((s) => s.chunk.text);
  }

  getDocument(id: string): StoredDocument | undefined {
    return this.documents.get(id);
  }

  removeDocument(id: string): boolean {
    return this.documents.delete(id);
  }

  /** Split text into overlapping chunks */
  private chunkText(text: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < text.length) {
      let end = Math.min(start + CHUNK_SIZE, text.length);

      // Try to break at a paragraph or sentence boundary
      if (end < text.length) {
        const slice = text.slice(start, end);
        const lastParagraph = slice.lastIndexOf('\n\n');
        const lastSentence = Math.max(
          slice.lastIndexOf('. '),
          slice.lastIndexOf('.\n'),
        );
        const breakPoint = lastParagraph > CHUNK_SIZE * 0.5
          ? lastParagraph
          : lastSentence > CHUNK_SIZE * 0.3
            ? lastSentence + 1
            : -1;
        if (breakPoint > 0) end = start + breakPoint;
      }

      const chunkText = text.slice(start, end).trim();
      if (chunkText.length > 0) {
        chunks.push({
          index,
          text: chunkText,
          tokens: this.tokenize(chunkText),
        });
        index++;
      }

      start = end - CHUNK_OVERLAP;
      if (start >= text.length) break;
      // Avoid infinite loop on very small remaining text
      if (end >= text.length) break;
    }

    return chunks;
  }

  /** Tokenize text into lowercase words, filtering stopwords */
  private tokenize(text: string): Set<string> {
    const words = text.toLowerCase().match(/\b[a-z0-9]{2,}\b/g) ?? [];
    return new Set(words.filter((w) => !STOPWORDS.has(w)));
  }

  /** Remove expired documents */
  private cleanup(): void {
    const now = Date.now();
    for (const [id, doc] of this.documents) {
      if (now - new Date(doc.uploadedAt).getTime() > TTL_MS) {
        this.documents.delete(id);
        this.logger.log(`Cleaned up expired document: ${doc.fileName}`);
      }
    }
  }
}

const STOPWORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'in', 'that', 'have', 'it', 'for',
  'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but',
  'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or', 'an',
  'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so',
  'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
  'make', 'can', 'like', 'no', 'just', 'him', 'know', 'take', 'come',
  'could', 'than', 'been', 'its', 'over', 'such', 'how', 'some', 'them',
  'into', 'has', 'two', 'more', 'very', 'after', 'our', 'also', 'did',
  'many', 'then', 'these', 'any', 'new', 'may', 'each', 'much', 'way',
  'was', 'are', 'is', 'were', 'had', 'am',
]);
