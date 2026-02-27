import type { ActionSource } from './action-types';

/** Revision record */
export interface Revision {
  id: string;
  workbookId: string;
  version: number;
  source: ActionSource;
  description?: string;
  createdAt: string;
}

/** Revision list item (lightweight) */
export interface RevisionMeta {
  id: string;
  version: number;
  source: ActionSource;
  description?: string;
  createdAt: string;
}
