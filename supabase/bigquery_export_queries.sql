-- Optional BigQuery CSV export for the single view in scope.
-- Prefer the backend sync when loading directly into Supabase.

EXPORT DATA OPTIONS (
  uri = 'gs://YOUR_BUCKET/supabase-import/vw_Vendas_Consolidada/*.csv',
  format = 'CSV',
  overwrite = true,
  header = true,
  field_delimiter = ','
) AS
SELECT *
FROM `datawarehouse-492815.cv.vw_Vendas_Consolidada`;
