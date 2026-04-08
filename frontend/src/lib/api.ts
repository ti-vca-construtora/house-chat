import { ChatResponse, Conversation, GetSyncJobResponse, Message, StartSyncResponse, SyncJob, SyncMode, SyncScope } from '@/types';
import { supabase } from './supabase';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function getToken(forceRefresh = false): Promise<string> {
  const { data, error } = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  const token = data.session?.access_token;
  if (!token) throw new Error('Não autenticado');
  return token;
}

async function doFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let token = await getToken();
  let res = await doFetch<T>(path, token, options);

  if (res.status === 401) {
    token = await getToken(true);
    res = await doFetch<T>(path, token, options);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
    throw new Error(err.error || `Erro ${res.status}`);
  }

  return res.json();
}

export async function sendMessage(message: string, conversationId?: string): Promise<ChatResponse> {
  return apiFetch<ChatResponse>('/chat/send', {
    method: 'POST',
    body: JSON.stringify({ message, conversationId }),
  });
}

export async function getConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>('/chat/conversations');
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return apiFetch<Message[]>(`/chat/conversations/${conversationId}/messages`);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await apiFetch(`/chat/conversations/${conversationId}`, { method: 'DELETE' });
}

export async function startSyncJob(scope: SyncScope, mode: SyncMode): Promise<SyncJob> {
  const response = await apiFetch<StartSyncResponse>('/sync/jobs', {
    method: 'POST',
    body: JSON.stringify({ scope, mode }),
  });

  return response.job;
}

export async function getSyncJob(jobId: string): Promise<SyncJob> {
  const response = await apiFetch<GetSyncJobResponse>(`/sync/jobs/${jobId}`);
  return response.job;
}
