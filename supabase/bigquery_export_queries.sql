-- BigQuery export queries for loading datawarehouse-492815.cv into Supabase.
-- Replace gs://YOUR_BUCKET/supabase-import with your Cloud Storage bucket/prefix.
-- BigQuery writes one or more CSV shards per EXPORT DATA statement.

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/empreendimentos_cvcrm/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  idempreendimento AS id_empreendimento,
  nome,
  CAST(NULL AS STRING) AS endereco,
  cidade,
  estado,
  data_entrega,
  CAST(NULL AS STRING) AS situacao_obra,
  0 AS quantidade_unidades_disponiveis,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.TB_EMPREENDIMENTOS`
WHERE idempreendimento IS NOT NULL
  AND nome IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/empreendimentos_lotear/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  idempreendimento AS id_empreendimento,
  nome,
  CAST(NULL AS STRING) AS endereco,
  cidade,
  estado,
  data_entrega,
  CAST(NULL AS STRING) AS situacao_obra,
  0 AS quantidade_unidades_disponiveis,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.TB_EMPREENDIMENTOS_LOT`
WHERE idempreendimento IS NOT NULL
  AND nome IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/vendas_cvcrm/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  CAST(referencia AS STRING) AS numero_reserva,
  CAST(tipoVenda AS STRING) AS tipo_de_venda,
  empreendimento,
  unidade,
  cliente AS titular_nome,
  CAST(NULL AS STRING) AS documento_cliente,
  corretor,
  imobiliaria,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.vw_Vendas`
WHERE referencia IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/vendas_lotear/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  CAST(referencia AS STRING) AS numero_reserva,
  CAST(tipoVenda AS STRING) AS tipo_de_venda,
  empreendimento,
  unidade,
  cliente AS titular_nome,
  CAST(NULL AS STRING) AS documento_cliente,
  corretor,
  imobiliaria,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.TB_VENDAS_LOT`
WHERE referencia IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/estoque_cvcrm/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  referencia AS idunidade,
  idEmpreendimento AS idempreendimento,
  nomeEmpreendimento AS nome_empreendimento,
  CAST(NULL AS STRING) AS tipo_empreendimento,
  etapa,
  bloco,
  unidade,
  CAST(NULL AS FLOAT64) AS area_privativa,
  CAST(tipologia AS STRING) AS tipologia,
  CAST(NULL AS STRING) AS vagas_garagem,
  CAST(NULL AS INT64) AS situacao_mapa_disponibilidade,
  statusUnidade AS situacao,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.vw_EstoqueVendas`
WHERE referencia IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/estoque_lotear/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  referencia AS idunidade,
  idEmpreendimento AS idempreendimento,
  nomeEmpreendimento AS nome_empreendimento,
  CAST(NULL AS STRING) AS tipo_empreendimento,
  etapa,
  bloco,
  unidade,
  CAST(NULL AS FLOAT64) AS area_privativa,
  CAST(tipologia AS STRING) AS tipologia,
  CAST(NULL AS STRING) AS vagas_garagem,
  CAST(NULL AS INT64) AS situacao_mapa_disponibilidade,
  statusUnidade AS situacao,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.vw_EstoqueVendas_LOT`
WHERE referencia IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/tabela_de_preco_cvcrm/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  idtabela,
  SAFE_CAST(idempreendimento AS INT64) AS idempreendimento,
  CAST(NULL AS INT64) AS idunidade,
  empreendimento,
  tabela,
  COALESCE(bloco, '') AS bloco,
  unidade,
  SAFE_CAST(REPLACE(area_privativa, ',', '.') AS FLOAT64) AS area_privativa,
  valor_total,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.TB_PRECOS`
WHERE idtabela IS NOT NULL
  AND SAFE_CAST(idempreendimento AS INT64) IS NOT NULL
  AND unidade IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/tabela_de_preco_lotear/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  idtabela,
  SAFE_CAST(idempreendimento AS INT64) AS idempreendimento,
  CAST(NULL AS INT64) AS idunidade,
  empreendimento,
  tabela,
  COALESCE(bloco, '') AS bloco,
  unidade,
  SAFE_CAST(REPLACE(area_privativa, ',', '.') AS FLOAT64) AS area_privativa,
  valor_total,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.TB_PRECOS_LOT`
WHERE idtabela IS NOT NULL
  AND SAFE_CAST(idempreendimento AS INT64) IS NOT NULL
  AND unidade IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/distratos_cvcrm/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  referencia AS id_distrato,
  SAFE_CAST(referencia AS INT64) AS id_reserva,
  situacaoAtual AS situacao_atual,
  empreendimento,
  CAST(NULL AS STRING) AS etapa,
  bloco,
  unidade,
  CAST(NULL AS STRING) AS corretor,
  CAST(NULL AS STRING) AS imobiliaria,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.vw_DistratosStatus`
WHERE StatusDistrato = 'OK'
  AND referencia IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/distratos_lotear/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT
  referencia AS id_distrato,
  SAFE_CAST(referencia AS INT64) AS id_reserva,
  situacaoAtual AS situacao_atual,
  empreendimento,
  CAST(NULL AS STRING) AS etapa,
  bloco,
  unidade,
  CAST(NULL AS STRING) AS corretor,
  CAST(NULL AS STRING) AS imobiliaria,
  CURRENT_TIMESTAMP() AS synced_at
FROM `datawarehouse-492815.cv.vw_DistratosStatus_LOT`
WHERE StatusDistrato = 'OK'
  AND referencia IS NOT NULL;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/TB_HIST_LEADS/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT * FROM `datawarehouse-492815.cv.TB_HIST_LEADS`;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/TB_LEADS/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT * FROM `datawarehouse-492815.cv.TB_LEADS`;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/TB_PRECADASTROS/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT * FROM `datawarehouse-492815.cv.TB_PRECADASTROS`;

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/TB_PRECADASTROS_LOT/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT * FROM `datawarehouse-492815.cv.TB_PRECADASTROS_LOT`;
