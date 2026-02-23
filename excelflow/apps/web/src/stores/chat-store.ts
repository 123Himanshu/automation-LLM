import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AIToolCall, ChatMessage } from '@excelflow/shared';
import { api } from '@/lib/api-client';
import { useWorkbookStore } from './workbook-store';
import { toast } from '@/hooks/use-toast';

interface PendingConfirmation {
  messageId: string;
  toolCall: AIToolCall;
}

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  pendingConfirmation: PendingConfirmation | null;

  sendMessage: (workbookId: string, message: string, activeSheet: string, selectedRange?: string) => Promise<void>;
  confirmAction: (workbookId: string) => Promise<void>;
  rejectAction: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>()(
  immer((set) => ({
    messages: [],
    isLoading: false,
    pendingConfirmation: null,

    sendMessage: async (workbookId, message, activeSheet, selectedRange): Promise<void> => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };

      const currentMessages = useChatStore.getState().messages;
      const history = currentMessages.slice(-20).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      set((s) => {
        s.messages.push(userMsg);
        s.isLoading = true;
        s.pendingConfirmation = null;
      });

      try {
        const res = await api.sendAIPrompt(workbookId, { message, activeSheet, selectedRange, history });
        const aiMsg = res.data;

        set((s) => {
          s.messages.push(aiMsg);
          s.isLoading = false;
        });

        // Check if this message has a pending confirmation
        if (aiMsg.toolCall?.requiresConfirmation) {
          set((s) => {
            s.pendingConfirmation = { messageId: aiMsg.id, toolCall: aiMsg.toolCall! };
          });
        } else {
          // Refresh sheets so new tabs (created by AI) appear immediately
          await useWorkbookStore.getState().refreshSheets();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'AI request failed';
        const errorMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: msg,
          timestamp: new Date().toISOString(),
        };
        set((s) => {
          s.messages.push(errorMsg);
          s.isLoading = false;
        });
        toast.error(msg);
      }
    },

    confirmAction: async (workbookId): Promise<void> => {
      const pending = useChatStore.getState().pendingConfirmation;
      if (!pending) return;

      set((s) => { s.isLoading = true; });

      try {
        const res = await api.confirmAIAction(workbookId, pending.toolCall);
        const result = res.data;

        const statusMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: result.success
            ? `✅ Confirmed and applied. Revision: v${result.version}`
            : `❌ Failed to apply: ${result.error}`,
          timestamp: new Date().toISOString(),
        };

        set((s) => {
          s.messages.push(statusMsg);
          s.isLoading = false;
          s.pendingConfirmation = null;
        });

        if (result.success) {
          await useWorkbookStore.getState().refreshSheets();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Confirmation failed';
        set((s) => {
          s.messages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `❌ ${msg}`,
            timestamp: new Date().toISOString(),
          });
          s.isLoading = false;
          s.pendingConfirmation = null;
        });
        toast.error(msg);
      }
    },

    rejectAction: (): void => {
      set((s) => {
        s.pendingConfirmation = null;
        s.messages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '🚫 Operation cancelled by user.',
          timestamp: new Date().toISOString(),
        });
      });
    },

    clearMessages: (): void => {
      set((s) => {
        s.messages = [];
        s.pendingConfirmation = null;
      });
    },
  })),
);
