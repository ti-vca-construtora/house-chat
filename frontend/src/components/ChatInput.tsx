'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowUp, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  sending: boolean;
  disabled?: boolean;
}

export default function ChatInput({ onSend, sending, disabled }: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (!input.trim() || sending || disabled) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem..."
          rows={1}
          disabled={sending || disabled}
          className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 px-1 py-2 resize-none focus:outline-none text-[15px] max-h-[150px] font-medium"
        />
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleSubmit}
          disabled={!input.trim() || sending || disabled}
          className="mb-0.5 p-2 rounded-lg bg-[#0F0F0F] text-white hover:bg-[#67c900] disabled:opacity-25 disabled:cursor-not-allowed transition-all flex-shrink-0"
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ArrowUp size={16} strokeWidth={2.5} />
          )}
        </motion.button>
      </div>
    </div>
  );
}
