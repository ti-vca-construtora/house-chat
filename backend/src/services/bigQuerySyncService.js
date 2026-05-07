const supabase = require('../database/supabase');
const bigQuery = require('./bigQueryClient');

const UPSERT_CHUNK_SIZE = 500;
const CONSOLIDATED_SALES_TABLE = 'vw_Vendas_Consolidada';

function getDatasetRef(table) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const dataset = process.env.BIGQUERY_DATASET;
  if (!projectId || !dataset) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID e BIGQUERY_DATASET sao obrigatorios para sincronizacao BigQuery');
  }
  return `\`${projectId}.${dataset}.${table}\``;
}

const TABLES = [
  {
    key: CONSOLIDATED_SALES_TABLE,
    label: 'Vendas Consolidada',
    supabaseTable: CONSOLIDATED_SALES_TABLE,
    replace: true,
    truncateFilterColumn: null,
    query: () => `SELECT * FROM ${getDatasetRef(CONSOLIDATED_SALES_TABLE)}`,
  },
];

function getPlan(scope) {
  if (!scope || scope === 'all') {
    return TABLES;
  }

  if (scope.startsWith('table:')) {
    const tableKey = scope.slice('table:'.length);
    return TABLES.filter((table) => table.key === tableKey);
  }

  return TABLES;
}

function getPlanTableDefinitions(plan) {
  return plan.map((table) => [table.key, table.label]);
}

function getConflictKey(row, conflict) {
  return conflict
    .split(',')
    .map((column) => {
      const value = row[column.trim()];
      return value == null ? '' : String(value);
    })
    .join('\u001f');
}

function dedupeRowsForConflict(rows, conflict) {
  if (!conflict) {
    return rows;
  }

  const byKey = new Map();
  for (const row of rows) {
    byKey.set(getConflictKey(row, conflict), row);
  }

  return Array.from(byKey.values());
}

async function getDeleteFilterColumn(table, rows) {
  if (table.truncateFilterColumn) {
    return table.truncateFilterColumn;
  }

  const firstRow = rows.find((row) => row && Object.keys(row).length > 0);
  if (firstRow) {
    return Object.keys(firstRow)[0];
  }

  const metadata = await bigQuery.getTableMetadata(table.key);
  return metadata.schema?.fields?.[0]?.name || null;
}

async function deleteExistingRows(tableName, filterColumn) {
  if (!filterColumn) {
    return;
  }

  const { error } = await supabase
    .from(tableName)
    .delete()
    .or(`${filterColumn}.is.null,${filterColumn}.not.is.null`);
  if (error) {
    throw new Error(`Erro ao limpar ${tableName}: ${error.message}`);
  }
}

async function writeRows(table, rows, progress) {
  const rowsToWrite = table.replace ? rows : dedupeRowsForConflict(rows, table.conflict);
  const duplicateCount = rows.length - rowsToWrite.length;

  if (table.replace) {
    progress?.(table.key, { message: `Limpando ${table.label} antes da carga...` });
    await deleteExistingRows(table.supabaseTable, await getDeleteFilterColumn(table, rowsToWrite));
  } else if (duplicateCount > 0) {
    progress?.(table.key, {
      message: `${table.label}: ${duplicateCount} duplicidade(s) removida(s) antes do upsert.`,
    });
  }

  let written = 0;
  for (let index = 0; index < rowsToWrite.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rowsToWrite.slice(index, index + UPSERT_CHUNK_SIZE);
    const query = supabase.from(table.supabaseTable);
    const { data, error } = table.replace
      ? await query.insert(chunk).select('id')
      : await query.upsert(chunk, { onConflict: table.conflict }).select();

    if (error) {
      throw new Error(`Erro ao salvar ${table.supabaseTable}: ${error.message}`);
    }

    written += data?.length || chunk.length;
    progress?.(table.key, {
      updatedRecords: written,
      completedPages: Math.ceil((index + chunk.length) / UPSERT_CHUNK_SIZE),
      progressPercent: rowsToWrite.length === 0 ? 100 : Math.round(((index + chunk.length) / rowsToWrite.length) * 100),
      message: `${table.label}: ${written}/${rowsToWrite.length} registros gravados.`,
    });
  }

  return written;
}

async function syncTable(table, progress) {
  const startedAt = Date.now();
  progress?.(table.key, {
    status: 'running',
    startedAt: new Date(startedAt).toISOString(),
    totalPages: 0,
    completedPages: 0,
    progressPercent: 0,
    message: `Consultando BigQuery para ${table.label}...`,
  });

  const queriedRows = await bigQuery.queryRows(table.query());
  const rows = table.transformRows ? table.transformRows(queriedRows) : queriedRows;
  const totalPages = Math.max(1, Math.ceil(rows.length / UPSERT_CHUNK_SIZE));
  progress?.(table.key, {
    totalPages,
    totalRegistrosCvcrm: rows.length,
    message: `${rows.length} registros retornados do BigQuery para ${table.label}.`,
  });

  const updatedRecords = await writeRows(table, rows, progress);

  progress?.(table.key, {
    status: 'completed',
    completedPages: totalPages,
    progressPercent: 100,
    estimatedRemainingMs: 0,
    updatedRecords,
    completedAt: new Date().toISOString(),
    message: `${table.label} sincronizado via BigQuery.`,
  });

  return {
    table: table.key,
    updatedRecords,
    totalPages,
    completedPages: totalPages,
    totalRegistrosCvcrm: rows.length,
  };
}

async function syncScoped(scope, mode, progress) {
  const plan = getPlan(scope);
  const tables = {};
  let totalUpdatedRecords = 0;

  for (const table of plan) {
    try {
      const result = await syncTable(table, progress);
      tables[table.key] = result;
      totalUpdatedRecords += result.updatedRecords;
    } catch (error) {
      progress?.(table.key, {
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString(),
        message: `Falha ao sincronizar ${table.label}.`,
      });
      throw error;
    }
  }

  return {
    mode: mode === 'partial' ? 'partial' : 'total',
    scope: scope || 'all',
    tables,
    totalUpdatedRecords,
  };
}

module.exports = {
  syncScoped,
  getPlan,
  getPlanTableDefinitions,
  TABLES,
};
