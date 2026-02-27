import type { Action } from './action-types';
import type { ColumnType } from './cell-types';
import type { WorkbookClassification } from './workbook-types';
import type { SheetBlueprint } from './blueprint-types';

/** Column-level statistics for AI context */
export interface ColumnStats {
  header: string;
  type: ColumnType;
  count: number;
  missing: number;
  unique: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  sum?: number;
  topValues?: Array<{ value: string; count: number }>;
}

/** Context sent to AI — never full dataset */
export interface AIContext {
  workbookId: string;
  sheets: Array<{
    id: string;
    name: string;
    usedRange: string;
    headers: string[];
    columnTypes: ColumnType[];
    stats: ColumnStats[];
    sampleRows: unknown[][];
    rowCount: number;
    /** Precise structural blueprint for formula generation */
    blueprint?: SheetBlueprint;
  }>;
  activeSheet: string;
  selectedRange?: string;
  classification: WorkbookClassification;
  /** All sheet names in the workbook (for conflict avoidance) */
  existingSheetNames?: string[];
}

/** AI tool call response format */
export interface AIToolCall {
  tool: 'apply_actions';
  plan: string[];
  actions: Action[];
  estimatedImpact: {
    cellsAffected: number;
    sheetsAffected: string[];
    createsNewSheet: boolean;
    overwritesData: boolean;
  };
  requiresConfirmation: boolean;
}

/** AI chat message */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCall?: AIToolCall;
  timestamp: string;
}
