const assert = require('node:assert/strict');
const Module = require('node:module');

const calls = [];
const rows = [
  {
    referencia: 1,
    dataVenda: '2026-01-10T00:00:00Z',
    cliente: 'Ana Souza',
    empreendimento: 'Uni Ville',
    etapa: '1',
    bloco: 'BL01',
    unidade: '101',
    tipoVenda: 'Financiamento',
    cidade: 'Salvador',
    renda: 8000,
    sexo: 'F',
    idade: 31,
    valorContrato: 250000,
    estadoCivil: 'Solteiro',
    corretor: 'Carlos',
    imobiliaria: 'Imob A',
    midia: 'Instagram',
    nomeTabelaAjustado: 'Tabela Janeiro',
    VALOR_ENTRADA: 30000,
    Fonte: 'VCA',
    Status: 'ATIVO',
    distrato_dataCad: null,
    distrato_motivoDistrato: null,
    Valor_VGV_Correto: 250000,
  },
  {
    referencia: 2,
    dataVenda: '2026-01-11T00:00:00Z',
    cliente: 'Bruno Lima',
    empreendimento: 'Uni Ville',
    etapa: '1',
    bloco: 'BL01',
    unidade: '102',
    tipoVenda: 'Financiamento',
    cidade: 'Salvador',
    renda: 9000,
    sexo: 'M',
    idade: 42,
    valorContrato: 300000,
    estadoCivil: 'Casado',
    corretor: 'Marina',
    imobiliaria: 'Imob B',
    midia: 'Google',
    nomeTabelaAjustado: 'Tabela Janeiro',
    VALOR_ENTRADA: 50000,
    Fonte: 'VCA',
    Status: 'INATIVO',
    distrato_dataCad: '2026-02-01T00:00:00Z',
    distrato_motivoDistrato: 'Credito reprovado',
    Valor_VGV_Correto: 300000,
  },
  {
    referencia: 3,
    dataVenda: '2026-01-12T00:00:00Z',
    cliente: 'Carla Dias',
    empreendimento: 'Outro Projeto',
    etapa: '1',
    bloco: 'BL02',
    unidade: '201',
    tipoVenda: 'A vista',
    cidade: 'Feira de Santana',
    renda: 7000,
    sexo: 'F',
    idade: 29,
    valorContrato: 180000,
    estadoCivil: 'Solteiro',
    corretor: 'Carlos',
    imobiliaria: 'Imob A',
    midia: 'Outdoor',
    nomeTabelaAjustado: 'Tabela Janeiro',
    VALOR_ENTRADA: 180000,
    Fonte: 'LOTEAR',
    Status: 'ATIVO',
    distrato_dataCad: null,
    distrato_motivoDistrato: null,
    Valor_VGV_Correto: 180000,
  },
  {
    referencia: 4,
    dataVenda: '2026-01-13T00:00:00Z',
    cliente: 'Diego Rocha',
    empreendimento: 'DONA OLIVIA RESIDENCIAL',
    etapa: '1',
    bloco: 'BL03',
    unidade: '301',
    tipoVenda: 'Financiamento',
    cidade: 'Salvador',
    renda: 7500,
    sexo: 'M',
    idade: 37,
    valorContrato: 210000,
    estadoCivil: 'Solteiro',
    corretor: 'Lara',
    imobiliaria: 'Imob C',
    midia: 'Indicacao',
    nomeTabelaAjustado: 'Tabela Janeiro',
    VALOR_ENTRADA: 40000,
    Fonte: 'VCA',
    Status: 'ATIVO',
    distrato_dataCad: null,
    distrato_motivoDistrato: null,
    Valor_VGV_Correto: 210000,
  },
];

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    calls.push(this);
  }

  select(columns) {
    this.columns = columns;
    return this;
  }

  range(from, to) {
    this.from = from;
    this.to = to;
    return this;
  }

  ilike(column, pattern) {
    this.filters.push({ op: 'ilike', column, pattern });
    return this;
  }

  eq(column, value) {
    this.filters.push({ op: 'eq', column, value });
    return this;
  }

  or(expression) {
    this.filters.push({ op: 'or', expression });
    return this;
  }

  gte(column, value) {
    this.filters.push({ op: 'gte', column, value });
    return this;
  }

  lte(column, value) {
    this.filters.push({ op: 'lte', column, value });
    return this;
  }

  then(resolve) {
    let data = rows;
    for (const filter of this.filters) {
      if (filter.op === 'ilike') {
        const needle = normalize(filter.pattern.replace(/%/g, ''));
        data = data.filter((row) => normalize(row[filter.column]).includes(needle));
      }
      if (filter.op === 'eq') {
        data = data.filter((row) => row[filter.column] === filter.value);
      }
      if (filter.op === 'or' && filter.expression === 'Status.is.null,Status.neq.INATIVO') {
        data = data.filter((row) => row.Status == null || row.Status !== 'INATIVO');
      }
      if (filter.op === 'gte') {
        data = data.filter((row) => Date.parse(row[filter.column]) >= Date.parse(filter.value));
      }
      if (filter.op === 'lte') {
        data = data.filter((row) => Date.parse(row[filter.column]) <= Date.parse(filter.value));
      }
    }
    resolve({ data, error: null });
  }
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '../database/supabase' || request.endsWith('/database/supabase')) {
    return {
      from(table) {
        return new Query(table);
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { executePlan } = require('../src/services/queryExecutors');

async function run() {
  const sales = await executePlan({
    planId: 'sales_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Quantas vendas tem no Uni Ville?',
      filters: { empreendimento: 'Uni Ville' },
    },
  });

  assert.equal(calls[0].table, 'vw_Vendas_Consolidada');
  assert.ok(calls[0].filters.some((filter) => filter.op === 'or' && filter.expression === 'Status.is.null,Status.neq.INATIVO'));
  assert.equal(sales.answer_payload.total, 1);
  assert.equal(sales.answer_payload.total_cancelled_or_distracted, 0);
  assert.equal(sales.answer_payload.total_vgv_correto, 250000);
  assert.equal(sales.answer_payload.ranking_by_project[0].empreendimento, 'Uni Ville');

  calls.length = 0;
  const cancellations = await executePlan({
    planId: 'cancellations_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Quantos distratos tem no Uni Ville?',
      filters: { empreendimento: 'Uni Ville' },
    },
  });

  assert.equal(calls[0].table, 'vw_Vendas_Consolidada');
  assert.ok(calls[0].filters.some((filter) => filter.op === 'eq' && filter.column === 'Status' && filter.value === 'INATIVO'));
  assert.equal(cancellations.answer_payload.total, 1);
  assert.equal(cancellations.answer_payload.counts_by_reason['Credito reprovado'], 1);
  assert.equal(cancellations.answer_payload.total_vgv_correto, 300000);

  calls.length = 0;
  const vgvAggregate = await executePlan({
    planId: 'semantic_aggregate',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Qual empreendimento teve maior VGV?',
      tables: ['vw_Vendas_Consolidada'],
      filters: [],
      groupBy: ['empreendimento'],
      metric: { function: 'sum', column: 'vgv' },
      order: { by: 'metric', direction: 'desc' },
      limit: 5,
    },
  });

  assert.equal(vgvAggregate.answer_payload.metric.column, 'Valor_VGV_Correto');
  assert.deepEqual(vgvAggregate.answer_payload.filters, [{ column: 'Status', operator: 'neq', value: 'INATIVO' }]);
  assert.equal(vgvAggregate.answer_payload.results[0].metric.value, 250000);

  calls.length = 0;
  const activeVgvBase = await executePlan({
    planId: 'semantic_aggregate',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'somente vendas ativas',
      tables: ['vw_Vendas_Consolidada'],
      filters: [
        { column: 'Fonte', operator: 'contains', value: 'vca' },
        { column: 'Status', operator: 'neq', value: 'INATIVO' },
      ],
      groupBy: [],
      metric: { function: 'sum', column: 'Valor_VGV_Correto' },
      order: { by: 'metric', direction: 'desc' },
      limit: 5,
    },
  });

  assert.equal(activeVgvBase.answer_payload.total_rows_after_filters, 2);
  assert.equal(activeVgvBase.answer_payload.results[0].metric.value, 460000);
  assert.match(activeVgvBase.answer_payload.direct_answer, /base VCA/);
  assert.match(activeVgvBase.answer_payload.direct_answer, /vendas ativas/);

  calls.length = 0;
  const vgvDistratos = await executePlan({
    planId: 'semantic_aggregate',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Qual o valor de VGV total desses distratos?',
      tables: ['vw_Vendas_Consolidada'],
      filters: [
        { column: 'empreendimento', operator: 'contains', value: 'Uni Ville' },
        { column: 'Status', operator: 'eq', value: 'INATIVO' },
      ],
      groupBy: [],
      metric: { function: 'sum', column: 'Valor_VGV_Correto' },
      order: { by: 'metric', direction: 'desc' },
      limit: 5,
    },
  });

  assert.equal(vgvDistratos.answer_payload.total_rows_after_filters, 1);
  assert.equal(vgvDistratos.answer_payload.results[0].metric.value, 300000);
  assert.match(vgvDistratos.answer_payload.direct_answer, /VGV total/);
  assert.match(vgvDistratos.answer_payload.direct_answer, /R\$\s*300\.000,00/);

  calls.length = 0;
  const reasonsAggregate = await executePlan({
    planId: 'semantic_aggregate',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Quais os motivos desses distratos?',
      tables: ['vw_Vendas_Consolidada'],
      filters: [{ column: 'Status', operator: 'eq', value: 'INATIVO' }],
      groupBy: ['distrato_motivoDistrato'],
      metric: { function: 'count' },
      order: { by: 'metric', direction: 'desc' },
      limit: 5,
    },
  });

  assert.equal(reasonsAggregate.answer_payload.results[0].group.distrato_motivoDistrato, 'Credito reprovado');
  assert.match(reasonsAggregate.answer_payload.direct_answer, /motivos de distrato/);

  calls.length = 0;
  const incomeAggregate = await executePlan({
    planId: 'semantic_aggregate',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Qual a renda media dos compradores?',
      tables: ['vw_Vendas_Consolidada'],
      filters: [],
      groupBy: [],
      metric: { function: 'avg', column: 'renda' },
      order: { by: 'metric', direction: 'desc' },
      limit: 5,
    },
  });

  assert.equal(incomeAggregate.answer_payload.results[0].metric.value, 7500);
  assert.match(incomeAggregate.answer_payload.direct_answer, /CVCRM/);

  calls.length = 0;
  const salesByFonte = await executePlan({
    planId: 'sales_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'quantas vendas na base VCA nos temos hoje?',
      filters: { base: 'vca' },
    },
  });

  assert.ok(calls[0].filters.some((filter) => filter.op === 'ilike' && filter.column === 'Fonte' && filter.pattern === '%vca%'));
  assert.equal(salesByFonte.answer_payload.total, 2);
  assert.equal(salesByFonte.answer_payload.counts_by_source.VCA, 2);
  assert.equal(salesByFonte.answer_payload.direct_answer, 'Au au! Boa, vamos pra cima: Na base VCA, temos 2 vendas.');

  calls.length = 0;
  const salesByBlock = await executePlan({
    planId: 'sales_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Quantidade de vendas no bloco 1',
      filters: { empreendimento: 'Uni Ville', bloco: 'BL01' },
    },
  });

  assert.ok(calls[0].filters.some((filter) => filter.op === 'ilike' && filter.column === 'bloco' && filter.pattern === '%BL01%'));
  assert.equal(salesByBlock.answer_payload.total, 1);
  assert.equal(salesByBlock.answer_payload.direct_answer, 'Au au! Boa, vamos pra cima: No empreendimento Uni Ville, no bloco BL01, temos 1 venda.');

  calls.length = 0;
  const buyerUnitList = await executePlan({
    planId: 'sales_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Quais as unidades e qual o nome dos clientes que compraram?',
      filters: { empreendimento: 'Uni Ville', bloco: 'BL01', commercialFollowUp: true },
    },
  });

  assert.equal(buyerUnitList.answer_payload.total, 1);
  assert.equal(buyerUnitList.answer_payload.filters.commercialFollowUp, undefined);
  assert.equal(buyerUnitList.answer_payload.filters.buyerUnitList, undefined);
  assert.match(buyerUnitList.answer_payload.direct_answer, /BL01 - 101 - Ana Souza/);

  calls.length = 0;
  const buyerUnitListFollowUp = await executePlan({
    planId: 'sales_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'só os do bloco 1',
      filters: { empreendimento: 'Uni Ville', bloco: 'BL01', buyerUnitList: true },
    },
  });

  assert.equal(buyerUnitListFollowUp.answer_payload.total, 1);
  assert.match(buyerUnitListFollowUp.answer_payload.direct_answer, /BL01 - 101 - Ana Souza/);

  calls.length = 0;
  const fuzzyProjectSales = await executePlan({
    planId: 'sales_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Quantas do D Olivia?',
      filters: { empreendimento: 'D Olivia' },
    },
  });

  assert.equal(fuzzyProjectSales.answer_payload.total, 1);
  assert.equal(fuzzyProjectSales.answer_payload.matched_project, 'DONA OLIVIA RESIDENCIAL');
  assert.equal(fuzzyProjectSales.answer_payload.filters.empreendimento, 'DONA OLIVIA RESIDENCIAL');
  assert.equal(
    fuzzyProjectSales.answer_payload.direct_answer,
    'Au au! Boa, vamos pra cima: No empreendimento DONA OLIVIA RESIDENCIAL, temos 1 venda.'
  );

  calls.length = 0;
  const missingProjectSales = await executePlan({
    planId: 'sales_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Quantas do Projeto Fantasma?',
      filters: { empreendimento: 'Projeto Fantasma' },
    },
  });

  assert.equal(missingProjectSales.answer_payload.total, 0);
  assert.match(missingProjectSales.answer_payload.direct_answer, /Nao encontrei/);

  calls.length = 0;
  const explanation = await executePlan({
    planId: 'sales_by_project',
    confidence: 0.9,
    missingFields: [],
    requiredPermissions: ['view_reservas'],
    executionSpec: {
      message: 'Por que 1?',
      filters: { empreendimento: 'DONA OLIVIA RESIDENCIAL', commercialFollowUp: true },
    },
  });

  assert.equal(explanation.answer_payload.total, 1);
  assert.match(explanation.answer_payload.direct_answer, /Cheguei nesse numero/);
  assert.match(explanation.answer_payload.direct_answer, /Quebra por fonte: VCA: 1/);
}

run().then(() => {
  Module._load = originalLoad;
  console.log('queryExecutors tests passed');
}).catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exit(1);
});
