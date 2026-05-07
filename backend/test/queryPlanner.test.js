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
  const salesPlan = planQuery({
    message: 'Quantas vendas tem no Uni Ville?',
    intents: ['reservas'],
    entities: { empreendimento: 'Uni Ville' },
  });
  assert.equal(salesPlan.planId, 'sales_by_project');
  assert.ok(salesPlan.requiredPermissions.includes('view_reservas'));

  const salesByFontePlan = planQuery({
    message: 'quantas vendas na base VCA nos temos hoje?',
    intents: ['reservas'],
    entities: {},
  });
  assert.equal(salesByFontePlan.planId, 'sales_by_project');
  assert.equal(salesByFontePlan.executionSpec.filters.base, 'vca');
  assert.equal(salesByFontePlan.executionSpec.filters.empreendimento, undefined);

  const salesByFonteWithBadProjectPlan = planQuery({
    message: 'quantas vendas na base VCA nos temos hoje?',
    intents: ['reservas'],
    entities: { empreendimento: 'Base Vca Nos Temos Hoje' },
  });
  assert.equal(salesByFonteWithBadProjectPlan.planId, 'sales_by_project');
  assert.equal(salesByFonteWithBadProjectPlan.executionSpec.filters.base, 'vca');
  assert.equal(salesByFonteWithBadProjectPlan.executionSpec.filters.empreendimento, undefined);

  const salesByBlockWithContextPlan = planQuery({
    message: 'Quantidade de vendas no bloco 16',
    intents: ['reservas'],
    entities: {},
    conversationHistory: [
      { role: 'user', content: 'Quantas vendas do empreendimento UNI VILLE?' },
      { role: 'assistant', content: 'No empreendimento UNI VILLE, temos 437 vendas.' },
    ],
  });
  assert.equal(salesByBlockWithContextPlan.planId, 'sales_by_project');
  assert.equal(salesByBlockWithContextPlan.executionSpec.filters.empreendimento, 'UNI VILLE RESIDENCIAL');
  assert.equal(salesByBlockWithContextPlan.executionSpec.filters.bloco, '16');

  const salesByBlockWithBadProjectEntityPlan = planQuery({
    message: 'Quantas vendas temos do bloco 16?',
    intents: ['reservas'],
    entities: { empreendimento: 'Bloco 16' },
    conversationHistory: [
      { role: 'user', content: 'Quantas vendas temos no empreendimento UNI VILLE?' },
      { role: 'assistant', content: 'Boa. No empreendimento UNI VILLE RESIDENCIAL, temos 437 vendas.' },
    ],
  });
  assert.equal(salesByBlockWithBadProjectEntityPlan.planId, 'sales_by_project');
  assert.equal(salesByBlockWithBadProjectEntityPlan.executionSpec.filters.empreendimento, 'UNI VILLE RESIDENCIAL');
  assert.equal(salesByBlockWithBadProjectEntityPlan.executionSpec.filters.bloco, '16');

  const salesByBlockWithProjectContextDoesNotInheritOldBase = planQuery({
    message: 'Quantas vendas temos do bloco 16?',
    intents: ['reservas'],
    entities: { empreendimento: 'Bloco 16' },
    conversationHistory: [
      { role: 'user', content: 'e quantas vendas eu tenho atualmente na base VCA?' },
      { role: 'assistant', content: 'Boa. Na base VCA, temos 17958 vendas.' },
      { role: 'user', content: 'Quantas vendas temos no empreendimento UNI VILLE?' },
      { role: 'assistant', content: 'Boa. No empreendimento UNI VILLE RESIDENCIAL, temos 437 vendas.' },
    ],
  });
  assert.equal(salesByBlockWithProjectContextDoesNotInheritOldBase.executionSpec.filters.empreendimento, 'UNI VILLE RESIDENCIAL');
  assert.equal(salesByBlockWithProjectContextDoesNotInheritOldBase.executionSpec.filters.base, undefined);

  const purchasedUnitsAndClientsPlan = planQuery({
    message: 'Quais as unidades e qual o nome dos clientes que compraram?',
    intents: ['estoque', 'clientes'],
    entities: {},
    conversationHistory: [
      { role: 'user', content: 'Quantas vendas temos no empreendimento UNI VILLE?' },
      { role: 'assistant', content: 'Au au! Boa, vamos pra cima: No empreendimento UNI VILLE RESIDENCIAL, temos 437 vendas.' },
      { role: 'user', content: 'Quantas vendas temos do bloco 16?' },
      { role: 'assistant', content: 'Au au! Boa, vamos pra cima: No empreendimento UNI VILLE RESIDENCIAL, no bloco 16, temos 11 vendas.' },
    ],
  });
  assert.equal(purchasedUnitsAndClientsPlan.planId, 'sales_by_project');
  assert.equal(purchasedUnitsAndClientsPlan.executionSpec.filters.empreendimento, 'UNI VILLE RESIDENCIAL');
  assert.equal(purchasedUnitsAndClientsPlan.executionSpec.filters.bloco, '16');

  const onlyBlockFollowUpPlan = planQuery({
    message: 'só os do bloco 16',
    intents: ['geral'],
    entities: {},
    conversationHistory: [
      { role: 'user', content: 'Quantas vendas temos no empreendimento UNI VILLE?' },
      { role: 'assistant', content: 'Au au! Boa, vamos pra cima: No empreendimento UNI VILLE RESIDENCIAL, temos 437 vendas.' },
      { role: 'user', content: 'Quais as unidades e qual o nome dos clientes que compraram?' },
    ],
  });
  assert.equal(onlyBlockFollowUpPlan.planId, 'sales_by_project');
  assert.equal(onlyBlockFollowUpPlan.executionSpec.filters.empreendimento, 'UNI VILLE RESIDENCIAL');
  assert.equal(onlyBlockFollowUpPlan.executionSpec.filters.bloco, '16');
  assert.equal(onlyBlockFollowUpPlan.executionSpec.filters.buyerUnitList, true);

  const exactBuyerUnitQuestionPlan = planQuery({
    message: 'Quais as unidades e qual o nome dos clientes que compraram? só os do bloco 16.',
    intents: ['estoque', 'clientes'],
    entities: {},
    conversationHistory: [
      { role: 'user', content: 'Quantas vendas temos no empreendimento UNI VILLE?' },
      { role: 'assistant', content: 'Au au! Boa, vamos pra cima: No empreendimento UNI VILLE RESIDENCIAL, temos 437 vendas.' },
    ],
  });
  assert.equal(exactBuyerUnitQuestionPlan.planId, 'sales_by_project');
  assert.equal(exactBuyerUnitQuestionPlan.executionSpec.filters.empreendimento, 'UNI VILLE RESIDENCIAL');
  assert.equal(exactBuyerUnitQuestionPlan.executionSpec.filters.bloco, '16');
  assert.equal(exactBuyerUnitQuestionPlan.executionSpec.filters.buyerUnitList, true);

  const cancellationPlan = planQuery({
    message: 'Quantos distratos tem no Campus Vivant?',
    intents: ['distratos'],
    entities: { empreendimento: 'Campus Vivant' },
  });
  assert.equal(cancellationPlan.planId, 'cancellations_by_project');
  assert.ok(cancellationPlan.requiredPermissions.includes('view_reservas'));

  const topSellerPlan = planQuery({
    message: 'Qual corretor vendeu mais?',
    intents: [],
    entities: {},
  });
  assert.equal(topSellerPlan.planId, 'semantic_aggregate');
  assert.deepEqual(topSellerPlan.executionSpec.groupBy, ['corretor', 'imobiliaria']);
  assert.deepEqual(topSellerPlan.executionSpec.metric, { function: 'count' });

  const vgvPlan = planQuery({
    message: 'Qual empreendimento teve maior VGV?',
    intents: [],
    entities: {},
  });
  assert.equal(vgvPlan.planId, 'semantic_aggregate');
  assert.deepEqual(vgvPlan.executionSpec.tables, ['vw_Vendas_Consolidada']);
  assert.deepEqual(vgvPlan.executionSpec.groupBy, ['empreendimento']);
  assert.deepEqual(vgvPlan.executionSpec.metric, { function: 'sum', column: 'Valor_VGV_Correto' });
  assert.ok(vgvPlan.executionSpec.filters.some((filter) => filter.column === 'Status' && filter.operator === 'neq' && filter.value === 'INATIVO'));

  const activeVgvPlan = planQuery({
    message: 'Qual empreendimento teve maior VGV considerando somente vendas ativas?',
    intents: [],
    entities: {},
  });
  assert.equal(activeVgvPlan.planId, 'semantic_aggregate');
  assert.deepEqual(activeVgvPlan.executionSpec.tables, ['vw_Vendas_Consolidada']);
  assert.deepEqual(activeVgvPlan.executionSpec.groupBy, ['empreendimento']);
  assert.deepEqual(activeVgvPlan.executionSpec.metric, { function: 'sum', column: 'Valor_VGV_Correto' });
  assert.ok(activeVgvPlan.executionSpec.filters.some((filter) => filter.column === 'Status' && filter.operator === 'neq' && filter.value === 'INATIVO'));

  const projectVgvPlan = planQuery({
    message: 'Qual é o VGV do Dona Olivia atualmente?',
    intents: [],
    entities: {},
  });
  assert.equal(projectVgvPlan.planId, 'semantic_aggregate');
  assert.deepEqual(projectVgvPlan.executionSpec.metric, { function: 'sum', column: 'Valor_VGV_Correto' });
  assert.ok(projectVgvPlan.executionSpec.filters.some((filter) => filter.column === 'empreendimento' && filter.operator === 'contains' && filter.value === 'Dona Olivia'));
  assert.ok(projectVgvPlan.executionSpec.filters.some((filter) => filter.column === 'Status' && filter.operator === 'neq' && filter.value === 'INATIVO'));

  const allVgvPlan = planQuery({
    message: 'Qual o VGV incluindo distratadas e canceladas?',
    intents: [],
    entities: {},
  });
  assert.equal(allVgvPlan.planId, 'semantic_aggregate');
  assert.ok(!allVgvPlan.executionSpec.filters.some((filter) => filter.column === 'Status'));

  const cancellationReasonPlan = planQuery({
    message: 'Quais motivos de cancelamento mais aparecem?',
    intents: [],
    entities: {},
  });
  assert.equal(cancellationReasonPlan.planId, 'semantic_aggregate');
  assert.deepEqual(cancellationReasonPlan.executionSpec.tables, ['vw_Vendas_Consolidada']);
  assert.deepEqual(cancellationReasonPlan.executionSpec.groupBy, ['distrato_motivoDistrato']);
  assert.deepEqual(cancellationReasonPlan.executionSpec.filters, [{ column: 'Status', operator: 'eq', value: 'INATIVO' }]);

  const vgvDistratosFollowUpPlan = planQuery({
    message: 'Qual o valor de VGV total desses 65 distratos?',
    intents: ['reservas'],
    entities: {},
    conversationHistory: [
      { role: 'user', content: 'Quantos distratos temos no Dona Olivia Residencial?' },
      { role: 'assistant', content: 'Au au! O Dona Olivia Residencial tem 65 distratos.' },
    ],
  });
  assert.equal(vgvDistratosFollowUpPlan.planId, 'semantic_aggregate');
  assert.deepEqual(vgvDistratosFollowUpPlan.executionSpec.metric, { function: 'sum', column: 'Valor_VGV_Correto' });
  assert.ok(vgvDistratosFollowUpPlan.executionSpec.filters.some((filter) => filter.column === 'Status' && filter.operator === 'eq' && filter.value === 'INATIVO'));
  assert.ok(vgvDistratosFollowUpPlan.executionSpec.filters.some((filter) => filter.column === 'empreendimento' && filter.operator === 'contains' && filter.value === 'Dona Olivia Residencial'));

  const cancellationDateFollowUpPlan = planQuery({
    message: 'Quando foram esses distratos?',
    intents: ['reservas'],
    entities: {},
    conversationHistory: [
      { role: 'user', content: 'Quantos distratos temos no Dona Olivia Residencial?' },
    ],
  });
  assert.equal(cancellationDateFollowUpPlan.planId, 'semantic_aggregate');
  assert.deepEqual(cancellationDateFollowUpPlan.executionSpec.groupBy, ['distrato_dataCad']);
  assert.ok(cancellationDateFollowUpPlan.executionSpec.filters.some((filter) => filter.column === 'empreendimento' && filter.value === 'Dona Olivia Residencial'));

  const incomePlan = planQuery({
    message: 'Qual a renda media dos compradores?',
    intents: [],
    entities: {},
  });
  assert.equal(incomePlan.planId, 'semantic_aggregate');
  assert.deepEqual(incomePlan.executionSpec.metric, { function: 'avg', column: 'renda' });

  const saleTypePlan = planQuery({
    message: 'Qual tipo de venda mais aparece?',
    intents: [],
    entities: {},
  });
  assert.equal(saleTypePlan.planId, 'semantic_aggregate');
  assert.deepEqual(saleTypePlan.executionSpec.groupBy, ['tipoVenda']);

  const januarySalesPlan = planQuery({
    message: 'Vendas em janeiro de 2026',
    intents: ['reservas'],
    entities: {},
  });
  assert.equal(januarySalesPlan.planId, 'sales_by_project');
  assert.equal(januarySalesPlan.executionSpec.filters.dataInicio, '2026-01-01');
  assert.equal(januarySalesPlan.executionSpec.filters.dataFim, '2026-01-31');

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
