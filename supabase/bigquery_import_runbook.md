# Runbook: vw_Vendas_Consolidada BigQuery -> Supabase

Este fluxo cria e carrega somente `public."vw_Vendas_Consolidada"`.

## 1. Configurar credenciais

No `backend/.env`:

```env
SUPABASE_URL=https://SEU_PROJETO.supabase.co
SUPABASE_SERVICE_KEY=SUA_SERVICE_ROLE_KEY

GOOGLE_CLOUD_PROJECT_ID=datawarehouse-492815
BIGQUERY_DATASET=cv
GOOGLE_APPLICATION_CREDENTIALS_BASE64=JSON_DA_SERVICE_ACCOUNT_EM_BASE64
```

## 2. Gerar o schema real da view

```powershell
cd backend
npm run generate:vendas-consolidada-schema
```

Isso consulta o metadata da `vw_Vendas_Consolidada` no BigQuery e gera:

```text
supabase/vw_vendas_consolidada_schema.sql
```

O arquivo preserva nomes e ordem das colunas da view. Tipos BigQuery sao mapeados para equivalentes Postgres/Supabase.

## 3. Criar a tabela no Supabase

Execute no SQL Editor do Supabase:

```sql
-- supabase/vw_vendas_consolidada_schema.sql
```

## 4. Sincronizar

Pela interface, use `Sincronizar Vendas Consolidada`.

Via API:

```powershell
$token = "JWT_DO_USUARIO_ADMIN"

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3001/api/sync/jobs" `
  -Headers @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" } `
  -Body '{"scope":"table:vw_Vendas_Consolidada","mode":"total"}'
```

## 5. Validar

```sql
SELECT COUNT(*) FROM public."vw_Vendas_Consolidada";
```
