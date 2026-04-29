-- Recreate only the tables imported from BigQuery.
-- Do not run destructive statements against users, permissions, conversations, or messages.

CREATE TABLE IF NOT EXISTS public.empreendimentos_cvcrm (
  id BIGSERIAL PRIMARY KEY,
  id_empreendimento BIGINT UNIQUE NOT NULL,
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
  id BIGSERIAL PRIMARY KEY,
  id_empreendimento BIGINT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  estado TEXT,
  data_entrega TEXT,
  situacao_obra TEXT,
  quantidade_unidades_disponiveis INT DEFAULT 0,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.vendas_cvcrm (
  id BIGSERIAL PRIMARY KEY,
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
  id BIGSERIAL PRIMARY KEY,
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

CREATE TABLE IF NOT EXISTS public.estoque_cvcrm (
  id BIGSERIAL PRIMARY KEY,
  idunidade BIGINT UNIQUE NOT NULL,
  idempreendimento BIGINT,
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
  id BIGSERIAL PRIMARY KEY,
  idunidade BIGINT UNIQUE NOT NULL,
  idempreendimento BIGINT,
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

CREATE TABLE IF NOT EXISTS public.distratos_cvcrm (
  id BIGSERIAL PRIMARY KEY,
  id_distrato TEXT UNIQUE NOT NULL,
  id_reserva BIGINT,
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
  id BIGSERIAL PRIMARY KEY,
  id_distrato TEXT UNIQUE NOT NULL,
  id_reserva BIGINT,
  situacao_atual TEXT,
  empreendimento TEXT,
  etapa TEXT,
  bloco TEXT,
  unidade TEXT,
  corretor TEXT,
  imobiliaria TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tabela_de_preco_cvcrm (
  id BIGSERIAL PRIMARY KEY,
  idtabela BIGINT NOT NULL,
  idempreendimento BIGINT NOT NULL,
  idunidade BIGINT,
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
  id BIGSERIAL PRIMARY KEY,
  idtabela BIGINT NOT NULL,
  idempreendimento BIGINT NOT NULL,
  idunidade BIGINT,
  empreendimento TEXT,
  tabela TEXT,
  bloco TEXT,
  unidade TEXT NOT NULL,
  area_privativa NUMERIC,
  valor_total NUMERIC,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(idtabela, unidade, bloco)
);

CREATE TABLE IF NOT EXISTS public."TB_HIST_LEADS" (
  id BIGINT,
  referencia TEXT,
  referencia_data TEXT,
  ativo TEXT,
  idhistorico BIGINT,
  idlead BIGINT,
  data_cad TEXT,
  de TEXT,
  para TEXT,
  de_nome TEXT,
  para_nome TEXT,
  motivo_cancelamento TEXT,
  data_cancelamento TEXT,
  painel_usuario TEXT,
  idusuario NUMERIC
);

CREATE TABLE IF NOT EXISTS public."TB_LEADS" (
  id BIGINT,
  referencia TEXT,
  referencia_data TEXT,
  ativo TEXT,
  idlead BIGINT,
  idsituacao BIGINT,
  situacao TEXT,
  data_cad TEXT,
  nome TEXT,
  email TEXT,
  telefone TEXT,
  documento_cliente TEXT,
  cep_cliente TEXT,
  idponto_venda BIGINT,
  ponto_venda TEXT,
  conversao_original TEXT,
  conversao_ultimo TEXT,
  idempreendimento_primeiro BIGINT,
  empreendimento_primeiro TEXT,
  idempreendimento_ultimo BIGINT,
  empreendimento_ultimo TEXT,
  idmotivo BIGINT,
  motivo TEXT,
  idgestor BIGINT,
  gestor TEXT,
  idcorretor BIGINT,
  corretor TEXT,
  idimobiliaria BIGINT,
  imobiliaria TEXT,
  feedback BIGINT,
  origem TEXT,
  origem_ultimo TEXT,
  midia_ultimo TEXT,
  midia_original TEXT,
  renda_familiar TEXT,
  motivo_cancelamento TEXT,
  data_cancelamento TEXT,
  data_ultima_interacao TEXT,
  ultima_data_conversao TEXT,
  data_reativacao TEXT,
  idsituacao_anterior BIGINT,
  nome_situacao_anterior_lead TEXT,
  descricao_motivo_cancelamento TEXT,
  possibilidade_venda BIGINT,
  inserido_bolsao BIGINT,
  data_primeira_interacao_gestor TEXT,
  data_primeira_interacao_corretor TEXT,
  score BIGINT,
  idgestor_ultimo BIGINT,
  gestor_ultimo TEXT,
  idcorretor_ultimo BIGINT,
  corretor_ultimo TEXT,
  idcorretor_penultimo BIGINT,
  idimobiliaria_ultimo NUMERIC,
  corretor_penultimo TEXT,
  nome_momento_lead TEXT,
  novo TEXT,
  retorno TEXT,
  data_ultima_alteracao TEXT,
  estado TEXT,
  cidade TEXT,
  regiao TEXT,
  vencido TEXT,
  data_vencimento TEXT,
  empreendimento TEXT,
  caracteristicas BIGINT,
  tags TEXT,
  conversao TEXT,
  idempreendimento TEXT,
  codigointerno_empreendimento TEXT,
  reserva BIGINT,
  origem_nome TEXT,
  origem_ultimo_nome TEXT
);

CREATE TABLE IF NOT EXISTS public."TB_PRECADASTROS" (
  id BIGINT,
  referencia TEXT,
  referencia_data TEXT,
  ativo TEXT,
  idprecadastro BIGINT,
  codigointerno BIGINT,
  idsituacao BIGINT,
  situacao TEXT,
  condicao_aprovada TEXT,
  idempreendimento BIGINT,
  empreendimento TEXT,
  idunidade NUMERIC,
  unidade TEXT,
  idcorretor BIGINT,
  corretor TEXT,
  idimobiliaria BIGINT,
  imobiliaria TEXT,
  idempresa BIGINT,
  empresa TEXT,
  pessoa TEXT,
  cep_cliente TEXT,
  renda_cliente_principal TEXT,
  idusuario_correspondente BIGINT,
  usuario_correspondente TEXT,
  idpessoa BIGINT,
  idlead TEXT,
  valor_avaliacao NUMERIC,
  valor_aprovado NUMERIC,
  valor_subsidio BIGINT,
  valor_total NUMERIC,
  valor_fgts NUMERIC,
  saldo_devedor NUMERIC,
  prazo TEXT,
  observacoes TEXT,
  tabela TEXT,
  valor_prestacao NUMERIC,
  carta_credito BIGINT,
  vencimento_aprovacao BIGINT,
  idmotivo_reprovacao BIGINT,
  motivo_reprovacao TEXT,
  descricao_motivo_reprovacao TEXT,
  idmotivo_cancelamento BIGINT,
  motivo_cancelamento TEXT,
  descricao_motivo_cancelamento TEXT,
  sla_vencimento TEXT,
  data_cad TEXT,
  empresa_correspondente TEXT,
  idsituacao_anterior BIGINT,
  situacao_anterior TEXT,
  data_ultima_alteracao_situacao TEXT,
  idintencao_compra NUMERIC,
  intencao_compra TEXT,
  renda_total NUMERIC,
  tipo_venda TEXT,
  responsavel_cadastro TEXT
);

CREATE TABLE IF NOT EXISTS public."TB_PRECADASTROS_LOT" (
  id BIGINT,
  referencia TEXT,
  referencia_data TEXT,
  ativo TEXT,
  idprecadastro BIGINT,
  codigointerno BIGINT,
  idsituacao BIGINT,
  situacao TEXT,
  condicao_aprovada TEXT,
  idempreendimento BIGINT,
  empreendimento TEXT,
  idunidade BIGINT,
  unidade BIGINT,
  idcorretor BIGINT,
  corretor TEXT,
  idimobiliaria BIGINT,
  imobiliaria TEXT,
  idempresa BIGINT,
  empresa TEXT,
  pessoa TEXT,
  cep_cliente TEXT,
  renda_cliente_principal TEXT,
  idusuario_correspondente BIGINT,
  usuario_correspondente TEXT,
  idpessoa BIGINT,
  idlead TEXT,
  valor_avaliacao NUMERIC,
  valor_aprovado NUMERIC,
  valor_subsidio BIGINT,
  valor_total NUMERIC,
  valor_fgts BIGINT,
  saldo_devedor BIGINT,
  prazo BIGINT,
  observacoes TEXT,
  tabela TEXT,
  valor_prestacao NUMERIC,
  carta_credito BIGINT,
  vencimento_aprovacao BIGINT,
  idmotivo_reprovacao BIGINT,
  motivo_reprovacao BIGINT,
  descricao_motivo_reprovacao TEXT,
  idmotivo_cancelamento BIGINT,
  motivo_cancelamento TEXT,
  descricao_motivo_cancelamento BIGINT,
  sla_vencimento BIGINT,
  data_cad TEXT,
  empresa_correspondente TEXT,
  idsituacao_anterior BIGINT,
  situacao_anterior TEXT,
  data_ultima_alteracao_situacao TEXT,
  idintencao_compra NUMERIC,
  intencao_compra TEXT,
  renda_total NUMERIC,
  tipo_venda BIGINT,
  responsavel_cadastro BIGINT
);

ALTER TABLE public.empreendimentos_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.empreendimentos_lotear DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_lotear DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.estoque_lotear DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.distratos_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.distratos_lotear DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_de_preco_cvcrm DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tabela_de_preco_lotear DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."TB_HIST_LEADS" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."TB_LEADS" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."TB_PRECADASTROS" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."TB_PRECADASTROS_LOT" DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_empreendimentos_cvcrm_nome ON public.empreendimentos_cvcrm(nome);
CREATE INDEX IF NOT EXISTS idx_empreendimentos_lotear_nome ON public.empreendimentos_lotear(nome);
CREATE INDEX IF NOT EXISTS idx_vendas_cvcrm_empreendimento ON public.vendas_cvcrm(empreendimento);
CREATE INDEX IF NOT EXISTS idx_vendas_cvcrm_titular ON public.vendas_cvcrm(titular_nome);
CREATE INDEX IF NOT EXISTS idx_vendas_lotear_empreendimento ON public.vendas_lotear(empreendimento);
CREATE INDEX IF NOT EXISTS idx_vendas_lotear_titular ON public.vendas_lotear(titular_nome);
CREATE INDEX IF NOT EXISTS idx_estoque_cvcrm_emp ON public.estoque_cvcrm(nome_empreendimento);
CREATE INDEX IF NOT EXISTS idx_estoque_cvcrm_situacao ON public.estoque_cvcrm(situacao);
CREATE INDEX IF NOT EXISTS idx_estoque_lotear_emp ON public.estoque_lotear(nome_empreendimento);
CREATE INDEX IF NOT EXISTS idx_estoque_lotear_situacao ON public.estoque_lotear(situacao);
CREATE INDEX IF NOT EXISTS idx_distratos_cvcrm_emp ON public.distratos_cvcrm(empreendimento);
CREATE INDEX IF NOT EXISTS idx_distratos_lotear_emp ON public.distratos_lotear(empreendimento);
CREATE INDEX IF NOT EXISTS idx_preco_cvcrm_emp ON public.tabela_de_preco_cvcrm(idempreendimento);
CREATE INDEX IF NOT EXISTS idx_preco_cvcrm_unidade ON public.tabela_de_preco_cvcrm(unidade);
CREATE INDEX IF NOT EXISTS idx_preco_lotear_emp ON public.tabela_de_preco_lotear(idempreendimento);
CREATE INDEX IF NOT EXISTS idx_preco_lotear_unidade ON public.tabela_de_preco_lotear(unidade);
CREATE INDEX IF NOT EXISTS idx_tb_leads_idlead ON public."TB_LEADS"(idlead);
CREATE INDEX IF NOT EXISTS idx_tb_hist_leads_idlead ON public."TB_HIST_LEADS"(idlead);
CREATE INDEX IF NOT EXISTS idx_tb_precadastros_idprecadastro ON public."TB_PRECADASTROS"(idprecadastro);
CREATE INDEX IF NOT EXISTS idx_tb_precadastros_lot_idprecadastro ON public."TB_PRECADASTROS_LOT"(idprecadastro);
