require('dotenv').config();

const assert = require('node:assert/strict');
const { validateQueryPlan } = require('../src/services/queryPlanValidator');

function run() {
  const schemaProfile = {
    tables: [
      {
        table: 'tabela_de_preco_cvcrm',
        available: true,
        columns: [
          { name: 'empreendimento' },
          { name: 'valor_total' },
          { name: 'bloco' },
          { name: 'unidade' },
          { name: 'tabela' },
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
    planId: 'price_by_project',
    confidence: 0.82,
    executionSpec: {
      tables: ['tabela_de_preco_cvcrm'],
      groupBy: ['empreendimento'],
      metric: { function: 'avg', column: 'valor_total' },
      order: { by: 'metric', direction: 'asc' },
      limit: 3,
    },
  }, schemaProfile, fallbackPlan);

  assert.equal(validated.ok, true);
  assert.equal(validated.plan.planId, 'semantic_aggregate');
  assert.deepEqual(validated.plan.requiredPermissions, ['view_tabela_preco']);
  assert.equal(validated.plan.executionSpec.limit, 3);

  const rejected = validateQueryPlan({
    planId: 'semantic_aggregate',
    executionSpec: {
      tables: ['tabela_de_preco_cvcrm'],
      groupBy: ['coluna_inexistente'],
      metric: { function: 'avg', column: 'valor_total' },
    },
  }, schemaProfile, fallbackPlan);

  assert.equal(rejected.ok, false);
  assert.equal(rejected.plan.planId, 'not_answerable');
}

run();
console.log('queryPlanValidator tests passed');
