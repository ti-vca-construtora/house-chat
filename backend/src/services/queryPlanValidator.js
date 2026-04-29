const { BUSINESS_CATALOG } = require('./businessCatalog');
const { getAllowedTableColumns } = require('./schemaProfiler');
const { normalizeText } = require('./queryPlanner');

const ALLOWED_PLAN_IDS = new Set([
  'action_not_supported',
  'cheapest_unit_by_typology',
  'cheapest_projects_by_price',
  'stock_by_project',
  'price_by_project',
  'sales_by_project',
  'cancellations_by_project',
  'leads_summary',
  'precadastros_summary',
  'general_commercial_overview',
  'semantic_aggregate',
  'not_answerable',
]);

const ALLOWED_OPERATORS = new Set(['eq', 'neq', 'contains', 'gte', 'lte', 'gt', 'lt', 'in']);
const ALLOWED_METRICS = new Set(['count', 'min', 'max', 'avg', 'sum']);

function collectTablePermissions(tables = []) {
  const permissions = new Set();
  const concepts = BUSINESS_CATALOG.concepts;

  for (const table of tables) {
    for (const [conceptKey, concept] of Object.entries(concepts)) {
      if (concept.tables.includes(table)) {
        const permissionKey = conceptKey === 'preco' ? 'tabela_preco' : conceptKey;
        (BUSINESS_CATALOG.permissions[permissionKey] || []).forEach((permission) => permissions.add(permission));
      }
    }
  }

  return Array.from(permissions);
}

function reject(reason, fallbackPlan) {
  return {
    ok: false,
    reason,
    plan: fallbackPlan,
  };
}

function validateSemanticAggregate(plan, schemaProfile, fallbackPlan) {
  const allowedColumns = getAllowedTableColumns(schemaProfile);
  const spec = plan.executionSpec || {};
  const tables = Array.isArray(spec.tables) ? spec.tables : [];

  if (tables.length === 0 || tables.length > 3) {
    return reject('Plano sem tabela valida ou com tabelas demais.', fallbackPlan);
  }

  for (const table of tables) {
    if (!allowedColumns[table]) {
      return reject(`Tabela nao permitida ou indisponivel: ${table}.`, fallbackPlan);
    }
  }

  const usesColumn = (column) => tables.some((table) => allowedColumns[table].has(column));
  const groupBy = Array.isArray(spec.groupBy) ? spec.groupBy : [];
  for (const column of groupBy) {
    if (!usesColumn(column)) return reject(`Coluna de agrupamento invalida: ${column}.`, fallbackPlan);
  }

  const metric = spec.metric || {};
  if (!ALLOWED_METRICS.has(metric.function)) {
    return reject(`Metrica invalida: ${metric.function}.`, fallbackPlan);
  }
  if (metric.function !== 'count' && !usesColumn(metric.column)) {
    return reject(`Coluna de metrica invalida: ${metric.column}.`, fallbackPlan);
  }

  const filters = Array.isArray(spec.filters) ? spec.filters : [];
  for (const filter of filters) {
    if (!usesColumn(filter.column)) return reject(`Coluna de filtro invalida: ${filter.column}.`, fallbackPlan);
    if (!ALLOWED_OPERATORS.has(filter.operator)) return reject(`Operador invalido: ${filter.operator}.`, fallbackPlan);
  }

  const excludeTerms = Array.isArray(spec.excludeTerms) ? spec.excludeTerms : [];
  for (const exclusion of excludeTerms) {
    const columns = Array.isArray(exclusion.columns) ? exclusion.columns : [];
    for (const column of columns) {
      if (!usesColumn(column)) return reject(`Coluna de exclusao invalida: ${column}.`, fallbackPlan);
    }
  }

  const limit = Math.min(Math.max(Number(spec.limit) || 20, 1), 50);
  const requiredPermissions = collectTablePermissions(tables);

  return {
    ok: true,
    plan: {
      ...plan,
      planId: 'semantic_aggregate',
      confidence: Math.min(Math.max(Number(plan.confidence) || 0.72, 0.5), 0.96),
      requiredPermissions,
      missingFields: [],
      executionSpec: {
        ...spec,
        limit,
        message: spec.message || plan.executionSpec?.message || '',
      },
    },
  };
}

function validateQueryPlan(plan, schemaProfile, fallbackPlan) {
  if (!plan || typeof plan !== 'object') {
    return reject('Plano vazio ou invalido.', fallbackPlan);
  }

  if (
    plan.executionSpec
    && (Array.isArray(plan.executionSpec.tables)
      || Array.isArray(plan.executionSpec.groupBy)
      || plan.executionSpec.metric)
  ) {
    return validateSemanticAggregate({ ...plan, planId: 'semantic_aggregate' }, schemaProfile, fallbackPlan);
  }

  if (!ALLOWED_PLAN_IDS.has(plan.planId)) {
    return reject(`PlanId nao permitido: ${plan.planId}.`, fallbackPlan);
  }

  if (plan.planId !== 'semantic_aggregate') {
    return {
      ok: true,
      plan,
    };
  }

  return validateSemanticAggregate(plan, schemaProfile, fallbackPlan);
}

function parseBaseFromMessage(message) {
  const normalized = normalizeText(message);
  if (/\bbase\s+vca\b|\bvca\b|\bcvcrm\b/.test(normalized)) return 'vca';
  if (/\bbase\s+lotear\b|\blotear\b/.test(normalized)) return 'lotear';
  return null;
}

module.exports = {
  validateQueryPlan,
  parseBaseFromMessage,
};
