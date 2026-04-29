const assert = require('node:assert/strict');
const { planQuery, normalizeText } = require('../src/services/queryPlanner');

function run() {
  assert.equal(
    normalizeText('2 QUARTOS SENDO UMA SUÍTE - TÉRREO'),
    '2 quartos sendo uma suite - terreo'
  );

  const cheapestPlan = planQuery({
    message: 'Qual a unidade mais barata no Uni Ville na tipologia 2 quartos com suíte no térreo?',
    userRole: 'corretor',
    intents: ['estoque', 'tabela_preco'],
    entities: {
      empreendimento: 'Uni Ville',
      tipologia: '2 quartos com suíte',
      pavimento: 'térreo',
      tipologia_terms: ['2 quarto', 'suite', 'terreo'],
    },
  });
  assert.equal(cheapestPlan.planId, 'cheapest_unit_by_typology');
  assert.deepEqual(cheapestPlan.missingFields, []);
  assert.ok(cheapestPlan.requiredPermissions.includes('view_empreendimentos'));
  assert.ok(cheapestPlan.requiredPermissions.includes('view_tabela_preco'));

  const cheapestProjectsPlan = planQuery({
    message: 'Faça um top 5 dos empreendimentos mais baratos da base VCA para mim.',
    userRole: 'corretor',
    intents: ['tabela_preco', 'empreendimentos'],
    entities: {},
  });
  assert.equal(cheapestProjectsPlan.planId, 'cheapest_projects_by_price');
  assert.equal(cheapestProjectsPlan.executionSpec.filters.limit, 5);
  assert.equal(cheapestProjectsPlan.executionSpec.filters.base, 'vca');
  assert.ok(cheapestProjectsPlan.requiredPermissions.includes('view_tabela_preco'));

  const cheapestByBasePlan = planQuery({
    message: 'Qual o empreendimento com valor de unidade mais baixo de cada base: VCA e LOTEAR',
    userRole: 'corretor',
    intents: ['tabela_preco', 'empreendimentos'],
    entities: {},
  });
  assert.equal(cheapestByBasePlan.planId, 'cheapest_project_by_base');
  assert.equal(cheapestByBasePlan.confidence, 0.96);
  assert.ok(cheapestByBasePlan.requiredPermissions.includes('view_tabela_preco'));

  const missingProjectPlan = planQuery({
    message: 'Qual a unidade mais barata na tipologia 2 quartos com suíte no térreo?',
    userRole: 'corretor',
    intents: ['estoque', 'tabela_preco'],
    entities: {
      tipologia: '2 quartos com suíte',
      pavimento: 'térreo',
      tipologia_terms: ['2 quarto', 'suite', 'terreo'],
    },
  });
  assert.equal(missingProjectPlan.planId, 'cheapest_unit_by_typology');
  assert.deepEqual(missingProjectPlan.missingFields, ['empreendimento']);

  const blockedActionPlan = planQuery({
    message: 'Bloqueia essa unidade para mim',
    userRole: 'corretor',
    intents: ['estoque'],
    entities: {},
  });
  assert.equal(blockedActionPlan.planId, 'action_not_supported');
  assert.deepEqual(blockedActionPlan.requiredPermissions, []);

  assert.equal(planQuery({
    message: 'Quantas vendas tem no Uni Ville?',
    intents: ['reservas'],
    entities: { empreendimento: 'Uni Ville' },
  }).planId, 'sales_by_project');

  assert.equal(planQuery({
    message: 'Quantos distratos tem no Campus Vivant?',
    intents: ['distratos'],
    entities: { empreendimento: 'Campus Vivant' },
  }).planId, 'cancellations_by_project');

  const compositePlan = planQuery({
    message: `Diga pra mim qual é:
O empreendimento com mais vendas na base VCA
A unidade mais barata do empreendimento MAUNAKAI BEACH TOWER
A tipologia da unidade BL52 - APT 102 do UNI VILLE RESIDENCIAL
O empreendimento com mais distratos na base VCA
O empreendimento com mais unidades na base Lotear`,
    userRole: 'admin',
    intents: [],
    entities: {},
  });
  assert.equal(compositePlan.planId, 'composite_query');
  assert.deepEqual(
    compositePlan.executionSpec.subPlans.map((plan) => plan.planId),
    ['sales_by_project', 'price_by_project', 'unit_typology_lookup', 'cancellations_by_project', 'stock_by_project']
  );
  assert.equal(compositePlan.executionSpec.subPlans[1].executionSpec.filters.empreendimento, 'MAUNAKAI BEACH TOWER');
  assert.equal(compositePlan.executionSpec.subPlans[2].executionSpec.filters.empreendimento, 'UNI VILLE RESIDENCIAL');
  assert.equal(compositePlan.executionSpec.subPlans[4].executionSpec.filters.base, 'lotear');

  const unitDetailsPlan = planQuery({
    message: 'Me traga detalhes da unidade BL52 - APT 102 do UNI VILLE RESIDENCIAL',
    userRole: 'corretor',
    intents: ['estoque'],
    entities: {},
  });
  assert.equal(unitDetailsPlan.planId, 'unit_typology_lookup');
  assert.equal(unitDetailsPlan.executionSpec.filters.unidade, 'BL52 - APT 102');
  assert.equal(unitDetailsPlan.executionSpec.filters.empreendimento, 'UNI VILLE RESIDENCIAL');
}

run();
console.log('queryPlanner tests passed');
