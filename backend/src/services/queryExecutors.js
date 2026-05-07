const supabase = require('../database/supabase');
const { getCatalogSummary } = require('./businessCatalog');
const { normalizeText } = require('./queryPlanner');
const { validateAnswerPayload } = require('./resultValidator');

const PAGE_SIZE = 1000;
const CONSOLIDATED_SALES_TABLE = 'vw_Vendas_Consolidada';
const CONSOLIDATED_SALES_COLUMNS = [
  'referencia',
  'dataVenda',
  'cliente',
  'empreendimento',
  'etapa',
  'bloco',
  'unidade',
  'cidade',
  'renda',
  'sexo',
  'estadoCivil',
  'corretor',
  'imobiliaria',
  'nomeTabelaAjustado',
  'Fonte',
  'Status',
  'distrato_motivoDistrato',
  'Valor_VGV_Correto',
].join(', ');

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

function summarizeNumeric(rows, key) {
  const values = rows
    .map((row) => Number(row[key]))
    .filter((value) => Number.isFinite(value));
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    total: sum,
    average: values.length > 0 ? sum / values.length : null,
    count: values.length,
  };
}

function summarizeNumericBy(rows, groupKey, numericKey, valueName = 'total') {
  const groups = new Map();
  for (const row of rows) {
    const key = row[groupKey] || 'Nao informado';
    const value = Number(row[numericKey]);
    if (!Number.isFinite(value)) continue;
    groups.set(key, (groups.get(key) || 0) + value);
  }
  return Array.from(groups.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => ({ [groupKey]: name, [valueName]: total }));
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

function consolidatedOnlyLimit(requestedArea) {
  return commercialLimit(
    `Por enquanto, o Supabase esta operando somente com a vw_Vendas_Consolidada. Nao ha tabela ativa de ${requestedArea} para consulta.`,
    ['Consultar vendas, compradores, unidades vendidas, distratos, corretores, imobiliarias, base/Fonte ou VGV pela consolidada.']
  );
}

function isCancellationStatus(value) {
  return normalizeText(value) === 'inativo';
}

function wantsHistoricalSales(message) {
  return /\bhistoric[ao]s?\b|\btodas?\s+as\s+vendas\b|\bgeral\b|\binclu(?:i|ir|indo).*(?:distrat|cancel|inativ)/.test(normalizeText(message));
}

function asksSimpleSalesCount(message) {
  const normalized = normalizeText(message);
  return /\bquant[ao]s?\b|\btotal\b|\bqtd\b|\bquantidade\b|\btemos\b/.test(normalized)
    && /\bvendas?\b/.test(normalized)
    && !/\bvgv\b|\bvalor\b|\bfaturamento\b|\breceita\b|\bcorretor(?:es)?\b|\bimobiliarias?\b|\bclientes?\b|\bcompradores?\b|\bdistratos?\b|\bcancelamentos?\b|\bstatus\b|\bmotivos?\b/.test(normalized);
}

function hasOnlySimpleScopeFilters(filters = {}) {
  const meaningfulKeys = Object.entries(filters)
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key]) => key);
  return meaningfulKeys.every((key) => ['base', 'Fonte', 'fonte', 'empreendimento', 'bloco'].includes(key));
}

function formatSalesScope(filters = {}) {
  const base = filters.base || filters.Fonte || filters.fonte;
  const parts = [];
  if (filters.empreendimento) parts.push(`no empreendimento ${filters.empreendimento}`);
  if (filters.bloco) parts.push(`no bloco ${filters.bloco}`);
  if (base) parts.push(`na base ${String(base).toUpperCase()}`);
  if (parts.length > 0) return parts.join(', ');
  return 'no consolidado';
}

function pluralizeSale(total) {
  return Number(total) === 1 ? 'venda' : 'vendas';
}

function isConsolidatedSalesQuestion(message) {
  const normalized = normalizeText(message);
  return /\bvendas?\b|\bcompras?\b|\breservas?\b|\bcontratos?\b|\bclientes?\b|\bcompradores?\b|\bcorretores?\b|\bimobiliarias?\b|\bvgv\b|\bfonte\b|\bbase\b|\btabela\b/.test(normalized)
    && !isCancellationQuestion(message);
}

function isCancellationQuestion(message) {
  return /\bdistratos?\b|\bcancelamentos?\b|\bcancelad[ao]s?\b|\brescis(?:ao|oes)\b|\binativ[ao]s?\b/.test(normalizeText(message));
}

function normalizeVgvMetric(spec) {
  if (!spec.metric?.column) return spec;
  const metricColumn = normalizeText(spec.metric.column);
  if (/\bvgv\b|valor_vgv|valor total|faturamento|receita|lucro/.test(metricColumn)) {
    return {
      ...spec,
      metric: { ...spec.metric, column: 'Valor_VGV_Correto' },
    };
  }
  return spec;
}

function addFilterIfMissing(filters, column, operator, value) {
  const hasColumnFilter = filters.some((filter) => filter.column === column);
  return hasColumnFilter ? filters : [...filters, { column, operator, value }];
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
  let nextSpec = normalizeVgvMetric(spec);
  const tables = Array.isArray(nextSpec.tables) ? nextSpec.tables : [];
  const usesConsolidatedSales = tables.includes(CONSOLIDATED_SALES_TABLE);
  const filters = Array.isArray(nextSpec.filters) ? [...nextSpec.filters] : [];
  const qualityRulesApplied = [];

  if (usesConsolidatedSales && isCancellationQuestion(nextSpec.message)) {
    nextSpec = {
      ...nextSpec,
      filters: addFilterIfMissing(filters, 'Status', 'eq', 'INATIVO'),
    };
    qualityRulesApplied.push('Status = INATIVO para distratos/cancelamentos');
  } else if (usesConsolidatedSales && isConsolidatedSalesQuestion(nextSpec.message) && !wantsHistoricalSales(nextSpec.message)) {
    nextSpec = {
      ...nextSpec,
      filters: addFilterIfMissing(filters, 'Status', 'neq', 'INATIVO'),
    };
    qualityRulesApplied.push('Status != INATIVO para vendas ativas');
  } else {
    nextSpec = { ...nextSpec, filters };
  }

  const metricColumn = nextSpec.metric?.column;
  const message = normalizeText(spec.message);
  const shouldProtectPriceMetric = metricColumn === 'valor_total'
    && !/\bgaragem\b|\bvaga\b|\bextra\b|\bbaia\b/.test(message);

  if (!shouldProtectPriceMetric) {
    return { spec: nextSpec, qualityRulesApplied };
  }

  const priceFilters = Array.isArray(nextSpec.filters) ? [...nextSpec.filters] : [];
  const excludeTerms = Array.isArray(nextSpec.excludeTerms) ? [...nextSpec.excludeTerms] : [];
  const hasMinimumPrice = filters.some((filter) => filter.column === 'valor_total' && ['gte', 'gt'].includes(filter.operator));
  const hasAccessoryExclusion = excludeTerms.some((exclusion) => {
    const terms = Array.isArray(exclusion.terms) ? exclusion.terms.map(normalizeText) : [];
    return ['garagem', 'extra', 'vaga', 'baia'].some((term) => terms.includes(term));
  });
  if (!hasMinimumPrice) {
    priceFilters.push({ column: 'valor_total', operator: 'gte', value: 50000 });
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
      ...nextSpec,
      filters: priceFilters,
      excludeTerms,
    },
    qualityRulesApplied,
  };
}

async function getStockUnits(filters = {}) {
  void filters;
  return [];
}

async function getPriceRows(filters = {}) {
  void filters;
  return [];
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
        cliente: reference.cliente || null,
        corretor: reference.corretor || null,
        imobiliaria: reference.imobiliaria || null,
        cidade: reference.cidade || null,
        tipologia: reference.tipologia || null,
        situacao: reference.situacao || reference.situacao_atual || reference.Status || null,
        valor_total: reference.valor_total ?? reference.Valor_VGV_Correto ?? null,
        vgv: reference.Valor_VGV_Correto ?? null,
        renda: reference.renda ?? null,
        tabela: reference.tabela || reference.nomeTabelaAjustado || null,
        fonte: reference.Fonte || null,
        motivo_distrato: reference.distrato_motivoDistrato || null,
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

function applyTextFilter(query, filters, filterKey, column) {
  return filters[filterKey] ? query.ilike(column, `%${filters[filterKey]}%`) : query;
}

function applyDateFilters(query, filters) {
  let next = query;
  const start = filters.dataInicio || filters.data_inicio || filters.dataVendaInicio || filters.data_venda_inicio;
  const end = filters.dataFim || filters.data_fim || filters.dataVendaFim || filters.data_venda_fim;
  if (start) next = next.gte('dataVenda', start);
  if (end) next = next.lte('dataVenda', end);
  return next;
}

function applyConsolidatedSalesFilters(query, filters = {}) {
  let next = query;
  next = applyTextFilter(next, filters, 'empreendimento', 'empreendimento');
  next = applyTextFilter(next, filters, 'cliente', 'cliente');
  next = applyTextFilter(next, filters, 'titular', 'cliente');
  next = applyTextFilter(next, filters, 'corretor', 'corretor');
  next = applyTextFilter(next, filters, 'imobiliaria', 'imobiliaria');
  next = applyTextFilter(next, filters, 'unidade', 'unidade');
  next = applyTextFilter(next, filters, 'bloco', 'bloco');
  next = applyTextFilter(next, filters, 'etapa', 'etapa');
  next = applyTextFilter(next, filters, 'cidade', 'cidade');
  next = applyTextFilter(next, filters, 'tabela', 'nomeTabelaAjustado');
  next = applyTextFilter(next, filters, 'nomeTabelaAjustado', 'nomeTabelaAjustado');

  const fonte = filters.Fonte || filters.fonte || filters.base;
  if (fonte) next = next.ilike('Fonte', `%${fonte}%`);

  return applyDateFilters(next, filters);
}

async function getConsolidatedSalesRows(filters = {}, options = {}) {
  const includeInactive = options.includeInactive === true;
  const onlyInactive = options.onlyInactive === true;

  return fetchAll(
    CONSOLIDATED_SALES_TABLE,
    CONSOLIDATED_SALES_COLUMNS,
    (query) => {
      let next = applyConsolidatedSalesFilters(query, filters);
      if (onlyInactive) {
        next = next.eq('Status', 'INATIVO');
      } else if (!includeInactive) {
        next = next.or('Status.is.null,Status.neq.INATIVO');
      }
      return next;
    }
  );
}

function mapConsolidatedSample(row) {
  return {
    referencia: row.referencia,
    dataVenda: row.dataVenda,
    cliente: row.cliente,
    empreendimento: row.empreendimento,
    etapa: row.etapa,
    bloco: row.bloco,
    unidade: row.unidade,
    cidade: row.cidade,
    corretor: row.corretor,
    imobiliaria: row.imobiliaria,
    estadoCivil: row.estadoCivil,
    sexo: row.sexo,
    renda: row.renda,
    nomeTabelaAjustado: row.nomeTabelaAjustado,
    Fonte: row.Fonte,
    Status: row.Status,
    distrato_motivoDistrato: row.distrato_motivoDistrato,
    Valor_VGV_Correto: row.Valor_VGV_Correto,
  };
}

async function executeSalesByProject(plan) {
  const filters = plan.executionSpec.filters || {};
  const includeInactive = wantsHistoricalSales(plan.executionSpec.message || '');
  const rows = await getConsolidatedSalesRows(filters, { includeInactive });
  const activeRows = rows.filter((row) => !isCancellationStatus(row.Status));
  const cancelledRows = rows.filter((row) => isCancellationStatus(row.Status));
  const rowsForRanking = includeInactive ? rows : activeRows;

  const rankingByProject = summarizeRankingBy(rowsForRanking, 'empreendimento', 'total_vendas');
  const shouldUseDirectAnswer = !includeInactive
    && asksSimpleSalesCount(plan.executionSpec.message || '')
    && hasOnlySimpleScopeFilters(filters);
  const directAnswer = shouldUseDirectAnswer
    ? `Au au! Boa, vamos pra cima: ${formatSalesScope(filters).replace(/^./, (char) => char.toUpperCase())}, temos ${rowsForRanking.length} ${pluralizeSale(rowsForRanking.length)}.`
    : null;

  return {
    type: 'sales_summary',
    direct_answer: directAnswer,
    response_guidance: shouldUseDirectAnswer
      ? 'Responda apenas a direct_answer. Nao mencione status, tabela, colunas, filtros tecnicos, VGV ou cancelamentos.'
      : null,
    source_table: CONSOLIDATED_SALES_TABLE,
    default_rule: includeInactive ? 'historico_completo' : 'vendas_ativas_Status_diferente_de_INATIVO',
    filters,
    total: rowsForRanking.length,
    total_active_sales: activeRows.length,
    total_cancelled_or_distracted: cancelledRows.length,
    total_vgv_correto: summarizeNumeric(rowsForRanking, 'Valor_VGV_Correto').total,
    avg_vgv_correto: summarizeNumeric(rowsForRanking, 'Valor_VGV_Correto').average,
    avg_renda: summarizeNumeric(rowsForRanking, 'renda').average,
    counts_by_status: summarizeBy(rows, 'Status'),
    counts_by_source: summarizeBy(rowsForRanking, 'Fonte'),
    counts_by_table: summarizeBy(rowsForRanking, 'nomeTabelaAjustado'),
    counts_by_gender: summarizeBy(rowsForRanking, 'sexo'),
    counts_by_marital_status: summarizeBy(rowsForRanking, 'estadoCivil'),
    counts_by_project: summarizeBy(rowsForRanking, 'empreendimento'),
    ranking_by_corretor: summarizeRankingBy(rowsForRanking, 'corretor', 'total_vendas'),
    ranking_by_imobiliaria: summarizeRankingBy(rowsForRanking, 'imobiliaria', 'total_vendas'),
    ranking_by_city: summarizeRankingBy(rowsForRanking, 'cidade', 'total_vendas'),
    ranking_by_source: summarizeRankingBy(rowsForRanking, 'Fonte', 'total_vendas'),
    ranking_by_table: summarizeRankingBy(rowsForRanking, 'nomeTabelaAjustado', 'total_vendas'),
    ranking_vgv_by_project: summarizeNumericBy(rowsForRanking, 'empreendimento', 'Valor_VGV_Correto', 'vgv_total'),
    ranking_vgv_by_corretor: summarizeNumericBy(rowsForRanking, 'corretor', 'Valor_VGV_Correto', 'vgv_total'),
    ranking_by_project: rankingByProject,
    top_project_by_sales: rankingByProject[0] || null,
    sample: rowsForRanking.slice(0, 30).map(mapConsolidatedSample),
  };
}

async function executeCancellationsByProject(plan) {
  const filters = plan.executionSpec.filters || {};
  const rows = await getConsolidatedSalesRows(filters, { onlyInactive: true });

  const rankingByProject = summarizeRankingBy(rows, 'empreendimento', 'total_distratos');

  return {
    type: 'cancellations_summary',
    source_table: CONSOLIDATED_SALES_TABLE,
    default_rule: 'Status_INATIVO',
    filters,
    total: rows.length,
    total_vgv_correto: summarizeNumeric(rows, 'Valor_VGV_Correto').total,
    avg_vgv_correto: summarizeNumeric(rows, 'Valor_VGV_Correto').average,
    counts_by_status: summarizeBy(rows, 'Status'),
    counts_by_reason: summarizeBy(rows, 'distrato_motivoDistrato'),
    counts_by_source: summarizeBy(rows, 'Fonte'),
    counts_by_project: summarizeBy(rows, 'empreendimento'),
    ranking_by_project: rankingByProject,
    ranking_by_corretor: summarizeRankingBy(rows, 'corretor', 'total_distratos'),
    ranking_by_imobiliaria: summarizeRankingBy(rows, 'imobiliaria', 'total_distratos'),
    ranking_by_reason: summarizeRankingBy(rows, 'distrato_motivoDistrato', 'total_distratos'),
    ranking_vgv_by_project: summarizeNumericBy(rows, 'empreendimento', 'Valor_VGV_Correto', 'vgv_total'),
    top_project_by_cancellations: rankingByProject[0] || null,
    sample: rows.slice(0, 30).map(mapConsolidatedSample),
  };
}

async function executeLeadsSummary(plan) {
  void plan;
  return consolidatedOnlyLimit('leads');
}

async function executePrecadastrosSummary(plan) {
  void plan;
  return consolidatedOnlyLimit('pre-cadastros');
}

async function executeGeneralOverview() {
  return consolidatedOnlyLimit('visao geral antiga');
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
      answerPayload = consolidatedOnlyLimit('estoque/tabela de preco');
      break;
    case 'cheapest_projects_by_price':
      answerPayload = consolidatedOnlyLimit('tabela de preco');
      break;
    case 'cheapest_project_by_base':
      answerPayload = consolidatedOnlyLimit('tabela de preco');
      break;
    case 'stock_by_project':
      answerPayload = consolidatedOnlyLimit('estoque');
      break;
    case 'unit_typology_lookup':
      answerPayload = consolidatedOnlyLimit('estoque/tipologia');
      break;
    case 'price_by_project':
      answerPayload = consolidatedOnlyLimit('tabela de preco');
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
      answerPayload = consolidatedOnlyLimit('leads');
      break;
    case 'precadastros_summary':
      answerPayload = consolidatedOnlyLimit('pre-cadastros');
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
