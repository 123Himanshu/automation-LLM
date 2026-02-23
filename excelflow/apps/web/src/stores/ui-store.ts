import { create } from 'zustand';

interface SelectionRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface UIState {
  isChatOpen: boolean;
  isExportModalOpen: boolean;
  isSummaryModalOpen: boolean;
  isFindOpen: boolean;
  selectedRange: string | null;
  /** Parsed multi-cell selection (null = no selection) */
  selectionRect: SelectionRange | null;
  formulaBarValue: string;
  chatPanelWidth: number;
  /** True while a cell edit is being saved to the server */
  isSaving: boolean;
  /** Status bar aggregates for selected range */
  statusBarInfo: { sum: number; avg: number; count: number; numCount: number } | null;

  toggleChat: () => void;
  openExportModal: () => void;
  closeExportModal: () => void;
  openSummaryModal: () => void;
  closeSummaryModal: () => void;
  toggleFind: () => void;
  closeFind: () => void;
  setSelectedRange: (range: string | null) => void;
  setSelectionRect: (rect: SelectionRange | null) => void;
  setFormulaBarValue: (value: string) => void;
  setChatPanelWidth: (width: number) => void;
  setIsSaving: (saving: boolean) => void;
  setStatusBarInfo: (info: { sum: number; avg: number; count: number; numCount: number } | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  isChatOpen: false,
  isExportModalOpen: false,
  isSummaryModalOpen: false,
  isFindOpen: false,
  selectedRange: null,
  selectionRect: null,
  formulaBarValue: '',
  chatPanelWidth: 380,
  isSaving: false,
  statusBarInfo: null,

  toggleChat: (): void => set((s) => ({ isChatOpen: !s.isChatOpen })),
  openExportModal: (): void => set({ isExportModalOpen: true }),
  closeExportModal: (): void => set({ isExportModalOpen: false }),
  openSummaryModal: (): void => set({ isSummaryModalOpen: true }),
  closeSummaryModal: (): void => set({ isSummaryModalOpen: false }),
  toggleFind: (): void => set((s) => ({ isFindOpen: !s.isFindOpen })),
  closeFind: (): void => set({ isFindOpen: false }),
  setSelectedRange: (range): void => set({ selectedRange: range }),
  setSelectionRect: (rect): void => set({ selectionRect: rect }),
  setFormulaBarValue: (value): void => set({ formulaBarValue: value }),
  setChatPanelWidth: (width): void => set({ chatPanelWidth: Math.max(280, Math.min(700, width)) }),
  setIsSaving: (saving): void => set({ isSaving: saving }),
  setStatusBarInfo: (info): void => set({ statusBarInfo: info }),
}));

export type { SelectionRange };
