require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bigQuery = require('../src/services/bigQueryClient');

const SOURCE_VIEW = 'vw_Vendas_Consolidada';
const OUTPUT_PATH = path.resolve(__dirname, '../../supabase/vw_vendas_consolidada_schema.sql');

function quoteIdent(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function mapBigQueryTypeToPostgres(field) {
  if (field.mode === 'REPEATED') {
    return 'JSONB';
  }

  switch (field.type) {
    case 'STRING':
      return 'TEXT';
    case 'BYTES':
      return 'BYTEA';
    case 'INTEGER':
    case 'INT64':
      return 'BIGINT';
    case 'FLOAT':
    case 'FLOAT64':
      return 'DOUBLE PRECISION';
    case 'NUMERIC':
    case 'BIGNUMERIC':
      return 'NUMERIC';
    case 'BOOLEAN':
    case 'BOOL':
      return 'BOOLEAN';
    case 'TIMESTAMP':
      return 'TIMESTAMPTZ';
    case 'DATE':
      return 'DATE';
    case 'TIME':
      return 'TIME';
    case 'DATETIME':
      return 'TIMESTAMP';
    case 'JSON':
      return 'JSONB';
    case 'GEOGRAPHY':
      return 'TEXT';
    case 'RECORD':
    case 'STRUCT':
      return 'JSONB';
    default:
      return 'TEXT';
  }
}

function renderColumn(field) {
  const nullable = field.mode === 'REQUIRED' ? ' NOT NULL' : '';
  return `  ${quoteIdent(field.name)} ${mapBigQueryTypeToPostgres(field)}${nullable}`;
}

function renderSchemaSql(metadata) {
  const fields = metadata.schema?.fields || [];
  if (fields.length === 0) {
    throw new Error(`A view ${SOURCE_VIEW} nao retornou colunas no metadata do BigQuery`);
  }

  return [
    '-- Generated from BigQuery metadata.',
    `-- Source: ${metadata.tableReference.projectId}.${metadata.tableReference.datasetId}.${metadata.tableReference.tableId}`,
    '-- This file intentionally creates only vw_Vendas_Consolidada.',
    '',
    `DROP TABLE IF EXISTS public.${quoteIdent(SOURCE_VIEW)};`,
    '',
    `CREATE TABLE public.${quoteIdent(SOURCE_VIEW)} (`,
    fields.map(renderColumn).join(',\n'),
    ');',
    '',
    `ALTER TABLE public.${quoteIdent(SOURCE_VIEW)} DISABLE ROW LEVEL SECURITY;`,
    '',
  ].join('\n');
}

async function main() {
  const metadata = await bigQuery.getTableMetadata(SOURCE_VIEW);
  const sql = renderSchemaSql(metadata);

  fs.writeFileSync(OUTPUT_PATH, sql, 'utf8');
  console.log(`Schema gerado em ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
