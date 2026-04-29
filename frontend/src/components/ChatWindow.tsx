'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, CheckCircle2 } from 'lucide-react';
import Image from 'next/image';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import TypingIndicator from './TypingIndicator';
import type { Message } from '@/types';
import bgImage from '../assets/background.png';
import houseImg from '../assets/house.png';

interface ChatWindowProps {
  messages: Message[];
  sending: boolean;
  onSend: (message: string) => void;
}

export default function ChatWindow({ messages, sending, onSend }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  return (
    <div
      className="flex flex-col h-full relative"
      style={{ backgroundImage: `url(${bgImage.src})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      {/* overlay sutil para manter legibilidade */}
      <div className="absolute inset-0 bg-white/60 pointer-events-none" />
      <div className="flex-1 overflow-y-auto w-full relative z-10">
        <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center h-[50vh] text-center"
            >
              <div className="mb-6 flex space-x-3 items-center">
                 <div className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
                    <FileText size={24} strokeWidth={1.5} />
                 </div>
                 <div className="w-14 h-14 rounded-2xl bg-[#67c900] flex items-center justify-center shadow-xl shadow-black/10 overflow-hidden">
                    <Image src={houseImg} alt="House Bot" width={56} height={56} className="w-full h-full object-cover" />
                 </div>
                 <div className="w-12 h-12 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-400 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
                    <CheckCircle2 size={24} strokeWidth={1.5} />
                 </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight">
                Faça uma pergunta ou solicitação
              </h2>
              <p className="text-gray-500 font-medium mb-10 max-w-md">
                Conecte seus documentos e gerencie dados imobiliários com comandos inteligentes.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 w-full max-w-2xl">
                {[
                  'Qual o empreendimento com mais vendas?',
                  'Quais empreendimentos temos na base Lotear?',
                  'Situação da obra do Uni Ville?',
                  'Quantas unidades atualmente disponíveis no Dona Lys?'
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => onSend(suggestion)}
                    className="text-left text-[14px] font-medium px-5 py-4 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>

          {sending && (
            <div className="flex justify-start">
               <TypingIndicator />
            </div>
          )}
          <div ref={bottomRef} className="h-32" /> {/* Pushed higher up so input floats clearly above */}
        </div>
      </div>

      {/* Floating Input Area */}
      <div className="absolute bottom-6 left-0 right-0 max-w-4xl mx-auto px-6 z-20 w-full">
         <div className="bg-white/75 backdrop-blur-md rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] border border-white/60 overflow-hidden">
           <ChatInput onSend={onSend} sending={sending} />
         </div>
      </div>
    </div>
  );
}
