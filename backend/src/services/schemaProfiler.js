const supabase = require('../database/supabase');
const fs = require('fs');
const path = require('path');
const { BUSINESS_CATALOG } = require('./businessCatalog');
const { normalizeText } = require('./queryPlanner');

const SAMPLE_LIMIT = 20;
const CACHE_TTL_MS = 15 * 60 * 1000;

let cachedProfile = null;
let cachedAt = 0;
let cachedStaticColumns = null;

function getKnownTables() {
  return [...new Set(
    Object.values(BUSINESS_CATALOG.concepts)
      .flatMap((concept) => concept.tables)
  )];
}

function inferColumnRole(column, values) {
  const normalized = normalizeText(column);
  const numericValues = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (/valor|preco|price|total/.test(normalized)) return 'money';
  if (/data|created|updated|date/.test(normalized)) return 'date';
  if (/id|codigo|numero/.test(normalized)) return 'identifier';
  if (/empreendimento|obra|projeto/.test(normalized)) return 'project';
  if (/unidade|bloco|quadra|lote|apto|apart/.test(normalized)) return 'unit';
  if (/situacao|status|tipo/.test(normalized)) return 'status';
  if (/tipologia|quarto|suite|pavimento/.test(normalized)) return 'typology';
  if (numericValues.length > Math.max(1, values.length / 2)) return 'number';
  return 'text';
}

function compactValue(value) {
  if (value == null) return value;
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : value;
}

function getStaticSchemaColumns() {
  if (cachedStaticColumns) return cachedStaticColumns;

  cachedStaticColumns = {};
  const schemaPath = path.join(__dirname, '..', '..', '..', 'supabase', 'vw_vendas_consolidada_schema.sql');
  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    const match = sql.match(/CREATE\s+TABLE\s+public\."vw_Vendas_Consolidada"\s*\(([\s\S]*?)\n\);/i);
    if (match) {
      cachedStaticColumns.vw_Vendas_Consolidada = [...match[1].matchAll(/^\s+"([^"]+)"\s+/gm)]
        .map((columnMatch) => columnMatch[1]);
    }
  } catch {
    cachedStaticColumns.vw_Vendas_Consolidada = [];
  }

  return cachedStaticColumns;
}

function buildColumnProfile(name, rows) {
  const values = rows
    .map((row) => row[name])
    .filter((value) => value != null && value !== '')
    .slice(0, 6);

  return {
    name,
    role: inferColumnRole(name, values),
    examples: [...new Set(values.map(compactValue))].slice(0, 4),
    nullish_in_sample: rows.filter((row) => row[name] == null || row[name] === '').length,
  };
}

async function profileTable(tableName) {
  const { data, error, count } = await supabase
    .from(tableName)
    .select('*', { count: 'estimated' })
    .limit(SAMPLE_LIMIT);

  if (error) {
    return {
      table: tableName,
      available: false,
      error: error.message,
      columns: [],
    };
  }

  const rows = data || [];
  const staticColumns = getStaticSchemaColumns()[tableName] || [];
  const columnNames = [...new Set([
    ...staticColumns,
    ...rows.flatMap((row) => Object.keys(row)),
  ])];
  const columns = columnNames.map((name) => buildColumnProfile(name, rows));

  return {
    table: tableName,
    available: true,
    estimated_rows: count ?? null,
    columns,
  };
}

async function getSchemaProfile({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && cachedProfile && now - cachedAt < CACHE_TTL_MS) {
    return cachedProfile;
  }

  const profiles = await Promise.all(getKnownTables().map(profileTable));
  cachedProfile = {
    generated_at: new Date().toISOString(),
    tables: profiles,
    relationships: BUSINESS_CATALOG.relationships,
  };
  cachedAt = now;
  return cachedProfile;
}

function getAllowedTableColumns(schemaProfile) {
  const map = {};
  for (const table of schemaProfile.tables || []) {
    if (!table.available) continue;
    map[table.table] = new Set((table.columns || []).map((column) => column.name));
  }
  return map;
}

module.exports = {
  getSchemaProfile,
  getAllowedTableColumns,
  getKnownTables,
};
