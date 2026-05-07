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
    cidade: 'Salvador',
    renda: 8000,
    sexo: 'F',
    estadoCivil: 'Solteiro',
    corretor: 'Carlos',
    imobiliaria: 'Imob A',
    nomeTabelaAjustado: 'Tabela Janeiro',
    Fonte: 'VCA',
    Status: 'ATIVO',
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
    cidade: 'Salvador',
    renda: 9000,
    sexo: 'M',
    estadoCivil: 'Casado',
    corretor: 'Marina',
    imobiliaria: 'Imob B',
    nomeTabelaAjustado: 'Tabela Janeiro',
    Fonte: 'VCA',
    Status: 'INATIVO',
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
    cidade: 'Feira de Santana',
    renda: 7000,
    sexo: 'F',
    estadoCivil: 'Solteiro',
    corretor: 'Carlos',
    imobiliaria: 'Imob A',
    nomeTabelaAjustado: 'Tabela Janeiro',
    Fonte: 'LOTEAR',
    Status: 'ATIVO',
    distrato_motivoDistrato: null,
    Valor_VGV_Correto: 180000,
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
  assert.equal(salesByFonte.answer_payload.total, 1);
  assert.equal(salesByFonte.answer_payload.counts_by_source.VCA, 1);
  assert.equal(salesByFonte.answer_payload.direct_answer, 'Au au! Boa, vamos pra cima: Na base VCA, temos 1 venda.');

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
}

run().then(() => {
  Module._load = originalLoad;
  console.log('queryExecutors tests passed');
}).catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exit(1);
});
