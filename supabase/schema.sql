-- ============================================
-- JARDAS BOT - Schema do Banco de Dados
-- RLS desabilitado (controle via código)
-- ============================================

-- Tabela de usuários (sincronizada com Supabase Auth)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'corretor' CHECK (role IN ('admin', 'corretor')),
  daily_message_count INT NOT NULL DEFAULT 0,
  last_message_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de permissões
CREATE TABLE IF NOT EXISTS public.permissions (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de permissões por role
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id SERIAL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('admin', 'corretor')),
  permission_id INT NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  UNIQUE(role, permission_id)
);

-- Tabela de conversas
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de empreendimentos (dados do CVCRM)
CREATE TABLE IF NOT EXISTS public.empreendimentos_cvcrm (
  id SERIAL PRIMARY KEY,
  id_empreendimento INT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  data_entrega TEXT,
  situacao_obra TEXT,
  quantidade_unidades_disponiveis INT DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.empreendimentos_lotear (
  id SERIAL PRIMARY KEY,
  id_empreendimento INT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  data_entrega TEXT,
  situacao_obra TEXT,
  quantidade_unidades_disponiveis INT DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reservas_cvcrm'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'vendas_cvcrm'
  ) THEN
    ALTER TABLE public.reservas_cvcrm RENAME TO vendas_cvcrm;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.vendas_cvcrm (
  id SERIAL PRIMARY KEY,
  numero_reserva TEXT UNIQUE NOT NULL,
  tipo_de_venda TEXT,
  empreendimento TEXT,
  unidade TEXT,
  titular_nome TEXT,
  documento_cliente TEXT,
  corretor TEXT,
  imobiliaria TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vendas_lotear (
  id SERIAL PRIMARY KEY,
  numero_reserva TEXT UNIQUE NOT NULL,
  tipo_de_venda TEXT,
  empreendimento TEXT,
  unidade TEXT,
  titular_nome TEXT,
  documento_cliente TEXT,
  corretor TEXT,
  imobiliaria TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendas_cvcrm' AND column_name = 'situacao'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'vendas_cvcrm' AND column_name = 'tipo_de_venda'
  ) THEN
    ALTER TABLE public.vendas_cvcrm RENAME COLUMN situacao TO tipo_de_venda;
  END IF;
END $$;

ALTER TABLE public.vendas_cvcrm ADD COLUMN IF NOT EXISTS documento_cliente TEXT;
ALTER TABLE public.vendas_cvcrm ADD COLUMN IF NOT EXISTS corretor TEXT;
ALTER TABLE public.vendas_cvcrm ADD COLUMN IF NOT EXISTS imobiliaria TEXT;
ALTER TABLE public.vendas_cvcrm DROP COLUMN IF EXISTS tipologia;
ALTER TABLE public.vendas_cvcrm DROP COLUMN IF EXISTS titular_documento;
ALTER TABLE public.vendas_cvcrm DROP COLUMN IF EXISTS associados;
ALTER TABLE public.vendas_cvcrm DROP COLUMN IF EXISTS corretor_nome;
ALTER TABLE public.vendas_cvcrm DROP COLUMN IF EXISTS corretor_imobiliaria;

-- ============================================
-- DESABILITAR RLS EM TODAS AS TABELAS
-- (Controle de acesso feito via código)
-- ============================================
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.empreendimentos_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.empreendimentos_lotear DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_lotear DISABLE ROW LEVEL SECURITY;

-- ============================================
-- SEED: Permissões padrão
-- ============================================
INSERT INTO public.permissions (name, description) VALUES
  ('view_empreendimentos', 'Ver dados de empreendimentos'),
  ('view_unidades', 'Ver dados de unidades'),
  ('view_reservas', 'Ver dados de reservas'),
  ('view_clientes', 'Ver dados de clientes'),
  ('view_financeiro', 'Ver dados financeiros')
ON CONFLICT (name) DO NOTHING;

-- Admin tem todas as permissões
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin', id FROM public.permissions
ON CONFLICT (role, permission_id) DO NOTHING;

-- Corretor tem apenas empreendimentos e unidades
INSERT INTO public.role_permissions (role, permission_id)
SELECT 'corretor', id FROM public.permissions WHERE name IN ('view_empreendimentos', 'view_unidades')
ON CONFLICT (role, permission_id) DO NOTHING;

-- ============================================
-- TRIGGER: Criar user na tabela public.users ao registrar
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'corretor')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_empreendimentos_nome ON public.empreendimentos_cvcrm(nome);
CREATE INDEX IF NOT EXISTS idx_empreendimentos_lotear_nome ON public.empreendimentos_lotear(nome);
CREATE INDEX IF NOT EXISTS idx_vendas_empreendimento ON public.vendas_cvcrm(empreendimento);
CREATE INDEX IF NOT EXISTS idx_vendas_titular ON public.vendas_cvcrm(titular_nome);
CREATE INDEX IF NOT EXISTS idx_vendas_lotear_empreendimento ON public.vendas_lotear(empreendimento);
CREATE INDEX IF NOT EXISTS idx_vendas_lotear_titular ON public.vendas_lotear(titular_nome);

-- ============================================
-- NOVAS TABELAS: Estoque e Distratos
-- ============================================

CREATE TABLE IF NOT EXISTS public.estoque_cvcrm (
  id SERIAL PRIMARY KEY,
  idunidade INT UNIQUE NOT NULL,
  idempreendimento INT,
  nome_empreendimento TEXT,
  tipo_empreendimento TEXT,
  etapa TEXT,
  bloco TEXT,
  unidade TEXT,
  area_privativa NUMERIC,
  tipologia TEXT,
  vagas_garagem TEXT,
  situacao_mapa_disponibilidade INT,
  situacao TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.estoque_lotear (
  id SERIAL PRIMARY KEY,
  idunidade INT UNIQUE NOT NULL,
  idempreendimento INT,
  nome_empreendimento TEXT,
  tipo_empreendimento TEXT,
  etapa TEXT,
  bloco TEXT,
  unidade TEXT,
  area_privativa NUMERIC,
  tipologia TEXT,
  vagas_garagem TEXT,
  situacao_mapa_disponibilidade INT,
  situacao TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migração: adicionar novas colunas se a tabela já existia com schema antigo
ALTER TABLE public.estoque_cvcrm ADD COLUMN IF NOT EXISTS tipo_empreendimento TEXT;
ALTER TABLE public.estoque_cvcrm ADD COLUMN IF NOT EXISTS area_privativa NUMERIC;
ALTER TABLE public.estoque_cvcrm ADD COLUMN IF NOT EXISTS tipologia TEXT;
ALTER TABLE public.estoque_cvcrm ADD COLUMN IF NOT EXISTS vagas_garagem TEXT;
ALTER TABLE public.estoque_cvcrm ADD COLUMN IF NOT EXISTS situacao_mapa_disponibilidade INT;
ALTER TABLE public.estoque_cvcrm DROP COLUMN IF EXISTS valor;

ALTER TABLE public.estoque_lotear ADD COLUMN IF NOT EXISTS tipo_empreendimento TEXT;
ALTER TABLE public.estoque_lotear ADD COLUMN IF NOT EXISTS area_privativa NUMERIC;
ALTER TABLE public.estoque_lotear ADD COLUMN IF NOT EXISTS tipologia TEXT;
ALTER TABLE public.estoque_lotear ADD COLUMN IF NOT EXISTS vagas_garagem TEXT;
ALTER TABLE public.estoque_lotear ADD COLUMN IF NOT EXISTS situacao_mapa_disponibilidade INT;
ALTER TABLE public.estoque_lotear DROP COLUMN IF EXISTS valor;

CREATE TABLE IF NOT EXISTS public.distratos_cvcrm (
  id SERIAL PRIMARY KEY,
  id_distrato TEXT UNIQUE NOT NULL,
  id_reserva INT,
  situacao_atual TEXT,
  empreendimento TEXT,
  etapa TEXT,
  bloco TEXT,
  unidade TEXT,
  corretor TEXT,
  imobiliaria TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.distratos_lotear (
  id SERIAL PRIMARY KEY,
  id_distrato TEXT UNIQUE NOT NULL,
  id_reserva INT,
  situacao_atual TEXT,
  empreendimento TEXT,
  etapa TEXT,
  bloco TEXT,
  unidade TEXT,
  corretor TEXT,
  imobiliaria TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.estoque_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_lotear DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.distratos_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.distratos_lotear DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_estoque_cvcrm_emp ON public.estoque_cvcrm(nome_empreendimento);
CREATE INDEX IF NOT EXISTS idx_estoque_cvcrm_situacao ON public.estoque_cvcrm(situacao);
CREATE INDEX IF NOT EXISTS idx_estoque_lotear_emp ON public.estoque_lotear(nome_empreendimento);
CREATE INDEX IF NOT EXISTS idx_estoque_lotear_situacao ON public.estoque_lotear(situacao);
CREATE INDEX IF NOT EXISTS idx_distratos_cvcrm_emp ON public.distratos_cvcrm(empreendimento);
CREATE INDEX IF NOT EXISTS idx_distratos_lotear_emp ON public.distratos_lotear(empreendimento);

-- ============================================
-- TABELAS: Tabela de Preço
-- ============================================

CREATE TABLE IF NOT EXISTS public.tabela_de_preco_cvcrm (
  id SERIAL PRIMARY KEY,
  idtabela INT NOT NULL,
  idempreendimento INT NOT NULL,
  idunidade INT,
  empreendimento TEXT,
  tabela TEXT,
  bloco TEXT,
  unidade TEXT NOT NULL,
  area_privativa NUMERIC,
  valor_total NUMERIC,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(idtabela, unidade, bloco)
);

CREATE TABLE IF NOT EXISTS public.tabela_de_preco_lotear (
  id SERIAL PRIMARY KEY,
  idtabela INT NOT NULL,
  idempreendimento INT NOT NULL,
  idunidade INT,
  empreendimento TEXT,
  tabela TEXT,
  bloco TEXT,
  unidade TEXT NOT NULL,
  area_privativa NUMERIC,
  valor_total NUMERIC,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(idtabela, unidade, bloco)
);

-- Migração: adicionar idunidade nas tabelas de preço existentes
ALTER TABLE public.tabela_de_preco_cvcrm ADD COLUMN IF NOT EXISTS idunidade INT;
ALTER TABLE public.tabela_de_preco_lotear ADD COLUMN IF NOT EXISTS idunidade INT;

-- Índice para lookup rápido por idunidade
CREATE INDEX IF NOT EXISTS idx_preco_cvcrm_idunidade ON public.tabela_de_preco_cvcrm(idunidade);
CREATE INDEX IF NOT EXISTS idx_preco_lotear_idunidade ON public.tabela_de_preco_lotear(idunidade);

ALTER TABLE public.tabela_de_preco_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_de_preco_lotear DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_preco_cvcrm_emp ON public.tabela_de_preco_cvcrm(idempreendimento);
CREATE INDEX IF NOT EXISTS idx_preco_cvcrm_unidade ON public.tabela_de_preco_cvcrm(unidade);
CREATE INDEX IF NOT EXISTS idx_preco_lotear_emp ON public.tabela_de_preco_lotear(idempreendimento);
CREATE INDEX IF NOT EXISTS idx_preco_lotear_unidade ON public.tabela_de_preco_lotear(unidade);

-- ============================================
-- MIGRAÇÃO: renomear role 'user' → 'corretor'
-- Executar UMA ÚNICA VEZ no Supabase SQL Editor
-- ============================================

-- 1. Dropar constraints antigas (que limitam a 'user')
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;

-- 2. Migrar dados existentes
UPDATE public.users SET role = 'corretor' WHERE role = 'user';
UPDATE public.role_permissions SET role = 'corretor' WHERE role = 'user';

-- 3. Recriar constraints com os novos valores
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'corretor'));

ALTER TABLE public.role_permissions
  ADD CONSTRAINT role_permissions_role_check CHECK (role IN ('admin', 'corretor'));

