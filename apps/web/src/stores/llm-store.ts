import { create } from 'zustand';
import { api } from '@/lib/api-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface UploadedDocument {
  documentId: string;
  fileName: string;
  totalChunks: number;
  totalChars: number;
  pageCount: number;
}

interface LLMStore {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  document: UploadedDocument | null;
  isUploading: boolean;
  sendMessage: (content: string) => Promise<void>;
  uploadDocument: (file: File) => Promise<void>;
  removeDocument: () => Promise<void>;
  clearChat: () => void;
}

export const useLLMStore = create<LLMStore>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  document: null,
  isUploading: false,

  sendMessage: async (content: string) => {
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    set((s) => ({ messages: [...s.messages, userMsg], isLoading: true, error: null }));

    try {
      const history = get().messages.slice(-20).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const documentId = get().document?.documentId;
      const res = await api.llmChat(content, history, documentId);
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: res.data.content,
        timestamp: res.data.timestamp,
      };

      set((s) => ({ messages: [...s.messages, assistantMsg], isLoading: false }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      set({ isLoading: false, error: msg });
    }
  },

  uploadDocument: async (file: File) => {
    set({ isUploading: true, error: null });
    try {
      const res = await api.llmUploadDocument(file);
      set({
        document: res.data,
        isUploading: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      set({ isUploading: false, error: msg });
    }
  },

  removeDocument: async () => {
    const doc = get().document;
    if (doc) {
      try {
        await api.llmRemoveDocument(doc.documentId);
      } catch {
        // Best-effort cleanup
      }
    }
    set({ document: null });
  },

  clearChat: () => set({ messages: [], error: null, document: null }),
}));
