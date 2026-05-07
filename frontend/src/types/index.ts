export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  daily_message_count: number;
  last_message_date: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface ChatResponse {
  conversationId: string;
  response: string;
  permissionDenied?: boolean;
}

export type SyncMode = 'total' | 'partial';
export type SyncScope =
  | 'all'
  | 'table:vw_Vendas_Consolidada';
export type SyncTableKey =
  | 'vw_Vendas_Consolidada';

export interface SyncTableProgress {
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalPages: number;
  completedPages: number;
  progressPercent: number;
  estimatedRemainingMs: number | null;
  updatedRecords: number;
  currentPage: number | null;
  totalRegistrosCvcrm: number | null;
  pageRange: { start: number; end: number } | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface SyncJobResultTable {
  table: SyncTableKey;
  updatedRecords: number;
  totalPages: number;
  completedPages: number;
  paginaInicial?: number;
  paginaFinal?: number;
  paginasProcessadas?: number;
  totalPaginas?: number;
  totalRegistrosCvcrm?: number;
}

export interface SyncJob {
  id: string;
  mode: SyncMode;
  scope: SyncScope;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  result: {
    mode: SyncMode;
    scope: SyncScope;
    tables: Partial<Record<SyncTableKey, SyncJobResultTable>>;
    totalUpdatedRecords: number;
  } | null;
  tables: Partial<Record<SyncTableKey, SyncTableProgress>>;
}

export interface StartSyncResponse {
  success: boolean;
  jobId: string;
  job: SyncJob;
}

export interface GetSyncJobResponse {
  success: boolean;
  job: SyncJob;
}

export interface ApiError {
  error: string;
}
