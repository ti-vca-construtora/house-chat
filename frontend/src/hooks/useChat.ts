'use client';

import { useState, useCallback, useRef } from 'react';
import * as api from '@/lib/api';
import type { Conversation, Message } from '@/types';

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const currentConversationIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);

  const setActiveConversationId = useCallback((conversationId: string | null) => {
    currentConversationIdRef.current = conversationId;
    setCurrentConversationId(conversationId);
  }, []);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getConversations();
      setConversations(data);
    } catch (err) {
      console.error('Erro ao carregar conversas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const selectConversation = useCallback(async (conversationId: string) => {
    setActiveConversationId(conversationId);
    setLoading(true);
    try {
      const data = await api.getMessages(conversationId);
      setMessages(data);
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      setLoading(false);
    }
  }, [setActiveConversationId]);

  const sendMessage = useCallback(async (content: string) => {
    const trimmedContent = content.trim();
    if (!trimmedContent || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    const activeConversationId = currentConversationIdRef.current;

    // Adicionar mensagem do usuário otimisticamente
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: trimmedContent,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const result = await api.sendMessage(trimmedContent, activeConversationId || undefined);

      // Se é uma nova conversa, atualizar ID
      if (!activeConversationId) {
        setActiveConversationId(result.conversationId);
      }

      // Adicionar resposta da IA
      const aiMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: result.response,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiMsg]);

      // Só recarregar lista de conversas quando IA respondeu com sucesso
      await loadConversations();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao enviar mensagem';
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ ${errorMessage}`,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
      // Não recarrega lista — conversa com erro não aparece em Recentes
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [loadConversations, setActiveConversationId]);

  const newConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
  }, [setActiveConversationId]);

  const removeConversation = useCallback(async (conversationId: string) => {
    try {
      await api.deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (currentConversationIdRef.current === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Erro ao deletar conversa:', err);
    }
  }, [setActiveConversationId]);

  const exportConversation = useCallback(async (conversationId: string) => {
    const conversation = conversations.find((c) => c.id === conversationId);
    const conversationMessages = await api.getMessages(conversationId);
    const title = conversation?.title?.trim() || 'Conversa';
    const exportedAt = new Date().toLocaleString('pt-BR');
    const lines = [
      title,
      `Exportada em ${exportedAt}`,
      '',
      ...conversationMessages.map((message) => {
        const role = message.role === 'assistant' ? 'House Bot' : message.role === 'user' ? 'Usuario' : 'Sistema';
        const date = new Date(message.created_at).toLocaleString('pt-BR');
        return `[${date}] ${role}:\n${message.content}`;
      }),
      '',
    ];
    const content = lines.join('\n\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const filename = `${title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'conversa'}.txt`;

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, [conversations]);

  return {
    conversations,
    currentConversationId,
    messages,
    loading,
    sending,
    loadConversations,
    selectConversation,
    sendMessage,
    newConversation,
    removeConversation,
    exportConversation,
  };
}
