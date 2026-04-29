'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import houseImg from '@/assets/house.png';

export default function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-[#67c900] flex items-center justify-center flex-shrink-0 overflow-hidden">
        <Image src={houseImg} alt="House Bot" width={32} height={32} className="w-full h-full object-cover" />
      </div>
      <div className="bg-dark-800 border border-dark-700 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1.5 items-center h-5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 bg-dark-400 rounded-full"
              animate={{ scale: [0.5, 1, 0.5] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
