import { create } from 'zustand';
import { api } from '@/lib/api-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  status?: 'streaming' | 'done' | 'error';
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
  abortController: AbortController | null;
  sendMessage: (content: string) => void;
  stopGeneration: () => void;
  retryLastMessage: () => void;
  regenerateLastResponse: () => void;
  dismissError: () => void;
  uploadDocument: (file: File) => Promise<void>;
  removeDocument: () => Promise<void>;
  clearChat: () => void;
}

function buildHistory(messages: Message[]): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages
    .filter((m) => m.status !== 'error' && m.content.length > 0)
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content }));
}

function streamMessage(content: string, get: () => LLMStore, set: (partial: Partial<LLMStore>) => void): void {
  const userMsg: Message = {
    id: crypto.randomUUID(),
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
    status: 'done',
  };

  const assistantId = crypto.randomUUID();
  const assistantMsg: Message = {
    id: assistantId,
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    status: 'streaming',
  };

  const currentMessages = get().messages;
  set({
    messages: [...currentMessages, userMsg, assistantMsg],
    isLoading: true,
    error: null,
  });

  const history = buildHistory([...currentMessages, userMsg]);
  const documentId = get().document?.documentId;

  const controller = api.llmChatStream(
    content,
    history,
    documentId,
    // onToken
    (token: string) => {
      set({
        messages: get().messages.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + token } : m,
        ),
      });
    },
    // onDone
    () => {
      set({
        messages: get().messages.map((m) =>
          m.id === assistantId ? { ...m, status: 'done', timestamp: new Date().toISOString() } : m,
        ),
        isLoading: false,
        abortController: null,
      });
    },
    // onError
    (error: string) => {
      set({
        messages: get().messages.map((m) =>
          m.id === assistantId ? { ...m, status: 'error', content: '' } : m,
        ),
        isLoading: false,
        error,
        abortController: null,
      });
    },
  );

  set({ abortController: controller });
}

export const useLLMStore = create<LLMStore>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,
  document: null,
  isUploading: false,
  abortController: null,

  sendMessage: (content: string) => {
    streamMessage(content, get, (partial) => set(partial));
  },

  stopGeneration: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
      set({
        messages: get().messages.map((m) =>
          m.status === 'streaming' ? { ...m, status: 'done' } : m,
        ),
        isLoading: false,
        abortController: null,
      });
    }
  },

  retryLastMessage: () => {
    const msgs = get().messages;
    // Find the last user message
    const lastUserIdx = msgs.findLastIndex((m) => m.role === 'user');
    if (lastUserIdx === -1) return;

    const lastUser = msgs[lastUserIdx];
    if (!lastUser) return;
    const lastUserContent = lastUser.content;
    // Remove the last user message and any assistant response after it
    const trimmed = msgs.slice(0, lastUserIdx);
    set({ messages: trimmed, error: null });
    streamMessage(lastUserContent, get, (partial) => set(partial));
  },

  regenerateLastResponse: () => {
    const msgs = get().messages;
    const lastAssistantIdx = msgs.findLastIndex((m) => m.role === 'assistant');
    if (lastAssistantIdx === -1) return;

    // Find the user message that preceded this assistant response
    const userIdx = msgs.slice(0, lastAssistantIdx).findLastIndex((m) => m.role === 'user');
    if (userIdx === -1) return;

    const userMsg = msgs[userIdx];
    if (!userMsg) return;
    const userContent = userMsg.content;
    // Keep everything up to (but not including) the assistant response
    const trimmed = msgs.slice(0, lastAssistantIdx);
    set({ messages: trimmed, error: null });
    streamMessage(userContent, () => ({ ...get(), messages: trimmed }), (partial) => set(partial));
  },

  dismissError: () => set({ error: null }),

  uploadDocument: async (file: File) => {
    set({ isUploading: true, error: null });
    try {
      const res = await api.llmUploadDocument(file);
      set({ document: res.data, isUploading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      set({ isUploading: false, error: msg });
    }
  },

  removeDocument: async () => {
    const doc = get().document;
    if (doc) {
      try { await api.llmRemoveDocument(doc.documentId); } catch { /* best-effort */ }
    }
    set({ document: null });
  },

  clearChat: () => {
    const { abortController } = get();
    if (abortController) abortController.abort();
    set({ messages: [], error: null, document: null, abortController: null, isLoading: false });
  },
}));
