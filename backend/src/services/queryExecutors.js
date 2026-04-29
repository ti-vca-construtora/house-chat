const supabase = require('../database/supabase');
const { getCatalogSummary } = require('./businessCatalog');
const { normalizeText } = require('./queryPlanner');
const { validateAnswerPayload } = require('./resultValidator');

const PAGE_SIZE = 1000;

async function fetchAll(tableName, columns, applyFilters = (query) => query) {
  let from = 0;
  let rows = [];

  while (true) {
    const query = applyFilters(
      supabase
        .from(tableName)
        .select(columns)
        .range(from, from + PAGE_SIZE - 1)
    );

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao buscar ${tableName}: ${error.message}`);

    rows = rows.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function matchesTextTerms(value, terms = []) {
  const normalizedValue = normalizeText(value);
  return terms.every((term) => {
    const normalizedTerm = normalizeText(term);
    if (normalizedTerm === 'suite') {
      return normalizedValue.includes('suite') && !/\bsem\s+suite\b/.test(normalizedValue);
    }
    return normalizedValue.includes(normalizedTerm);
  });
}

function getTipologiaTerms(filters = {}) {
  const terms = [];
  if (filters.tipologia) {
    const normalizedTipologia = normalizeText(filters.tipologia);
    const quartosMatch = normalizedTipologia.match(/\b([1-5])\s*(?:quartos?|dormitorios?|dorms?)\b/);
    if (quartosMatch) terms.push(`${quartosMatch[1]} quarto`);
    if (/\bsuite\b/.test(normalizedTipologia)) terms.push('suite');
    if (/\bterreo\b/.test(normalizedTipologia)) terms.push('terreo');
    if (!quartosMatch && !/\bsuite\b|\bterreo\b/.test(normalizedTipologia)) terms.push(filters.tipologia);
  }
  if (filters.pavimento) terms.push(filters.pavimento);
  if (Array.isArray(filters.tipologia_terms)) terms.push(...filters.tipologia_terms);
  return [...new Set(terms.filter(Boolean))];
}

function normalizeUnitKey(row) {
  return [
    normalizeText(row.empreendimento || row.nome_empreendimento),
    normalizeText(row.bloco),
    normalizeText(row.unidade),
  ].join('|');
}

function summarizeBy(rows, key) {
  const summary = {};
  for (const row of rows) {
    const value = row[key] || 'Nao informado';
    summary[value] = (summary[value] || 0) + 1;
  }
  return summary;
}

function summarizeRankingBy(rows, key, valueName = 'total') {
  return Object.entries(summarizeBy(rows, key))
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => ({ [key]: name, [valueName]: total }));
}

function isPrimaryPricedUnit(row, minimumValidPrice = 50000) {
  const price = Number(row.valor_total);
  if (!Number.isFinite(price) || price < minimumValidPrice) return false;

  const searchable = normalizeText([
    row.bloco,
    row.unidade,
    row.tabela,
  ].filter(Boolean).join(' '));

  return !/\bgaragem\b|\bextra\b|\bvaga\b|\bbaia\b/.test(searchable);
}

function commercialLimit(reason, alternatives = []) {
  return {
    type: 'not_answerable',
    not_answerable_reason: reason,
    suggested_alternatives: alternatives,
  };
}

function compareFilterValue(rowValue, operator, expectedValue) {
  if (operator === 'in') {
    const list = Array.isArray(expectedValue) ? expectedValue : [expectedValue];
    return list.some((value) => compareFilterValue(rowValue, 'eq', value));
  }

  const rowNumber = Number(rowValue);
  const expectedNumber = Number(expectedValue);
  const canCompareNumbers = Number.isFinite(rowNumber) && Number.isFinite(expectedNumber);

  if (['gte', 'lte', 'gt', 'lt'].includes(operator) && canCompareNumbers) {
    if (operator === 'gte') return rowNumber >= expectedNumber;
    if (operator === 'lte') return rowNumber <= expectedNumber;
    if (operator === 'gt') return rowNumber > expectedNumber;
    if (operator === 'lt') return rowNumber < expectedNumber;
  }

  const rowText = normalizeText(rowValue);
  const expectedText = normalizeText(expectedValue);

  if (operator === 'eq') return rowText === expectedText;
  if (operator === 'neq') return rowText !== expectedText;
  if (operator === 'contains') return rowText.includes(expectedText);
  return false;
}

function applySemanticFilters(rows, spec) {
  const filters = Array.isArray(spec.filters) ? spec.filters : [];
  const excludeTerms = Array.isArray(spec.excludeTerms) ? spec.excludeTerms : [];

  return rows.filter((row) => {
    for (const filter of filters) {
      if (!compareFilterValue(row[filter.column], filter.operator, filter.value)) return false;
    }

    for (const exclusion of excludeTerms) {
      const columns = Array.isArray(exclusion.columns) ? exclusion.columns : [];
      const terms = Array.isArray(exclusion.terms) ? exclusion.terms : [];
      const searchable = normalizeText(columns.map((column) => row[column]).filter(Boolean).join(' '));
      if (terms.some((term) => searchable.includes(normalizeText(term)))) return false;
    }

    return true;
  });
}

function getGroupKey(row, groupBy) {
  if (!Array.isArray(groupBy) || groupBy.length === 0) return 'total';
  return groupBy.map((column) => row[column] || 'Nao informado').join(' | ');
}

function calculateMetric(rows, metric) {
  if (!metric || metric.function === 'count') return rows.length;

  const values = rows
    .map((row) => Number(row[metric.column]))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) return null;
  if (metric.function === 'min') return values.reduce((min, value) => Math.min(min, value), Number.POSITIVE_INFINITY);
  if (metric.function === 'max') return values.reduce((max, value) => Math.max(max, value), Number.NEGATIVE_INFINITY);
  if (metric.function === 'sum') return values.reduce((sum, value) => sum + value, 0);
  if (metric.function === 'avg') return values.reduce((sum, value) => sum + value, 0) / values.length;
  return null;
}

function getReferenceRow(rows, metric, metricValue) {
  if (!metric || metric.function === 'count' || metricValue == null) return rows[0] || null;

  return rows.find((row) => Number(row[metric.column]) === Number(metricValue)) || rows[0] || null;
}

function applyDefaultSemanticQualityRules(spec) {
  const metricColumn = spec.metric?.column;
  const message = normalizeText(spec.message);
  const shouldProtectPriceMetric = metricColumn === 'valor_total'
    && !/\bgaragem\b|\bvaga\b|\bextra\b|\bbaia\b/.test(message);

  if (!shouldProtectPriceMetric) {
    return { spec, qualityRulesApplied: [] };
  }

  const filters = Array.isArray(spec.filters) ? [...spec.filters] : [];
  const excludeTerms = Array.isArray(spec.excludeTerms) ? [...spec.excludeTerms] : [];
  const hasMinimumPrice = filters.some((filter) => filter.column === 'valor_total' && ['gte', 'gt'].includes(filter.operator));
  const hasAccessoryExclusion = excludeTerms.some((exclusion) => {
    const terms = Array.isArray(exclusion.terms) ? exclusion.terms.map(normalizeText) : [];
    return ['garagem', 'extra', 'vaga', 'baia'].some((term) => terms.includes(term));
  });
  const qualityRulesApplied = [];

  if (!hasMinimumPrice) {
    filters.push({ column: 'valor_total', operator: 'gte', value: 50000 });
    qualityRulesApplied.push('valor_total >= 50000');
  }

  if (!hasAccessoryExclusion) {
    excludeTerms.push({
      columns: ['bloco', 'unidade', 'tabela'],
      terms: ['garagem', 'extra', 'vaga', 'baia'],
    });
    qualityRulesApplied.push('excluir garagem/extra/vaga/baia');
  }

  return {
    spec: {
      ...spec,
      filters,
      excludeTerms,
    },
    qualityRulesApplied,
  };
}

async function getStockUnits(filters = {}) {
  const tipologiaTerms = getTipologiaTerms(filters);
  const sourceBase = normalizeText(filters.base);
  const tables = sourceBase === 'vca'
    ? ['estoque_cvcrm']
    : sourceBase === 'lotear'
      ? ['estoque_lotear']
      : ['estoque_cvcrm', 'estoque_lotear'];
  let rows = [];

  for (const table of tables) {
    const tableRows = await fetchAll(
      table,
      'idunidade, nome_empreendimento, situacao, tipologia, area_privativa, vagas_garagem, bloco, unidade, situacao_mapa_disponibilidade',
      (query) => {
        let next = query;
        if (filters.empreendimento) next = next.ilike('nome_empreendimento', `%${filters.empreendimento}%`);
        if (filters.situacao) next = next.ilike('situacao', `%${filters.situacao}%`);
        if (filters.bloco) next = next.ilike('bloco', `%${filters.bloco}%`);
        if (filters.unidade) next = next.ilike('unidade', `%${filters.unidade}%`);
        return next;
      }
    );

    rows = rows.concat(tableRows.map((row) => ({
      ...row,
      base: table.endsWith('_lotear') ? 'lotear' : 'vca',
      empreendimento: row.nome_empreendimento,
    })));
  }

  return tipologiaTerms.length > 0
    ? rows.filter((row) => matchesTextTerms(row.tipologia, tipologiaTerms))
    : rows;
}

async function getPriceRows(filters = {}) {
  const sourceBase = normalizeText(filters.base);
  const tables = sourceBase === 'vca'
    ? ['tabela_de_preco_cvcrm']
    : sourceBase === 'lotear'
      ? ['tabela_de_preco_lotear']
      : ['tabela_de_preco_cvcrm', 'tabela_de_preco_lotear'];
  let rows = [];

  for (const table of tables) {
    const tableRows = await fetchAll(
      table,
      'idunidade, empreendimento, bloco, unidade, area_privativa, valor_total, tabela',
      (query) => {
        let next = query;
        if (filters.empreendimento) next = next.ilike('empreendimento', `%${filters.empreendimento}%`);
        if (filters.bloco) next = next.ilike('bloco', `%${filters.bloco}%`);
        if (filters.unidade) next = next.ilike('unidade', `%${filters.unidade}%`);
        return next;
      }
    );
    rows = rows.concat(tableRows.map((row) => ({ ...row, base: table.endsWith('_lotear') ? 'lotear' : 'vca' })));
  }

  return rows;
}

async function executeCheapestProjectsByPrice(plan) {
  const filters = plan.executionSpec.filters || {};
  const limit = Math.min(Math.max(Number(filters.limit) || 5, 1), 20);
  const minimumValidPrice = Number(filters.minimumValidPrice) || 50000;
  const rows = await getPriceRows(filters);
  const byProject = new Map();
  const validRows = rows.filter((row) => isPrimaryPricedUnit(row, minimumValidPrice));

  for (const row of validRows) {
    const price = Number(row.valor_total);
    if (!row.empreendimento) continue;

    const key = normalizeText(row.empreendimento);
    const current = byProject.get(key);
    if (!current || price < current.valor_minimo) {
      byProject.set(key, {
        empreendimento: row.empreendimento,
        base: row.base,
        valor_minimo: price,
        unidade_referencia: row.unidade || null,
        bloco_referencia: row.bloco || null,
        area_privativa: row.area_privativa || null,
        tabela: row.tabela || null,
      });
    }
  }

  const ranking = Array.from(byProject.values())
    .sort((a, b) => a.valor_minimo - b.valor_minimo)
    .slice(0, limit);

  return {
    type: 'cheapest_projects_by_price',
    filters: {
      ...filters,
      limit,
      base: filters.base || 'todas',
      minimumValidPrice,
    },
    total_registros_preco: rows.length,
    total_registros_validos_para_ranking: validRows.length,
    total_empreendimentos_com_preco: byProject.size,
    ranking,
    not_answerable_reason: ranking.length === 0
      ? 'Nao encontrei registros com valor_total valido na tabela de preco para montar o ranking.'
      : null,
    suggested_alternatives: ranking.length === 0
      ? ['Verificar a sincronizacao da tabela de preco.', 'Listar empreendimentos disponiveis no estoque.']
      : [],
  };
}

async function executeCheapestProjectByBase(plan) {
  const filters = plan.executionSpec.filters || {};
  const minimumValidPrice = Number(filters.minimumValidPrice) || 50000;
  const bases = ['vca', 'lotear'];
  const byBase = {};

  for (const base of bases) {
    const rows = await getPriceRows({ ...filters, base });
    const byProject = new Map();
    const validRows = rows.filter((row) => isPrimaryPricedUnit(row, minimumValidPrice));

    for (const row of validRows) {
      const price = Number(row.valor_total);
      if (!row.empreendimento) continue;

      const key = normalizeText(row.empreendimento);
      const current = byProject.get(key);
      if (!current || price < current.valor_minimo) {
        byProject.set(key, {
          empreendimento: row.empreendimento,
          base: row.base,
          valor_minimo: price,
          unidade_referencia: row.unidade || null,
          bloco_referencia: row.bloco || null,
          area_privativa: row.area_privativa || null,
          tabela: row.tabela || null,
        });
      }
    }

    const cheapest = Array.from(byProject.values())
      .sort((a, b) => a.valor_minimo - b.valor_minimo)[0] || null;

    byBase[base] = {
      total_registros_preco: rows.length,
      total_registros_validos_para_ranking: validRows.length,
      total_empreendimentos_com_preco: byProject.size,
      empreendimento_mais_barato: cheapest,
    };
  }

  return {
    type: 'cheapest_project_by_base',
    filters: {
      ...filters,
      bases,
      minimumValidPrice,
    },
    by_base: byBase,
    not_answerable_reason: Object.values(byBase).every((baseResult) => !baseResult.empreendimento_mais_barato)
      ? 'Nao encontrei registros com valor_total valido nas tabelas de preco das bases VCA e LOTEAR.'
      : null,
    suggested_alternatives: [],
  };
}

async function executeCheapestUnitByTypology(plan) {
  const filters = plan.executionSpec.filters;
  if (plan.missingFields.length > 0) {
    return commercialLimit(
      `Falta informar: ${plan.missingFields.join(', ')}.`,
      ['Informe o empreendimento para cruzar estoque e tabela de preco.']
    );
  }

  const stockRows = await getStockUnits(filters);
  if (stockRows.length === 0) {
    return {
      type: 'cheapest_unit',
      filters,
      total_unidades_estoque: 0,
      total_unidades_com_preco: 0,
      unidade_mais_barata: null,
      matching_units: [],
      not_answerable_reason: 'Nao encontrei unidades no estoque com os filtros de tipologia/pavimento informados.',
      suggested_alternatives: ['Tentar uma tipologia mais ampla.', 'Listar unidades disponiveis do empreendimento.'],
    };
  }

  const priceRows = await getPriceRows(filters);
  const priceById = new Map();
  const priceByKey = new Map();
  for (const row of priceRows) {
    if (row.idunidade != null) priceById.set(String(row.idunidade), row);
    priceByKey.set(normalizeUnitKey(row), row);
  }

  const matched = stockRows
    .map((stock) => {
      const price = stock.idunidade != null
        ? priceById.get(String(stock.idunidade)) || priceByKey.get(normalizeUnitKey(stock))
        : priceByKey.get(normalizeUnitKey(stock));
      return {
        empreendimento: stock.empreendimento,
        bloco: stock.bloco,
        unidade: stock.unidade,
        situacao: stock.situacao,
        tipologia: stock.tipologia,
        area_privativa: price?.area_privativa ?? stock.area_privativa,
        valor_total: price?.valor_total ?? null,
        tabela: price?.tabela ?? null,
      };
    })
    .filter((row) => row.valor_total != null && row.valor_total > 0)
    .sort((a, b) => a.valor_total - b.valor_total);

  return {
    type: 'cheapest_unit',
    filters,
    total_unidades_estoque: stockRows.length,
    total_unidades_com_preco: matched.length,
    unidade_mais_barata: matched[0] || null,
    matching_units: matched.slice(0, 20),
    not_answerable_reason: matched.length === 0 ? 'Encontrei unidades no estoque, mas nao encontrei preco correspondente.' : null,
    suggested_alternatives: matched.length === 0 ? ['Listar unidades filtradas sem preco.', 'Consultar tabela de preco do empreendimento.'] : [],
  };
}

async function executeStockByProject(plan) {
  const filters = plan.executionSpec.filters;
  const rows = await getStockUnits(filters);
  const rankingByProject = summarizeRankingBy(rows, 'empreendimento', 'total_unidades');
  return {
    type: 'stock_summary',
    filters,
    total: rows.length,
    counts_by_status: summarizeBy(rows, 'situacao'),
    counts_by_typology: summarizeBy(rows, 'tipologia'),
    ranking_by_project: rankingByProject,
    top_project_by_units: rankingByProject[0] || null,
    matching_units: rows.slice(0, 50).map((row) => ({
      empreendimento: row.empreendimento,
      bloco: row.bloco,
      unidade: row.unidade,
      situacao: row.situacao,
      tipologia: row.tipologia,
      area_privativa: row.area_privativa,
    })),
  };
}

async function executeUnitTypologyLookup(plan) {
  const filters = plan.executionSpec.filters || {};
  const rows = await getStockUnits({
    empreendimento: filters.empreendimento,
    base: filters.base,
  });
  const wantedUnit = normalizeText(filters.unidade);
  const wantedBlock = normalizeText(filters.bloco);
  const wantedBlockDigits = (wantedBlock.match(/\d+/) || [null])[0];

  const matches = rows.filter((row) => {
    const rowUnit = normalizeText(row.unidade);
    const rowBlock = normalizeText(row.bloco);
    const rowBlockDigits = (rowBlock.match(/\d+/) || [null])[0];
    return (!wantedUnit || rowUnit === wantedUnit || rowUnit.includes(wantedUnit) || wantedUnit.includes(rowUnit))
      && (!wantedBlock
        || rowBlock.includes(wantedBlock)
        || wantedBlock.includes(rowBlock)
        || (wantedBlockDigits && rowBlockDigits === wantedBlockDigits));
  });

  return {
    type: 'unit_typology_lookup',
    filters,
    total_matches: matches.length,
    unidade: matches[0] ? {
      idunidade: matches[0].idunidade,
      empreendimento: matches[0].empreendimento,
      bloco: matches[0].bloco,
      unidade: matches[0].unidade,
      situacao: matches[0].situacao,
      situacao_mapa_disponibilidade: matches[0].situacao_mapa_disponibilidade,
      tipologia: matches[0].tipologia,
      area_privativa: matches[0].area_privativa,
      vagas_garagem: matches[0].vagas_garagem,
    } : null,
    matches: matches.slice(0, 10).map((row) => ({
      idunidade: row.idunidade,
      empreendimento: row.empreendimento,
      bloco: row.bloco,
      unidade: row.unidade,
      situacao: row.situacao,
      situacao_mapa_disponibilidade: row.situacao_mapa_disponibilidade,
      tipologia: row.tipologia,
      area_privativa: row.area_privativa,
      vagas_garagem: row.vagas_garagem,
    })),
    not_answerable_reason: matches.length === 0
      ? 'Nao encontrei a unidade no estoque com os filtros informados.'
      : null,
    suggested_alternatives: matches.length === 0
      ? ['Conferir o nome do empreendimento, bloco e unidade.', 'Buscar unidades parecidas no empreendimento.']
      : [],
  };
}

async function executePriceByProject(plan) {
  const rows = await getPriceRows(plan.executionSpec.filters);
  const priced = rows.filter((row) => isPrimaryPricedUnit(row, plan.executionSpec.filters?.minimumValidPrice || 50000))
    .sort((a, b) => a.valor_total - b.valor_total);

  return {
    type: 'price_summary',
    filters: plan.executionSpec.filters,
    total_unidades: rows.length,
    total_com_preco: priced.length,
    unidade_mais_barata: priced[0] || null,
    menores_precos: priced.slice(0, 20),
  };
}

async function executeSemanticAggregate(plan) {
  const qualityAdjusted = applyDefaultSemanticQualityRules(plan.executionSpec || {});
  const spec = qualityAdjusted.spec;
  const tables = Array.isArray(spec.tables) ? spec.tables : [];
  const limit = Math.min(Math.max(Number(spec.limit) || 20, 1), 50);
  let rows = [];

  for (const table of tables) {
    const tableRows = await fetchAll(table, '*');
    rows = rows.concat(tableRows.map((row) => ({ ...row, source_table: table })));
  }

  const filteredRows = applySemanticFilters(rows, spec);
  const groupBy = Array.isArray(spec.groupBy) ? spec.groupBy : [];
  const metric = spec.metric || { function: 'count' };
  const groups = new Map();

  for (const row of filteredRows) {
    const key = getGroupKey(row, groupBy);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const results = Array.from(groups.entries()).map(([groupKey, groupRows]) => {
    const metricValue = calculateMetric(groupRows, metric);
    const reference = getReferenceRow(groupRows, metric, metricValue);
    const group = {};
    groupBy.forEach((column, index) => {
      group[column] = groupKey.split(' | ')[index] || null;
    });

    return {
      group,
      metric: {
        function: metric.function,
        column: metric.column || null,
        value: metricValue,
      },
      total_rows: groupRows.length,
      reference: reference ? {
        source_table: reference.source_table,
        empreendimento: reference.empreendimento || reference.nome_empreendimento || reference.nome || null,
        bloco: reference.bloco || null,
        unidade: reference.unidade || null,
        tipologia: reference.tipologia || null,
        situacao: reference.situacao || reference.situacao_atual || null,
        valor_total: reference.valor_total ?? null,
        tabela: reference.tabela || null,
      } : null,
    };
  });

  const direction = spec.order?.direction === 'desc' ? 'desc' : 'asc';
  results.sort((a, b) => {
    const av = a.metric.value ?? (direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    const bv = b.metric.value ?? (direction === 'asc' ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    return direction === 'asc' ? av - bv : bv - av;
  });

  return {
    type: 'semantic_aggregate',
    outputType: spec.outputType || 'summary',
    tables,
    filters: spec.filters || [],
    excludeTerms: spec.excludeTerms || [],
    groupBy,
    metric,
    order: spec.order || { by: 'metric', direction },
    qualityRulesApplied: qualityAdjusted.qualityRulesApplied,
    total_rows_read: rows.length,
    total_rows_after_filters: filteredRows.length,
    total_groups: groups.size,
    results: results.slice(0, limit),
    not_answerable_reason: results.length === 0 ? 'A consulta semantica foi valida, mas nao encontrou registros com os filtros aplicados.' : null,
    suggested_alternatives: results.length === 0 ? ['Remover ou ampliar algum filtro.', 'Consultar um resumo da tabela relacionada.'] : [],
  };
}

async function executeSalesByProject(plan) {
  const filters = plan.executionSpec.filters;
  let rows = [];
  const sourceBase = normalizeText(filters.base);
  const tables = sourceBase === 'vca'
    ? ['vendas_cvcrm']
    : sourceBase === 'lotear'
      ? ['vendas_lotear']
      : ['vendas_cvcrm', 'vendas_lotear'];
  for (const table of tables) {
    const tableRows = await fetchAll(table, 'numero_reserva, tipo_de_venda, empreendimento, unidade, corretor, imobiliaria', (query) => {
      let next = query;
      if (filters.empreendimento) next = next.ilike('empreendimento', `%${filters.empreendimento}%`);
      if (filters.corretor) next = next.ilike('corretor', `%${filters.corretor}%`);
      if (filters.imobiliaria) next = next.ilike('imobiliaria', `%${filters.imobiliaria}%`);
      if (filters.unidade) next = next.ilike('unidade', `%${filters.unidade}%`);
      return next;
    });
    rows = rows.concat(tableRows);
  }

  const rankingByProject = summarizeRankingBy(rows, 'empreendimento', 'total_vendas');

  return {
    type: 'sales_summary',
    filters,
    total: rows.length,
    counts_by_sale_type: summarizeBy(rows, 'tipo_de_venda'),
    counts_by_project: summarizeBy(rows, 'empreendimento'),
    ranking_by_project: rankingByProject,
    top_project_by_sales: rankingByProject[0] || null,
    sample: rows.slice(0, 30),
  };
}

async function executeCancellationsByProject(plan) {
  const filters = plan.executionSpec.filters;
  let rows = [];
  const sourceBase = normalizeText(filters.base);
  const tables = sourceBase === 'vca'
    ? ['distratos_cvcrm']
    : sourceBase === 'lotear'
      ? ['distratos_lotear']
      : ['distratos_cvcrm', 'distratos_lotear'];
  for (const table of tables) {
    const tableRows = await fetchAll(table, 'id_distrato, id_reserva, situacao_atual, empreendimento, bloco, unidade', (query) => {
      let next = query;
      if (filters.empreendimento) next = next.ilike('empreendimento', `%${filters.empreendimento}%`);
      if (filters.situacao) next = next.ilike('situacao_atual', `%${filters.situacao}%`);
      return next;
    });
    rows = rows.concat(tableRows);
  }

  const rankingByProject = summarizeRankingBy(rows, 'empreendimento', 'total_distratos');

  return {
    type: 'cancellations_summary',
    filters,
    total: rows.length,
    counts_by_status: summarizeBy(rows, 'situacao_atual'),
    counts_by_project: summarizeBy(rows, 'empreendimento'),
    ranking_by_project: rankingByProject,
    top_project_by_cancellations: rankingByProject[0] || null,
    sample: rows.slice(0, 30),
  };
}

async function executeLeadsSummary(plan) {
  const filters = plan.executionSpec.filters;
  const rows = await fetchAll('TB_LEADS', 'idlead, situacao, empreendimento, origem, origem_ultimo, corretor, imobiliaria', (query) => {
    let next = query;
    if (filters.empreendimento) next = next.ilike('empreendimento', `%${filters.empreendimento}%`);
    if (filters.corretor) next = next.ilike('corretor', `%${filters.corretor}%`);
    if (filters.situacao) next = next.ilike('situacao', `%${filters.situacao}%`);
    return next;
  });

  return {
    type: 'leads_summary',
    filters,
    total: rows.length,
    counts_by_status: summarizeBy(rows, 'situacao'),
    counts_by_origin: summarizeBy(rows, 'origem'),
    sample: rows.slice(0, 30),
  };
}

async function executePrecadastrosSummary(plan) {
  const filters = plan.executionSpec.filters;
  let rows = [];
  for (const table of ['TB_PRECADASTROS', 'TB_PRECADASTROS_LOT']) {
    const tableRows = await fetchAll(table, 'idprecadastro, situacao, empreendimento, unidade, corretor, imobiliaria, valor_total', (query) => {
      let next = query;
      if (filters.empreendimento) next = next.ilike('empreendimento', `%${filters.empreendimento}%`);
      if (filters.corretor) next = next.ilike('corretor', `%${filters.corretor}%`);
      if (filters.situacao) next = next.ilike('situacao', `%${filters.situacao}%`);
      return next;
    });
    rows = rows.concat(tableRows);
  }

  return {
    type: 'precadastros_summary',
    filters,
    total: rows.length,
    counts_by_status: summarizeBy(rows, 'situacao'),
    counts_by_project: summarizeBy(rows, 'empreendimento'),
    sample: rows.slice(0, 30),
  };
}

async function executeGeneralOverview() {
  const [stock, prices] = await Promise.all([
    executeStockByProject({ executionSpec: { filters: {} } }),
    executePriceByProject({ executionSpec: { filters: {} } }),
  ]);

  return {
    type: 'general_commercial_overview',
    stock_total: stock.total,
    stock_by_status: stock.counts_by_status,
    price_total: prices.total_unidades,
    cheapest_units: prices.menores_precos.slice(0, 10),
  };
}

async function executePlan(plan) {
  let answerPayload;

  switch (plan.planId) {
    case 'composite_query': {
      const subPlans = plan.executionSpec?.subPlans || [];
      const results = [];
      for (const subPlan of subPlans) {
        const result = await executePlan(subPlan);
        results.push({
          question: subPlan.executionSpec?.message || '',
          planId: subPlan.planId,
          answer_payload: result.answer_payload,
          validation_warnings: result.validation_warnings || [],
        });
      }
      answerPayload = {
        type: 'composite_query',
        total_questions: results.length,
        results,
      };
      break;
    }
    case 'action_not_supported':
      answerPayload = commercialLimit(
        'O sistema nao executa acoes operacionais como bloquear, reservar, simular financiamento ou enviar proposta.',
        ['Posso consultar dados de estoque, preco, tipologia, vendas, distratos, leads ou pre-cadastros.']
      );
      break;
    case 'cheapest_unit_by_typology':
      answerPayload = await executeCheapestUnitByTypology(plan);
      break;
    case 'cheapest_projects_by_price':
      answerPayload = await executeCheapestProjectsByPrice(plan);
      break;
    case 'cheapest_project_by_base':
      answerPayload = await executeCheapestProjectByBase(plan);
      break;
    case 'stock_by_project':
      answerPayload = await executeStockByProject(plan);
      break;
    case 'unit_typology_lookup':
      answerPayload = await executeUnitTypologyLookup(plan);
      break;
    case 'price_by_project':
      answerPayload = await executePriceByProject(plan);
      break;
    case 'semantic_aggregate':
      answerPayload = await executeSemanticAggregate(plan);
      break;
    case 'sales_by_project':
      answerPayload = await executeSalesByProject(plan);
      break;
    case 'cancellations_by_project':
      answerPayload = await executeCancellationsByProject(plan);
      break;
    case 'leads_summary':
      answerPayload = await executeLeadsSummary(plan);
      break;
    case 'precadastros_summary':
      answerPayload = await executePrecadastrosSummary(plan);
      break;
    case 'general_commercial_overview':
      answerPayload = await executeGeneralOverview(plan);
      break;
    default:
      answerPayload = commercialLimit(
        'Nao encontrei um plano de consulta seguro para essa pergunta.',
        ['Reformular a pergunta com empreendimento, unidade, corretor ou periodo.', 'Consultar estoque, preco, vendas, distratos, leads ou pre-cadastros.']
      );
      break;
  }

  const validationWarnings = validateAnswerPayload(answerPayload);

  return {
    answer_payload: answerPayload,
    query_plan: {
      planId: plan.planId,
      confidence: plan.confidence,
      missingFields: plan.missingFields,
      requiredPermissions: plan.requiredPermissions,
    },
    validation_warnings: validationWarnings,
    catalog_summary: getCatalogSummary(),
  };
}

module.exports = {
  executePlan,
  getTipologiaTerms,
  matchesTextTerms,
  normalizeUnitKey,
};
