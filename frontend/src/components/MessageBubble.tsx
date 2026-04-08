'use client';

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { User } from 'lucide-react';
import houseImg from '@/assets/house.png';
import type { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center shadow-sm overflow-hidden ${
          isUser
            ? 'bg-[#0F0F0F] text-white'
            : 'bg-[#67c900]'
        }`}
      >
        {isUser ? <User size={18} /> : (
          <Image src={houseImg} alt="Jardas Bot" width={44} height={44} className="w-full h-full object-cover" />
        )}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[80%] w-full`}>
        <div
          className={`rounded-2xl px-5 py-3.5 w-full ${
            isUser
              ? 'bg-[#0F0F0F]/90 text-white rounded-tr-sm shadow-md'
              : 'bg-white/80 backdrop-blur-sm text-gray-800 rounded-tl-sm border border-gray-200/70 shadow-sm'
          }`}
        >
          {isUser ? (
            <p className="text-[15px] font-medium leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="text-[15px] leading-relaxed prose prose-sm max-w-none text-gray-800 prose-p:leading-relaxed prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200 mb-0">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        <span className="text-[10px] text-gray-400 font-medium mt-1.5 px-1">
          {new Date(message.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </motion.div>
  );
}
