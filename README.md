# HouseChat — Assistente Imobiliário com IA da VCA CONSTRUTORA

Web app de chat com IA (Claude Haiku 4.5) integrado ao Supabase, com autenticação e controle de acesso baseado em roles (RBAC).

## Arquitetura

```
jardas-bot/
├── backend/          # Node.js + Express
│   └── src/
│       ├── ai/               # Mapeamento de intenção → permissão
│       ├── controllers/      # Lógica de negócio
│       ├── database/         # Cliente Supabase (admin)
│       ├── middlewares/      # Auth (JWT) + Permissões (RBAC)
│       ├── routes/           # Endpoints da API
│       └── services/         # Claude, Supabase, Permissão
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
            [5] Envia contexto para Claude
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
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
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
3. No backend, adicione o padrão regex em `src/ai/intentMapper.js`
4. No backend, adicione a query em `src/services/supabaseService.js` → `fetchContextData()`
5. Conceda a permissão ao role desejado na tabela `role_permissions`

## Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, Zod
- **Banco**: Supabase (PostgreSQL) sem RLS, com controle no código
- **Auth**: Supabase Auth (JWT)
- **IA**: Claude Haiku 4.5 (Anthropic)

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

3. Permissões por role (Layer 2, pós-Haiku) estão em permissionService.js:
const ROLE_PERMISSIONS = {
  admin:    new Set(['view_empreendimentos', 'view_unidades', 'view_reservas', 'view_clientes', 'view_financeiro']),
  corretor: new Set(['view_empreendimentos', 'view_unidades']),
};

Resumo do fluxo:

Adicionar keyword nova → editar KEYWORD_RULES no intentMapper.js
Bloquear/liberar um intent para corretor → editar RESTRICTED_INTENTS_FOR_CORRETOR no intentMapper.js
Adicionar um novo role → editar ROLE_PERMISSIONS no permissionService.js + RESTRICTED_INTENTS_FOR_CORRETOR no intentMapper.js