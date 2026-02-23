import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { api } from '@/lib/api-client';

export interface PdfSessionMeta {
  id: string;
  name: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PdfChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface PdfSession extends PdfSessionMeta {
  extractedText: string;
  documentHtml: string;
  messages: PdfChatMessage[];
}

interface PdfState {
  sessions: PdfSessionMeta[];
  activeSessionId: string | null;
  activeSession: PdfSession | null;
  isUploading: boolean;
  isChatLoading: boolean;
  isRegenerating: boolean;
  isSavingContent: boolean;
  editMode: boolean;
  pdfVersion: number;
  lastRegenerateMessage: string | null;

  loadSessions: () => Promise<void>;
  createSession: (file: File) => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  saveContent: (html: string) => Promise<void>;
  regeneratePdf: () => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  toggleEditMode: () => void;
  clearActiveSession: () => void;
}

export const usePdfStore = create<PdfState>()(
  immer((set, get) => ({
    sessions: [],
    activeSessionId: null,
    activeSession: null,
    isUploading: false,
    isChatLoading: false,
    isRegenerating: false,
    isSavingContent: false,
    editMode: false,
    pdfVersion: 0,
    lastRegenerateMessage: null,

    loadSessions: async () => {
      try {
        const res: any = await api.listPdfSessions();
        const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        set((state) => {
          state.sessions = list;
        });
      } catch (err) {
        console.error('[pdf-store] loadSessions error:', err);
      }
    },

    createSession: async (file) => {
      set((state) => {
        state.isUploading = true;
      });
      try {
        const res: any = await api.uploadPdf(file);
        const newSession = res?.data ?? res;
        await get().loadSessions();
        if (newSession?.id) {
          await get().selectSession(newSession.id);
        }
      } catch (err) {
        console.error('[pdf-store] createSession error:', err);
      } finally {
        set((state) => {
          state.isUploading = false;
        });
      }
    },

    selectSession: async (id) => {
      try {
        const res: any = await api.getPdfSession(id);
        const session = res?.data ?? res;
        set((state) => {
          const isSwitchingSession = state.activeSessionId !== id;
          state.activeSessionId = id;
          state.activeSession = session as PdfSession;
          state.editMode = false;
          if (isSwitchingSession) {
            state.lastRegenerateMessage = null;
          }
        });
      } catch (err) {
        console.error('[pdf-store] selectSession error:', err);
      }
    },

    sendMessage: async (text) => {
      const { activeSessionId } = get();
      if (!activeSessionId) return;

      const userMsg: PdfChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };

      set((state) => {
        if (state.activeSession) {
          state.activeSession.messages.push(userMsg);
        }
        state.isChatLoading = true;
      });

      const assistantId = crypto.randomUUID();
      set((state) => {
        if (state.activeSession) {
          state.activeSession.messages.push({
            id: assistantId,
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
          });
        }
      });

      try {
        const response = await fetch(`/api/pdf/sessions/${activeSessionId}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${btoa('admin:changeme')}`,
          },
          body: JSON.stringify({ message: text }),
        });

        if (!response.ok) throw new Error('Chat request failed');

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response stream');

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6);

            try {
              const chunk = JSON.parse(jsonStr) as {
                type?: string;
                content?: string;
                documentHtml?: string;
              };

              if (chunk.type === 'delta' && chunk.content) {
                set((state) => {
                  if (!state.activeSession) return;
                  const msg = state.activeSession.messages.find((entry) => entry.id === assistantId);
                  if (msg) msg.content += (msg.content ? ' ' : '') + chunk.content;
                });
              } else if (
                chunk.type === 'content_updated' &&
                typeof chunk.documentHtml === 'string'
              ) {
                const updatedHtml = chunk.documentHtml;
                set((state) => {
                  if (state.activeSession) {
                    state.activeSession.documentHtml = updatedHtml;
                  }
                });
                setTimeout(() => {
                  void get().regeneratePdf();
                }, 100);
              } else if (chunk.type === 'error') {
                set((state) => {
                  if (!state.activeSession) return;
                  const msg = state.activeSession.messages.find((entry) => entry.id === assistantId);
                  if (msg) msg.content = `Error: ${chunk.content ?? 'Unknown error'}`;
                });
              }
            } catch {
              // Skip malformed chunk.
            }
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Chat failed';
        set((state) => {
          if (!state.activeSession) return;
          const msg = state.activeSession.messages.find((entry) => entry.id === assistantId);
          if (msg) msg.content = `Error: ${errorMessage}`;
        });
      } finally {
        set((state) => {
          state.isChatLoading = false;
        });
      }
    },

    saveContent: async (html) => {
      const { activeSessionId } = get();
      if (!activeSessionId) return;

      set((state) => {
        state.isSavingContent = true;
      });
      try {
        await api.updatePdfContent(activeSessionId, html);
        set((state) => {
          if (state.activeSession) {
            state.activeSession.documentHtml = html;
          }
        });
      } catch (err) {
        console.error('Save failed:', err);
      } finally {
        set((state) => {
          state.isSavingContent = false;
        });
      }
    },

    regeneratePdf: async () => {
      const { activeSessionId, isRegenerating } = get();
      if (!activeSessionId || isRegenerating) return;

      set((state) => {
        state.isRegenerating = true;
      });

      try {
        const regenerateRes: any = await api.regeneratePdf(activeSessionId);
        const regeneratePayload = regenerateRes?.data ?? regenerateRes;
        const replacementsApplied =
          typeof regeneratePayload?.replacementsApplied === 'number'
            ? regeneratePayload.replacementsApplied
            : 0;
        const skippedInsertions =
          typeof regeneratePayload?.skippedInsertions === 'number'
            ? regeneratePayload.skippedInsertions
            : 0;

        let message =
          typeof regeneratePayload?.message === 'string' ? regeneratePayload.message : null;
        if (!message) {
          message =
            replacementsApplied > 0
              ? `Applied ${replacementsApplied} style-preserving change(s).`
              : 'No matching text was found in the PDF stream, so no visual changes were applied.';
        }
        if (skippedInsertions > 0 && !message.includes('skipped')) {
          message = `${message} ${skippedInsertions} insertion block(s) were skipped to preserve formatting.`;
        }

        set((state) => {
          if (state.activeSessionId !== activeSessionId) return;
          state.pdfVersion += 1;
          state.lastRegenerateMessage = message;
        });
      } catch (err) {
        console.error('Regenerate failed:', err);
        set((state) => {
          state.lastRegenerateMessage = 'Failed to regenerate PDF.';
        });
      } finally {
        set((state) => {
          state.isRegenerating = false;
        });
      }
    },

    deleteSession: async (id) => {
      try {
        await api.deletePdfSession(id);
        set((state) => {
          state.sessions = state.sessions.filter((session) => session.id !== id);
          if (state.activeSessionId === id) {
            state.activeSessionId = null;
            state.activeSession = null;
            state.lastRegenerateMessage = null;
          }
        });
      } catch (err) {
        console.error('Delete failed:', err);
      }
    },

    toggleEditMode: () => {
      set((state) => {
        state.editMode = !state.editMode;
      });
    },

    clearActiveSession: () => {
      set((state) => {
        state.activeSessionId = null;
        state.activeSession = null;
        state.editMode = false;
        state.lastRegenerateMessage = null;
      });
    },
  })),
);
