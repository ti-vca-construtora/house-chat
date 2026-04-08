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
  | 'source:cvcrm'
  | 'source:lotear'
  | 'table:empreendimentos_cvcrm'
  | 'table:vendas_cvcrm'
  | 'table:estoque_cvcrm'
  | 'table:distratos_cvcrm'
  | 'table:tabela_de_preco_cvcrm'
  | 'table:empreendimentos_lotear'
  | 'table:vendas_lotear'
  | 'table:estoque_lotear'
  | 'table:distratos_lotear'
  | 'table:tabela_de_preco_lotear';
export type SyncTableKey =
  | 'empreendimentos_cvcrm'
  | 'vendas_cvcrm'
  | 'estoque_cvcrm'
  | 'distratos_cvcrm'
  | 'tabela_de_preco_cvcrm'
  | 'empreendimentos_lotear'
  | 'vendas_lotear'
  | 'estoque_lotear'
  | 'distratos_lotear'
  | 'tabela_de_preco_lotear';

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
