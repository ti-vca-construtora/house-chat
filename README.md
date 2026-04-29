# HouseChat — Assistente Imobiliário com IA da VCA CONSTRUTORA

Web app de chat com IA via OpenAI integrado ao Supabase, com autenticação e controle de acesso baseado em roles (RBAC).

## Arquitetura

```
house-chat/
├── backend/          # Node.js + Express
│   └── src/
│       ├── ai/               # Mapeamento de intenção → permissão
│       ├── controllers/      # Lógica de negócio
│       ├── database/         # Cliente Supabase (admin)
│       ├── middlewares/      # Auth (JWT) + Permissões (RBAC)
│       ├── routes/           # Endpoints da API
│       └── services/         # OpenAI, Supabase, Permissão
├── frontend/         # Next.js 15 + TypeScript + Tailwind
│   └── src/
│       ├── app/              # Next.js App Router
│       ├── components/       # ChatWindow, Sidebar
│       ├── hooks/            # useAuth, useChat
│       ├── lib/              # Supabase client, API client
│       └── types/            # Tipos TypeScript
└── supabase/
    └── schema.sql    # Esquema completo do banco
```

## Fluxo de Segurança

```
Usuário envia mensagem
        ↓
[1] Valida JWT (Supabase)
        ↓
[2] Verifica cota diária (user: 20/dia | admin: ilimitado)
        ↓
[3] Mapeia intenção da pergunta → permissões necessárias
        ↓
[4] Checa RBAC no banco
        ↓
   ┌────┴────┐
   ✗         ✓
   │         │
Erro 403   Busca dados no Supabase
(sem IA)         ↓
            [5] Envia contexto para OpenAI
                ↓
            [6] Retorna resposta
```

## Setup

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. No **SQL Editor**, execute `supabase/schema.sql`
3. Crie um usuário admin:
   - Vá em **Authentication → Users → Add user**
   - Após criar, atualize o role na tabela `users`:
     ```sql
     UPDATE public.users SET role = 'admin' WHERE email = 'seu@email.com';
     ```
4. Anote as credenciais:
   - `Project URL` (Settings → API)
   - `anon` key (pública)
   - `service_role` key (secreta — só no backend)

### 2. Backend

```bash
cd backend
cp .env.example .env
# Preencha as variáveis no .env
npm install
npm run dev
```

**Variáveis obrigatórias** (`.env`):

| Variável | Onde encontrar |
|---|---|
| `SUPABASE_URL` | Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Settings → API → service_role key |
| `OPENAI_API_KEY` | Chave da API OpenAI |
| `OPENAI_MODEL` | Modelo principal, ex: `gpt-5.2` |
| `OPENAI_MODEL_FALLBACK` | Modelo fallback, ex: `gpt-5` |
| `FRONTEND_URL` | `http://localhost:3000` |
| `CVCRM_EMAIL` | Email da API CVCRM |
| `CVCRM_TOKEN` | Token da API CVCRM |
| `LOTEAR_EMAIL` | Email da API CVCRM da base LOTEAR |
| `LOTEAR_TOKEN` | Token da API CVCRM da base LOTEAR |

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
# Preencha as variáveis
npm install
npm run dev
```

**Variáveis** (`.env.local`):

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (pública) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` |

## Permissões (RBAC)

| Permissão | Admin | User |
|---|---|---|
| `view_empreendimentos` | ✅ | ✅ |
| `view_unidades` | ✅ | ✅ |
| `view_reservas` | ✅ | ❌ |
| `view_clientes` | ✅ | ❌ |
| `view_financeiro` | ✅ | ❌ |
| Mensagens/dia | Ilimitado | 20 |

Para adicionar/remover permissões de um role:

```sql
-- Dar permissão de ver reservas para user
INSERT INTO role_permissions (role, permission_id)
SELECT 'user', id FROM permissions WHERE name = 'view_reservas';

-- Remover permissão
DELETE FROM role_permissions
WHERE role = 'user'
  AND permission_id = (SELECT id FROM permissions WHERE name = 'view_reservas');
```

## Adicionando novas tabelas de dados

1. Crie a tabela no Supabase (adicionar ao `schema.sql`)
2. Adicione a permissão em `supabase/schema.sql` → tabela `permissions`
3. Atualize o catálogo em `src/services/businessCatalog.js`
4. Se for uma consulta recorrente e critica, adicione ou ajuste o plano em `src/services/queryPlanner.js`
5. Se precisar de calculo especifico, implemente o executor em `src/services/queryExecutors.js`
6. Conceda a permissão ao role desejado na tabela `role_permissions`

## Motor de consultas da IA

O backend usa uma arquitetura híbrida:

- A OpenAI interpreta a pergunta e extrai intents/entities.
- `queryPlanner` escolhe um plano determinístico validado.
- `queryExecutors` consulta o Supabase, cruza tabelas e calcula o payload final.
- A IA recebe `answer_payload` e apenas redige a resposta.

Esse desenho evita que a IA invente joins, ignore tipologia/preço ou ofereça ações que o sistema não executa.

## Carga BigQuery -> Supabase

Para recriar e carregar somente as tabelas recebidas do BigQuery, use:

- `supabase/bigquery_import_schema.sql` para criar as tabelas de destino no Supabase
- `backend/.env` para configurar `GOOGLE_CLOUD_PROJECT_ID`, `BIGQUERY_DATASET` e `GOOGLE_APPLICATION_CREDENTIALS_BASE64`
- `supabase/bigquery_import_runbook.md` para a ordem operacional da sincronizacao BigQuery via backend

Esse fluxo nao altera `users`, `permissions`, `role_permissions`, `conversations` ou `messages`.

## Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, Zod
- **Banco**: Supabase (PostgreSQL) sem RLS, com controle no código
- **Auth**: Supabase Auth (JWT)
- **IA**: OpenAI Responses API (`gpt-5.4-mini`)

## CONFIGURANDO PERMISSÕES

1. Intents restritos para o corretor (quais intents ele NÃO pode acessar):
const RESTRICTED_INTENTS_FOR_CORRETOR = new Set(['reservas', 'distratos', 'clientes', 'financeiro']);

2. Keywords da Layer 1 (o que dispara o bloqueio antes de chamar a IA):
const KEYWORD_RULES = [
  { intent: 'reservas',   pattern: /\breservas?\b|\bvendas?\b|\bcontratos?\b|.../i },
  { intent: 'distratos',  pattern: /\bdistratos?\b|\brescis[aã]o\b|.../i },
  { intent: 'clientes',   pattern: /\bclientes?\b|\bcpf\b|\bdocumentos?\b/i },
  { intent: 'financeiro', pattern: /\bfinanc\w*\b|\bpreços?\b|.../i },
];

3. Permissões por role (Layer 2, pós-classificação de intenção) estão em permissionService.js:
const ROLE_PERMISSIONS = {
  admin:    new Set(['view_empreendimentos', 'view_unidades', 'view_reservas', 'view_clientes', 'view_financeiro']),
  corretor: new Set(['view_empreendimentos', 'view_unidades']),
};

Resumo do fluxo:

Adicionar keyword nova → editar KEYWORD_RULES no intentMapper.js
Bloquear/liberar um intent para corretor → editar RESTRICTED_INTENTS_FOR_CORRETOR no intentMapper.js
Adicionar um novo role → editar ROLE_PERMISSIONS no permissionService.js + RESTRICTED_INTENTS_FOR_CORRETOR no intentMapper.js
