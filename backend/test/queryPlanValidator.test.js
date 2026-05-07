require('dotenv').config();

const assert = require('node:assert/strict');
const { validateQueryPlan } = require('../src/services/queryPlanValidator');

function run() {
  const schemaProfile = {
    tables: [
      {
        table: 'vw_Vendas_Consolidada',
        available: true,
        columns: [
          { name: 'empreendimento' },
          { name: 'Valor_VGV_Correto' },
          { name: 'bloco' },
          { name: 'unidade' },
          { name: 'cliente' },
        ],
      },
    ],
  };
  const fallbackPlan = {
    planId: 'not_answerable',
    requiredPermissions: [],
    missingFields: [],
    confidence: 0.4,
    executionSpec: { message: 'fallback', filters: {} },
  };

  const validated = validateQueryPlan({
    planId: 'semantic_aggregate',
    confidence: 0.82,
    executionSpec: {
      tables: ['vw_Vendas_Consolidada'],
      groupBy: ['empreendimento'],
      metric: { function: 'sum', column: 'Valor_VGV_Correto' },
      order: { by: 'metric', direction: 'asc' },
      limit: 3,
    },
  }, schemaProfile, fallbackPlan);

  assert.equal(validated.ok, true);
  assert.equal(validated.plan.planId, 'semantic_aggregate');
  assert.ok(validated.plan.requiredPermissions.includes('view_reservas'));
  assert.equal(validated.plan.executionSpec.limit, 3);

  const rejected = validateQueryPlan({
    planId: 'semantic_aggregate',
    executionSpec: {
      tables: ['vw_Vendas_Consolidada'],
      groupBy: ['coluna_inexistente'],
      metric: { function: 'sum', column: 'Valor_VGV_Correto' },
    },
  }, schemaProfile, fallbackPlan);

  assert.equal(rejected.ok, false);
  assert.equal(rejected.plan.planId, 'not_answerable');
}

run();
console.log('queryPlanValidator tests passed');
