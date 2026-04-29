# Runbook de carga BigQuery -> Supabase

Este runbook recria e carrega apenas as tabelas alimentadas pelo BigQuery no Supabase. Ele nao altera `users`, `permissions`, `role_permissions`, `conversations` ou `messages`.

## 1. Preparar as tabelas no Supabase

Execute este arquivo no SQL Editor do Supabase:

```sql
-- supabase/bigquery_import_schema.sql
```

## 2. Configurar credenciais Google

No `backend/.env`, mantenha estas variaveis:

```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_SERVICE_KEY=SUA_SERVICE_ROLE_KEY

GOOGLE_CLOUD_PROJECT_ID=datawarehouse-492815
BIGQUERY_DATASET=cv
GOOGLE_APPLICATION_CREDENTIALS_BASE64=JSON_DA_SERVICE_ACCOUNT_EM_BASE64
BIGQUERY_SYNC_SECRET=SEGREDO_OPERACIONAL
```

A service account precisa conseguir executar jobs de consulta no projeto do BigQuery. No Google Cloud, conceda uma permissao que inclua:

- `bigquery.jobs.create` no projeto `GOOGLE_CLOUD_PROJECT_ID`;
- leitura das tabelas/views do dataset `BIGQUERY_DATASET`.

Na pratica, os roles mais comuns sao `BigQuery Job User` no projeto e `BigQuery Data Viewer` no dataset.

## 3. Subir backend e frontend

Backend:

```powershell
cd backend
npm install
npm run dev
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

Confirme que o usuario que fara a sincronizacao tem role `admin`:

```sql
UPDATE public.users
SET role = 'admin'
WHERE email = 'seu@email.com';
```

## 4. Executar pela interface

1. Acesse o frontend.
2. Faca login com um usuario `admin`.
3. Clique em `Sincronizar Dados`.
4. Escolha todas as tabelas, uma base ou uma tabela especifica.
5. Inicie a sincronizacao e acompanhe o job no modal.

## 5. Executar por API

Obtenha um JWT de um usuario `admin` pelo login normal da aplicacao. Depois chame:

```powershell
$token = "JWT_DO_USUARIO_ADMIN"

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3001/api/sync/jobs" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body '{"scope":"all","mode":"total"}'
```

Consultar andamento:

```powershell
$jobId = "ID_RETORNADO_NO_START"

Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:3001/api/sync/jobs/$jobId" `
  -Headers @{ Authorization = "Bearer $token" }
```

Escopos aceitos:

```text
all
source:cvcrm
source:lotear
table:empreendimentos_cvcrm
table:vendas_cvcrm
table:estoque_cvcrm
table:distratos_cvcrm
table:tabela_de_preco_cvcrm
table:TB_HIST_LEADS
table:TB_LEADS
table:TB_PRECADASTROS
table:empreendimentos_lotear
table:vendas_lotear
table:estoque_lotear
table:distratos_lotear
table:tabela_de_preco_lotear
table:TB_PRECADASTROS_LOT
```

## 6. O que a sincronizacao faz

Tabelas principais usam `upsert`:

- `empreendimentos_*`: conflito por `id_empreendimento`;
- `vendas_*`: conflito por `numero_reserva`;
- `estoque_*`: conflito por `idunidade`;
- `distratos_*`: conflito por `id_distrato`;
- `tabela_de_preco_*`: conflito por `idtabela,unidade,bloco`.

Tabelas brutas sem chave unica clara sao recarregadas por substituicao:

- `TB_HIST_LEADS`
- `TB_LEADS`
- `TB_PRECADASTROS`
- `TB_PRECADASTROS_LOT`

## 7. Validar no Supabase

```sql
SELECT 'empreendimentos_cvcrm' AS table_name, COUNT(*) FROM public.empreendimentos_cvcrm
UNION ALL SELECT 'empreendimentos_lotear', COUNT(*) FROM public.empreendimentos_lotear
UNION ALL SELECT 'vendas_cvcrm', COUNT(*) FROM public.vendas_cvcrm
UNION ALL SELECT 'vendas_lotear', COUNT(*) FROM public.vendas_lotear
UNION ALL SELECT 'estoque_cvcrm', COUNT(*) FROM public.estoque_cvcrm
UNION ALL SELECT 'estoque_lotear', COUNT(*) FROM public.estoque_lotear
UNION ALL SELECT 'tabela_de_preco_cvcrm', COUNT(*) FROM public.tabela_de_preco_cvcrm
UNION ALL SELECT 'tabela_de_preco_lotear', COUNT(*) FROM public.tabela_de_preco_lotear
UNION ALL SELECT 'distratos_cvcrm', COUNT(*) FROM public.distratos_cvcrm
UNION ALL SELECT 'distratos_lotear', COUNT(*) FROM public.distratos_lotear
UNION ALL SELECT 'TB_HIST_LEADS', COUNT(*) FROM public."TB_HIST_LEADS"
UNION ALL SELECT 'TB_LEADS', COUNT(*) FROM public."TB_LEADS"
UNION ALL SELECT 'TB_PRECADASTROS', COUNT(*) FROM public."TB_PRECADASTROS"
UNION ALL SELECT 'TB_PRECADASTROS_LOT', COUNT(*) FROM public."TB_PRECADASTROS_LOT";
```

Compare os totais com o retorno do job e com consultas equivalentes no BigQuery.

## 8. Troubleshooting

Erro `bigquery.jobs.create`:

- a service account autenticou, mas nao tem permissao para criar jobs no projeto;
- conceda `BigQuery Job User` no projeto configurado em `GOOGLE_CLOUD_PROJECT_ID`.

Erro de leitura de tabela/view:

- conceda `BigQuery Data Viewer` no dataset `BIGQUERY_DATASET`;
- confirme se a tabela/view existe no dataset configurado.

Erro no `GOOGLE_APPLICATION_CREDENTIALS_BASE64`:

- gere o JSON da service account;
- converta o JSON completo para base64;
- reinicie o backend depois de alterar o `.env`.
