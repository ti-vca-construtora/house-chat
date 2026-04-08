'use client';

import { useState, useCallback } from 'react';
import * as api from '@/lib/api';
import type { Conversation, Message } from '@/types';

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

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
    setCurrentConversationId(conversationId);
    setLoading(true);
    try {
      const data = await api.getMessages(conversationId);
      setMessages(data);
    } catch (err) {
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim()) return;

    setSending(true);

    // Adicionar mensagem do usuário otimisticamente
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: content.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const result = await api.sendMessage(content.trim(), currentConversationId || undefined);

      // Se é uma nova conversa, atualizar ID
      if (!currentConversationId) {
        setCurrentConversationId(result.conversationId);
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
      setSending(false);
    }
  }, [currentConversationId, loadConversations]);

  const newConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
  }, []);

  const removeConversation = useCallback(async (conversationId: string) => {
    try {
      await api.deleteConversation(conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Erro ao deletar conversa:', err);
    }
  }, [currentConversationId]);

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
  };
}
