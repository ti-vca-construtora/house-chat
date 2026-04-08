'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Image from 'next/image';
import logo from '../../assets/logo.png';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await signUp(email, password);
        setIsSignUp(false);
        alert('Account created! Please check your email.');
      } else {
        await signIn(email, password);
        router.replace('/chat');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* Left pane - Brand Area */}
      <div className="hidden lg:flex w-1/2 bg-[#0F0F0F] p-12 flex-col justify-between relative overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#67c900] opacity-10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="relative z-10 flex items-center">
          <Image src={logo} alt="Jardas Bot Logo" width={250} height={170} priority />
        </div>
        
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
            A inteligência AUrtificial da VCA CONSTRUTORA!
          </h1>
          <p className="text-gray-400 text-lg">
            O nosso eterno House irá te ajudar com todas as suas dúvidas referentes a maior construtora da Bahia!
          </p>
        </div>
        
        <div className="relative z-10 flex gap-6 text-sm text-gray-500 font-medium tracking-wide">
          <span>© 2024 VCA Construtora</span>
          <a href="#" className="hover:text-gray-300 transition">Privacidade</a>
          <a href="#" className="hover:text-gray-300 transition">Segurança</a>
        </div>
      </div>

      {/* Right pane - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile Logo */}
          <div className="flex lg:hidden items-center mb-8 justify-center">
             <Image src={logo} alt="Jardas Bot Logo" width={64} height={64} className="opacity-90" />
          </div>

          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            {isSignUp ? 'Criar Conta' : 'Bem-vindo de volta'}
          </h2>
          <p className="text-gray-500 mb-8 font-medium">
            {isSignUp ? 'Preencha seus dados para criar uma conta.' : 'Digite suas credenciais para acessar o painel.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@exemplo.com.br"
                required
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#67c900]/50 focus:border-[#67c900] text-gray-900 bg-gray-50 transition-all font-medium"
                autoComplete="email"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#67c900]/50 focus:border-[#67c900] text-gray-900 bg-gray-50 transition-all font-medium pr-10"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-red-500 text-sm font-medium bg-red-50 px-3 py-2 rounded-lg"
              >
                {error}
              </motion.p>
            )}

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full py-3 px-4 bg-[#67c900] hover:bg-[#52a100] text-black font-semibold flex items-center justify-center gap-2 rounded-lg shadow-lg shadow-[#67c900]/30 transition-all mt-6"
            >
              {loading && <Loader2 size={16} className="animate-spin text-black" />}
              {isSignUp ? 'Criar Conta' : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 text-center text-sm font-medium">
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
              }}
              className="text-gray-500 hover:text-black transition"
            >
              {isSignUp
                ? 'Já tem uma conta? Entrar'
                : 'Não tem uma conta? Criar Conta'}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
