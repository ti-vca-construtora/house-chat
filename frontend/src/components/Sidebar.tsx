'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  MessageSquare,
  Trash2,
  LogOut,
  Shield,
  RefreshCw,
  MoreHorizontal,
  Download
} from 'lucide-react';
import type { Conversation, User } from '@/types';
import Image from 'next/image';
import logo from '../assets/logo.png';

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  profile: User | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onExport: (id: string) => void;
  onSignOut: () => void;
  onOpenSyncModal: () => void;
  syncingDatabase: boolean;
}

export default function Sidebar({
  conversations,
  currentConversationId,
  profile,
  onSelect,
  onNew,
  onDelete,
  onExport,
  onSignOut,
  onOpenSyncModal,
  syncingDatabase,
}: SidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  return (
    <div className="w-[280px] bg-[#0F0F0F] border-r border-[#222] flex flex-col h-full font-sans">
      {/* Header & Logo */}
      <div className="p-5 pb-4">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-transparent rounded-lg">
             <Image src={logo} alt="House" width={200} height={150} priority />
          </div>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onNew}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg bg-transparent border border-[#333] hover:bg-[#1e1e1e] text-gray-200 text-sm font-semibold shadow-sm transition-all mb-2"
        >
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-gray-400" />
            <span>Nova Conversa</span>
          </div>
          <span className="text-xs text-gray-500 bg-[#333] px-1.5 py-0.5 rounded">⌘ N</span>
        </motion.button>
      </div>

      {/* Recent Conversas */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <p className="px-5 py-2 text-xs font-bold text-gray-500 uppercase tracking-widest mt-2 mb-1">Recentes</p>
        <div className="space-y-0.5">
          {conversations.length === 0 ? (
            <div className="px-5 py-3 text-gray-500 text-sm font-medium">Nenhuma conversa</div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group relative flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  currentConversationId === conv.id
                    ? 'bg-[#2a2a2a] text-white border border-[#3a3a3a]'
                    : 'text-gray-400 hover:bg-[#1e1e1e] hover:text-gray-100'
                }`}
                onClick={() => onSelect(conv.id)}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <MessageSquare size={16} className="flex-shrink-0 opacity-70" />
                  <span className="text-sm font-medium truncate">{conv.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenMenuId((current) => current === conv.id ? null : conv.id);
                  }}
                  className={`p-1.5 rounded hover:bg-[#333] text-gray-500 hover:text-white transition-all ml-2 ${
                    openMenuId === conv.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  aria-label="Opcoes da conversa"
                  aria-expanded={openMenuId === conv.id}
                >
                  <MoreHorizontal size={16} />
                </button>
                {openMenuId === conv.id && (
                  <div
                    className="absolute right-2 top-9 z-20 w-40 rounded-lg border border-[#333] bg-[#171717] py-1 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        onExport(conv.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-[#242424]"
                    >
                      <Download size={14} />
                      Exportar .txt
                    </button>
                    <button
                      onClick={() => {
                        setOpenMenuId(null);
                        onDelete(conv.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-[#242424]"
                    >
                      <Trash2 size={14} />
                      Remover
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Admin Operations */}
      {profile?.role === 'admin' && (
        <div className="px-5 pb-3">
           <button
             onClick={onOpenSyncModal}
             disabled={syncingDatabase}
             className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#1e1e1e] text-gray-300 text-xs font-medium border border-[#333] hover:text-white transition-colors disabled:opacity-50"
           >
             <RefreshCw size={14} className={syncingDatabase ? 'animate-spin text-[#67c900]' : ''} />
             {syncingDatabase ? 'Sincronizando...' : 'Sincronizar Dados'}
           </button>
        </div>
      )}

      {/* Footer - User info */}
      <div className="px-4 py-4 border-t border-[#1a1a1a] flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center border border-gray-700 font-bold text-sm text-white">
            {profile?.role === 'admin' ? <Shield size={16} className="text-[#67c900]" /> : profile?.email?.[0]?.toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-semibold text-white truncate max-w-[120px]">{profile?.email?.split('@')[0]}</span>
            <span className="text-xs text-gray-500 font-medium">{profile?.role === 'admin' ? 'Admin' : 'Usuário'}</span>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="text-gray-500 hover:text-white transition-colors p-2 rounded-lg hover:bg-[#1a1a1a]"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}
