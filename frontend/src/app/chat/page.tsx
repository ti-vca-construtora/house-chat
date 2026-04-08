'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useChat } from '@/hooks/useChat';
import { getSyncJob, startSyncJob } from '@/lib/api';
import type { SyncJob, SyncMode, SyncScope } from '@/types';
import Sidebar from '@/components/Sidebar';
import ChatWindow from '@/components/ChatWindow';
import SyncDatabaseModal from '@/components/SyncDatabaseModal';

export default function ChatPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const {
    conversations,
    currentConversationId,
    messages,
    sending,
    loadConversations,
    selectConversation,
    sendMessage,
    newConversation,
    removeConversation,
  } = useChat();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user, loadConversations]);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/login');
  };

  const handleOpenSyncModal = () => {
    setSyncModalOpen(true);
    setSyncJob(null);
    setSyncError(null);
  };

  const handleResetSync = () => {
    setSyncJob(null);
    setSyncError(null);
  };

  useEffect(() => {
    if (!syncJob || (syncJob.status !== 'queued' && syncJob.status !== 'running')) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const nextJob = await getSyncJob(syncJob.id);
        setSyncJob(nextJob);

        if (nextJob.status === 'failed') {
          setSyncError(nextJob.error || 'Erro ao sincronizar banco');
        }
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : 'Erro ao consultar progresso da sincronização');
      }
    }, 1500);

    return () => window.clearInterval(interval);
  }, [syncJob]);

  const handleSyncDatabase = async (scope: SyncScope, mode: SyncMode) => {
    setSyncModalOpen(true);
    setSyncJob(null);
    setSyncError(null);

    try {
      const job = await startSyncJob(scope, mode);
      setSyncJob(job);
    } catch (err: unknown) {
      setSyncError(err instanceof Error ? err.message : 'Erro ao sincronizar banco');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-12 h-12 rounded-2xl bg-[#67c900] animate-pulse" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-screen flex overflow-hidden bg-[#0F0F0F] font-sans text-gray-900">
      <div className="flex-1 flex overflow-hidden bg-white">
        <Sidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          profile={profile}
          onSelect={selectConversation}
          onNew={newConversation}
          onDelete={removeConversation}
          onSignOut={handleSignOut}
          onOpenSyncModal={handleOpenSyncModal}
          syncingDatabase={syncJob?.status === 'queued' || syncJob?.status === 'running'}
        />
        <main className="flex-1 flex flex-col min-w-0 bg-white relative overflow-hidden">
          <ChatWindow
            messages={messages}
            sending={sending}
            onSend={sendMessage}
          />
        </main>
      </div>
      
      <SyncDatabaseModal
        open={syncModalOpen}
        loading={syncJob?.status === 'queued' || syncJob?.status === 'running'}
        job={syncJob}
        error={syncError}
        onConfirm={handleSyncDatabase}
        onReset={handleResetSync}
        onClose={() => setSyncModalOpen(false)}
      />
    </div>
  );
}
