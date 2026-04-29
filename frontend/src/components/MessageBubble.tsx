'use client';

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import Image from 'next/image';
import { Check, User } from 'lucide-react';
import houseImg from '@/assets/house.png';
import siengeImg from '@/assets/sienge.png';
import cvcrmImg from '@/assets/cvcrm.png';
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
      <div
        className={`flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full shadow-sm ${
          isUser ? 'bg-[#0F0F0F] text-white' : 'bg-[#67c900]'
        }`}
      >
        {isUser ? (
          <User size={18} />
        ) : (
          <Image src={houseImg} alt="House Bot" width={44} height={44} className="h-full w-full object-cover" />
        )}
      </div>

      <div className={`flex w-full max-w-[86%] flex-col ${isUser ? 'items-end' : 'items-start'} sm:max-w-[80%]`}>
        <div
          className={`w-full rounded-2xl ${
            isUser
              ? 'rounded-tr-sm bg-[#0F0F0F]/90 px-5 py-3.5 text-white shadow-md'
              : 'rounded-tl-sm border border-gray-200/80 bg-white/90 px-5 py-4 text-gray-800 shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur-sm'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed">{message.content}</p>
          ) : (
            <div className="space-y-3 text-[15px] leading-relaxed text-gray-800">
              <div className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-3 text-[12px] font-semibold uppercase tracking-wide text-gray-500">
                House
              </div>

              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="mb-3 mt-1 text-[20px] font-bold leading-tight text-gray-950">{children}</h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="mb-2 mt-5 flex items-center gap-2 text-[17px] font-bold leading-snug text-gray-950 first:mt-0">
                      <span className="h-2 w-2 rounded-full bg-[#67c900]" />
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="mb-2 mt-4 text-[15px] font-bold text-gray-900">{children}</h3>
                  ),
                  p: ({ children }) => <p className="my-2 leading-relaxed text-gray-700">{children}</p>,
                  strong: ({ children }) => <strong className="font-bold text-gray-950">{children}</strong>,
                  ul: ({ children }) => <ul className="my-3 space-y-2">{children}</ul>,
                  ol: ({ children }) => (
                    <ol className="my-3 list-decimal space-y-2 pl-5 marker:font-bold marker:text-[#4f9b00]">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="flex gap-2 leading-relaxed text-gray-700">
                      <Check size={16} className="mt-1 shrink-0 text-[#4f9b00]" />
                      <span>{children}</span>
                    </li>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="my-4 border-l-4 border-[#67c900] bg-[#67c900]/10 px-4 py-3 text-gray-700">
                      {children}
                    </blockquote>
                  ),
                  hr: () => <div className="my-4 h-px bg-gray-100" />,
                  code: ({ children }) => (
                    <code className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[13px] font-semibold text-gray-900">
                      {children}
                    </code>
                  ),
                  pre: ({ children }) => (
                    <pre className="my-4 overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-4 text-[13px] leading-relaxed text-gray-900">
                      {children}
                    </pre>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-[#3d7d00] underline underline-offset-4"
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Fontes</span>
                <div className="flex items-center gap-1.5">
                  <div
                    className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm"
                    title="Sienge"
                  >
                    <Image src={siengeImg} alt="Sienge" width={28} height={28} className="h-full w-full object-cover" />
                  </div>
                  <div
                    className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-white shadow-sm"
                    title="CV CRM"
                  >
                    <Image src={cvcrmImg} alt="CV CRM" width={28} height={28} className="h-full w-full object-cover" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <span className="mt-1.5 px-1 text-[10px] font-medium text-gray-400">
          {new Date(message.created_at).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </motion.div>
  );
}
