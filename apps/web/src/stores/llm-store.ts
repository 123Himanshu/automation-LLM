import { create } from 'zustand';
import { api } from '@/lib/api-client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface LLMStore {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearChat: () => void;
}

export const useLLMStore = create<LLMStore>((set, get) => ({
  messages: [],
  isLoading: false,
  error: null,

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

      const res = await api.llmChat(content, history);
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

  clearChat: () => set({ messages: [], error: null }),
}));
