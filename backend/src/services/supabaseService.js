const supabase = require('../database/supabase');
const { buildQueryPlan } = require('./queryPlanner');
const { executePlan } = require('./queryExecutors');

function applyReservaFilters(query, filters = {}) {
  let nextQuery = query;

  if (filters.empreendimento) {
    nextQuery = nextQuery.ilike('empreendimento', `%${filters.empreendimento}%`);
  }
  if (Array.isArray(filters.situacoes) && filters.situacoes.length > 0) {
    nextQuery = nextQuery.in('tipo_de_venda', filters.situacoes);
  } else if (filters.situacao) {
    nextQuery = nextQuery.ilike('tipo_de_venda', `%${filters.situacao}%`);
  }
  if (filters.titular) {
    nextQuery = nextQuery.ilike('titular_nome', `%${filters.titular}%`);
  }
  if (filters.corretor) {
    nextQuery = nextQuery.ilike('corretor', `%${filters.corretor}%`);
  }
  if (filters.unidade) {
    nextQuery = nextQuery.ilike('unidade', `%${filters.unidade}%`);
  }
  if (filters.documento_cliente) {
    nextQuery = nextQuery.ilike('documento_cliente', `%${filters.documento_cliente}%`);
  }

  return nextQuery;
}

async function fetchEmpreendimentos(filters = {}) {
  let query = supabase.from('empreendimentos_cvcrm').select('*');

  if (filters.nome) {
    query = query.ilike('nome', `%${filters.nome}%`);
  }
  if (filters.cidade) {
    query = query.ilike('cidade', `%${filters.cidade}%`);
  }
  if (filters.estado) {
    query = query.ilike('estado', `%${filters.estado}%`);
  }

  const { data, error } = await query.order('nome');
  if (error) throw new Error(`Erro ao buscar empreendimentos: ${error.message}`);
  return data;
}

async function fetchReservas(filters = {}) {
  const PAGE_SIZE = 1000;
  let from = 0;
  let allData = [];

  while (true) {
    let query = supabase.from('vendas_cvcrm').select('*');
    query = applyReservaFilters(query, filters);
    query = query.order('numero_reserva').range(from, from + PAGE_SIZE - 1);

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao buscar reservas: ${error.message}`);

    allData = allData.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}

async function fetchReservasResumo(filters = {}) {
  const PAGE_SIZE = 1000;
  let from = 0;
  let allData = [];

  while (true) {
    let query = supabase
      .from('vendas_cvcrm')
      .select('empreendimento, tipo_de_venda')
      .range(from, from + PAGE_SIZE - 1);
    query = applyReservaFilters(query, filters);

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao resumir reservas: ${error.message}`);
    allData = allData.concat(data || []);
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const contagemPorSituacao = {};
  const empreendimentos = new Set();

  for (const row of allData) {
    const situacao = row.tipo_de_venda || 'Sem tipo de venda';
    contagemPorSituacao[situacao] = (contagemPorSituacao[situacao] || 0) + 1;

    if (row.empreendimento) {
      empreendimentos.add(row.empreendimento);
    }
  }

  return {
    tipo: 'count_by_status',
    empreendimento_consultado: empreendimentos.size === 1
      ? Array.from(empreendimentos)[0]
      : filters.empreendimento || null,
    situacoes_consultadas: filters.situacoes || (filters.situacao ? [filters.situacao] : []),
    total_registros: allData.length,
    contagem_por_situacao: contagemPorSituacao,
  };
}

async function fetchVendasResumo(filters = {}) {
  const PAGE_SIZE = 1000;
  let from = 0;
  let allData = [];

  while (true) {
    let query = supabase
      .from('vendas_cvcrm')
      .select('empreendimento, tipo_de_venda')
      .range(from, from + PAGE_SIZE - 1);

    if (filters.empreendimento) {
      query = query.ilike('empreendimento', `%${filters.empreendimento}%`);
    }
    if (filters.titular) {
      query = query.ilike('titular_nome', `%${filters.titular}%`);
    }
    if (filters.corretor) {
      query = query.ilike('corretor', `%${filters.corretor}%`);
    }
    if (filters.unidade) {
      query = query.ilike('unidade', `%${filters.unidade}%`);
    }
    if (filters.documento_cliente) {
      query = query.ilike('documento_cliente', `%${filters.documento_cliente}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Erro ao resumir vendas: ${error.message}`);
    allData = allData.concat(data || []);
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const contagemPorTipoDeVenda = {};
  const empreendimentos = new Set();

  for (const row of allData) {
    const tipoDeVenda = row.tipo_de_venda || 'Sem tipo de venda';
    contagemPorTipoDeVenda[tipoDeVenda] = (contagemPorTipoDeVenda[tipoDeVenda] || 0) + 1;

    if (row.empreendimento) {
      empreendimentos.add(row.empreendimento);
    }
  }

  return {
    tipo: 'count_sales',
    empreendimento_consultado: empreendimentos.size === 1
      ? Array.from(empreendimentos)[0]
      : filters.empreendimento || null,
    total_registros: allData.length,
    contagem_por_tipo_de_venda: contagemPorTipoDeVenda,
  };
}

/**
 * Busca TODOS os registros de uma tabela paginando de 1000 em 1000
 * para contornar o limite padrão do PostgREST/Supabase.
 */
async function fetchAllRowsPaginated(tableName, columns) {
  const PAGE_SIZE = 1000;
  let from = 0;
  let allData = [];

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Erro ao buscar ${tableName} (página ${from}): ${error.message}`);

    allData = allData.concat(data);

    // Se retornou menos que PAGE_SIZE, chegamos ao fim
    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return allData;
}

/**
 * Agrega vendas de AMBAS as bases (VCA e LOTEAR) por empreendimento.
 * Pagina automaticamente para buscar todos os registros além do limite de 1000.
 */
async function fetchVendasAgregadoPorBase() {
  const [vcaData, lotearData] = await Promise.all([
    fetchAllRowsPaginated('vendas_cvcrm', 'empreendimento'),
    fetchAllRowsPaginated('vendas_lotear', 'empreendimento'),
  ]);

  function agregar(rows) {
    const porEmp = {};
    for (const row of rows) {
      const emp = row.empreendimento || 'Não informado';
      porEmp[emp] = (porEmp[emp] || 0) + 1;
    }
    return Object.entries(porEmp)
      .sort((a, b) => b[1] - a[1])
      .map(([empreendimento, total_vendas]) => ({ empreendimento, total_vendas }));
  }

  return {
    vca: {
      descricao: 'Base VCA (CVCRM)',
      total_vendas: vcaData.length,
      ranking_empreendimentos: agregar(vcaData),
    },
    lotear: {
      descricao: 'Base LOTEAR',
      total_vendas: lotearData.length,
      ranking_empreendimentos: agregar(lotearData),
    },
  };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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
    if (!quartosMatch && !/\bsuite\b|\bterreo\b/.test(normalizedTipologia)) {
      terms.push(filters.tipologia);
    }
  }
  if (filters.pavimento) {
    terms.push(filters.pavimento);
  }
  if (Array.isArray(filters.tipologia_terms)) {
    terms.push(...filters.tipologia_terms);
  }

  return [...new Set(terms.filter(Boolean))];
}

function normalizeUnitKey(row) {
  return [
    normalizeText(row.empreendimento || row.nome_empreendimento),
    normalizeText(row.bloco),
    normalizeText(row.unidade),
  ].join('|');
}

async function fetchEstoqueAgregado(filters = {}) {
  const tipologiaTerms = getTipologiaTerms(filters);
  const shouldReturnUnitDetails = Boolean(
    filters.empreendimento || filters.tipologia || filters.pavimento || tipologiaTerms.length > 0
  );

  async function fetchEstoqueAll(tableName) {
    const PAGE_SIZE = 1000;
    let from = 0;
    let allData = [];

    while (true) {
      let q = supabase
        .from(tableName)
        .select('idunidade, empreendimento:nome_empreendimento, situacao, tipologia, area_privativa, vagas_garagem, bloco, unidade, situacao_mapa_disponibilidade')
        .range(from, from + PAGE_SIZE - 1);
      if (filters.empreendimento) q = q.ilike('nome_empreendimento', `%${filters.empreendimento}%`);
      if (filters.situacao) q = q.ilike('situacao', `%${filters.situacao}%`);
      if (filters.estado || filters.cidade) {
        // Para filtrar por estado/cidade, precisamos dos nomes dos empreendimentos
        // O filtro de estado/cidade é resolvido em fetchContextData antes de chamar esta função
      }

      const { data, error } = await q;
      if (error) throw new Error(`Erro estoque ${tableName}: ${error.message}`);
      allData = allData.concat(data || []);
      if ((data || []).length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return tipologiaTerms.length > 0
      ? allData.filter((row) => matchesTextTerms(row.tipologia, tipologiaTerms))
      : allData;
  }

  const [vcaData, lotearData] = await Promise.all([
    fetchEstoqueAll('estoque_cvcrm'),
    fetchEstoqueAll('estoque_lotear'),
  ]);

  function buildUnitDetails(rows) {
    return rows
      .sort((a, b) => {
        const empCompare = String(a.empreendimento || '').localeCompare(String(b.empreendimento || ''));
        if (empCompare !== 0) return empCompare;
        const blocoCompare = String(a.bloco || '').localeCompare(String(b.bloco || ''));
        if (blocoCompare !== 0) return blocoCompare;
        return String(a.unidade || '').localeCompare(String(b.unidade || ''));
      })
      .slice(0, 50)
      .map((row) => ({
        idunidade: row.idunidade,
        empreendimento: row.empreendimento,
        bloco: row.bloco,
        unidade: row.unidade,
        situacao: row.situacao,
        tipologia: row.tipologia,
        area_privativa: row.area_privativa,
        vagas_garagem: row.vagas_garagem,
        situacao_mapa_disponibilidade: row.situacao_mapa_disponibilidade,
      }));
  }

  function agregar(rows) {
    const porEmp = {};
    const porSituacao = {};
    for (const row of rows) {
      const emp = row.empreendimento || 'Não informado';
      const sit = row.situacao || 'Não informado';
      if (!porEmp[emp]) porEmp[emp] = {};
      porEmp[emp][sit] = (porEmp[emp][sit] || 0) + 1;
      porSituacao[sit] = (porSituacao[sit] || 0) + 1;
    }
    return {
      total: rows.length,
      por_situacao: porSituacao,
      filtros_aplicados: {
        empreendimento: filters.empreendimento || null,
        situacao: filters.situacao || null,
        tipologia: filters.tipologia || null,
        pavimento: filters.pavimento || null,
        termos_tipologia: tipologiaTerms,
      },
      unidades_encontradas: shouldReturnUnitDetails ? buildUnitDetails(rows) : undefined,
      por_empreendimento: Object.entries(porEmp)
        .sort((a, b) => Object.values(b[1]).reduce((s, v) => s + v, 0) - Object.values(a[1]).reduce((s, v) => s + v, 0))
        .map(([empreendimento, situacoes]) => ({ empreendimento, situacoes })),
    };
  }

  return {
    vca: { descricao: 'Base VCA (CVCRM)', ...agregar(vcaData) },
    lotear: { descricao: 'Base LOTEAR', ...agregar(lotearData) },
  };
}

async function fetchUnidadesComPrecoPorTipologia(filters = {}) {
  const tipologiaTerms = getTipologiaTerms(filters);
  if (!filters.empreendimento || tipologiaTerms.length === 0) {
    return null;
  }

  const estoque = await fetchEstoqueAgregado(filters);
  const unidadesEstoque = [
    ...(estoque.vca.unidades_encontradas || []).map((row) => ({ ...row, base: 'vca' })),
    ...(estoque.lotear.unidades_encontradas || []).map((row) => ({ ...row, base: 'lotear' })),
  ];

  if (unidadesEstoque.length === 0) {
    return {
      filtros_aplicados: {
        empreendimento: filters.empreendimento,
        situacao: filters.situacao || null,
        tipologia: filters.tipologia || null,
        pavimento: filters.pavimento || null,
        termos_tipologia: tipologiaTerms,
      },
      total_unidades_estoque: 0,
      total_unidades_com_preco: 0,
      unidade_mais_barata: null,
      unidades: [],
    };
  }

  async function fetchPrecos(tableName) {
    const PAGE_SIZE = 1000;
    let from = 0;
    let allData = [];

    while (true) {
      let q = supabase
        .from(tableName)
        .select('idunidade, empreendimento, bloco, unidade, area_privativa, valor_total, tabela')
        .range(from, from + PAGE_SIZE - 1);

      q = q.ilike('empreendimento', `%${filters.empreendimento}%`);

      const { data, error } = await q;
      if (error) throw new Error(`Erro ao buscar precos para cruzamento ${tableName}: ${error.message}`);
      allData = allData.concat(data || []);
      if ((data || []).length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return allData;
  }

  const [precosVca, precosLotear] = await Promise.all([
    fetchPrecos('tabela_de_preco_cvcrm'),
    fetchPrecos('tabela_de_preco_lotear'),
  ]);

  const priceById = new Map();
  const priceByKey = new Map();
  for (const row of [...precosVca, ...precosLotear]) {
    if (row.idunidade != null) priceById.set(String(row.idunidade), row);
    priceByKey.set(normalizeUnitKey(row), row);
  }

  const unidades = unidadesEstoque
    .map((row) => {
      const preco = row.idunidade != null
        ? priceById.get(String(row.idunidade)) || priceByKey.get(normalizeUnitKey(row))
        : priceByKey.get(normalizeUnitKey(row));

      return {
        empreendimento: row.empreendimento,
        bloco: row.bloco,
        unidade: row.unidade,
        situacao: row.situacao,
        tipologia: row.tipologia,
        area_privativa: preco?.area_privativa ?? row.area_privativa,
        valor_total: preco?.valor_total ?? null,
        tabela: preco?.tabela ?? null,
      };
    })
    .filter((row) => row.valor_total != null && row.valor_total > 0)
    .sort((a, b) => a.valor_total - b.valor_total);

  return {
    filtros_aplicados: {
      empreendimento: filters.empreendimento,
      situacao: filters.situacao || null,
      tipologia: filters.tipologia || null,
      pavimento: filters.pavimento || null,
      termos_tipologia: tipologiaTerms,
    },
    total_unidades_estoque: unidadesEstoque.length,
    total_unidades_com_preco: unidades.length,
    unidade_mais_barata: unidades[0] || null,
    unidades: unidades.slice(0, 20),
  };
}

async function fetchDistratosAgregado(filters = {}) {
  async function fetchDistratosAll(tableName) {
    const PAGE_SIZE = 1000;
    let from = 0;
    let allData = [];

    while (true) {
      let q = supabase
        .from(tableName)
        .select('empreendimento, situacao_atual, corretor, imobiliaria')
        .range(from, from + PAGE_SIZE - 1);
      if (filters.empreendimento) q = q.ilike('empreendimento', `%${filters.empreendimento}%`);
      if (filters.situacao) q = q.ilike('situacao_atual', `%${filters.situacao}%`);

      const { data, error } = await q;
      if (error) throw new Error(`Erro distratos ${tableName}: ${error.message}`);
      allData = allData.concat(data || []);
      if ((data || []).length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return allData;
  }

  const [vcaData, lotearData] = await Promise.all([
    fetchDistratosAll('distratos_cvcrm'),
    fetchDistratosAll('distratos_lotear'),
  ]);

  function agregar(rows) {
    const porEmp = {};
    const porSituacao = {};
    for (const row of rows) {
      const emp = row.empreendimento || 'Não informado';
      const sit = row.situacao_atual || 'Não informado';
      porEmp[emp] = (porEmp[emp] || 0) + 1;
      porSituacao[sit] = (porSituacao[sit] || 0) + 1;
    }
    return {
      total: rows.length,
      por_situacao: porSituacao,
      por_empreendimento: Object.entries(porEmp)
        .sort((a, b) => b[1] - a[1])
        .map(([empreendimento, total]) => ({ empreendimento, total })),
    };
  }

  return {
    vca: { descricao: 'Base VCA (CVCRM)', ...agregar(vcaData) },
    lotear: { descricao: 'Base LOTEAR', ...agregar(lotearData) },
  };
}

async function fetchTabelaPrecoAgregado(filters = {}) {
  // Se filtrar por estado ou cidade, resolve os nomes de empreendimentos das tabelas base
  let empreendimentoNamesVca = null;
  let empreendimentoNamesLotear = null;
  if (filters.estado || filters.cidade) {
    const applyGeoFilter = (q) => {
      if (filters.estado) q = q.ilike('estado', `%${filters.estado}%`);
      if (filters.cidade) q = q.ilike('cidade', `%${filters.cidade}%`);
      return q;
    };
    const [vcaEmps, lotearEmps] = await Promise.all([
      applyGeoFilter(supabase.from('empreendimentos_cvcrm').select('nome')),
      applyGeoFilter(supabase.from('empreendimentos_lotear').select('nome')),
    ]);
    empreendimentoNamesVca = (vcaEmps.data || []).map((e) => e.nome).filter(Boolean);
    empreendimentoNamesLotear = (lotearEmps.data || []).map((e) => e.nome).filter(Boolean);
  }

  async function fetchTabelaAll(tableName, empNamesFilter) {
    // Se filtro por geo retornou lista vazia para esta base, não consultar
    if (empNamesFilter !== null && empNamesFilter.length === 0) return [];

    const PAGE_SIZE = 1000;
    let from = 0;
    let allData = [];

    while (true) {
      let q = supabase
        .from(tableName)
        .select('empreendimento, bloco, unidade, area_privativa, valor_total, tabela')
        .range(from, from + PAGE_SIZE - 1);
      if (filters.empreendimento) q = q.ilike('empreendimento', `%${filters.empreendimento}%`);
      if (filters.unidade) q = q.ilike('unidade', `%${filters.unidade}%`);
      if (filters.bloco) q = q.ilike('bloco', `%${filters.bloco}%`);
      if (empNamesFilter && empNamesFilter.length > 0) q = q.in('empreendimento', empNamesFilter);

      const { data, error } = await q;
      if (error) throw new Error(`Erro tabela de preço ${tableName}: ${error.message}`);
      allData = allData.concat(data || []);
      if ((data || []).length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return allData;
  }

  const [vcaData, lotearData] = await Promise.all([
    fetchTabelaAll('tabela_de_preco_cvcrm', empreendimentoNamesVca),
    fetchTabelaAll('tabela_de_preco_lotear', empreendimentoNamesLotear),
  ]);

  function agregar(rows) {
    if (rows.length === 0) return { total_unidades: 0, por_empreendimento: [] };

    const porEmp = {};
    for (const row of rows) {
      const emp = row.empreendimento || 'Não informado';
      if (!porEmp[emp]) porEmp[emp] = { tabela: row.tabela, unidades: [] };
      porEmp[emp].unidades.push({
        bloco: row.bloco,
        unidade: row.unidade,
        area_privativa: row.area_privativa,
        valor_total: row.valor_total,
      });
    }

    const allValid = rows
      .filter((r) => r.valor_total != null && r.valor_total > 0)
      .sort((a, b) => a.valor_total - b.valor_total);

    const porEmpreendimento = Object.entries(porEmp)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([empreendimento, info]) => {
        const valid = info.unidades
          .filter((u) => u.valor_total != null && u.valor_total > 0)
          .sort((a, b) => a.valor_total - b.valor_total);
        const valores = valid.map((u) => u.valor_total);
        return {
          empreendimento,
          tabela: info.tabela,
          total_unidades: info.unidades.length,
          total_com_preco: valid.length,
          preco_minimo: valores.length > 0 ? valores[0] : null,
          preco_maximo: valores.length > 0 ? valores[valores.length - 1] : null,
          preco_medio: valores.length > 0 ? Math.round(valores.reduce((s, v) => s + v, 0) / valores.length) : null,
          menores_precos: valid.slice(0, 5).map((u) => ({
            bloco: u.bloco,
            unidade: u.unidade,
            area_privativa: u.area_privativa,
            valor_total: u.valor_total,
          })),
        };
      });

    return {
      total_unidades: rows.length,
      total_com_preco: allValid.length,
      unidade_mais_barata: allValid.length > 0
        ? {
            empreendimento: allValid[0].empreendimento,
            bloco: allValid[0].bloco,
            unidade: allValid[0].unidade,
            area_privativa: allValid[0].area_privativa,
            valor_total: allValid[0].valor_total,
          }
        : null,
      por_empreendimento: porEmpreendimento,
    };
  }

  return {
    vca: { descricao: 'Base VCA (CVCRM)', ...agregar(vcaData) },
    lotear: { descricao: 'Base LOTEAR', ...agregar(lotearData) },
  };
}

async function fetchContextData(intents, entities, options = {}) {
  const queryPlan = options.queryPlan || await buildQueryPlan({
    message: options.message || '',
    userRole: options.userRole,
    intents,
    entities,
  });

  return executePlan(queryPlan);
}

async function fetchLegacyContextData(intents, entities) {
  const intentList = Array.isArray(intents) ? intents : [intents];
  const context = {};

  const has = (i) => intentList.includes(i);

  if (has('empreendimentos') || has('unidades')) {
    context.empreendimentos = await fetchEmpreendimentos(entities);
    context.estoque = await fetchEstoqueAgregado(entities);
  }

  if (has('reservas') || has('clientes')) {
    context.vendas_por_base = await fetchVendasAgregadoPorBase();
    if (entities.empreendimento) {
      context.reservas_detalhadas = await fetchReservas(entities);
    }
  }

  if (has('estoque') && !context.estoque) {
    context.estoque = await fetchEstoqueAgregado(entities);
  }

  if (has('estoque') && has('tabela_preco')) {
    const unidadesComPreco = await fetchUnidadesComPrecoPorTipologia(entities);
    if (unidadesComPreco) {
      context.unidades_com_preco_filtradas = unidadesComPreco;
    }
  }

  if (has('distratos')) {
    context.distratos = await fetchDistratosAgregado(entities);
  }

  if (has('tabela_preco')) {
    context.tabela_de_preco = await fetchTabelaPrecoAgregado(entities);
  }

  if (has('geral')) {
    context.empreendimentos = await fetchEmpreendimentos({});
    context.vendas_por_base = await fetchVendasAgregadoPorBase({});
    context.estoque = await fetchEstoqueAgregado({});
    context.distratos = await fetchDistratosAgregado({});
    context.tabela_de_preco = await fetchTabelaPrecoAgregado({});
  }

  return context;
}

// --- Conversas e Mensagens ---

async function getConversations(userId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar conversas: ${error.message}`);
  return data;
}

async function getConversation(conversationId, userId) {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, user_id, created_at')
    .eq('id', conversationId)
    .single();

  if (error) throw new Error(`Conversa não encontrada`);

  // Validação de ownership no código (não RLS)
  if (data.user_id !== userId) {
    throw Object.assign(new Error('Acesso negado a esta conversa'), { status: 403 });
  }

  return data;
}

async function createConversation(userId, title) {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title: title || 'Nova conversa' })
    .select()
    .single();

  if (error) throw new Error(`Erro ao criar conversa: ${error.message}`);
  return data;
}

async function getMessages(conversationId, userId) {
  // Validar ownership primeiro
  await getConversation(conversationId, userId);

  const { data, error } = await supabase
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Erro ao buscar mensagens: ${error.message}`);
  return data;
}

async function saveMessage(conversationId, role, content) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content })
    .select()
    .single();

  if (error) throw new Error(`Erro ao salvar mensagem: ${error.message}`);

  // Atualizar timestamp da conversa
  await supabase
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  return data;
}

async function updateConversationTitle(conversationId, title) {
  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', conversationId);

  if (error) throw new Error(`Erro ao atualizar título: ${error.message}`);
}

// --- Contagem de mensagens diárias ---

async function incrementMessageCount(userId) {
  const today = new Date().toISOString().split('T')[0];

  const { data: user } = await supabase
    .from('users')
    .select('last_message_date, daily_message_count')
    .eq('id', userId)
    .single();

  const lastDate = user?.last_message_date
    ? new Date(user.last_message_date).toISOString().split('T')[0]
    : null;

  const newCount = lastDate === today ? (user.daily_message_count || 0) + 1 : 1;

  await supabase
    .from('users')
    .update({ daily_message_count: newCount, last_message_date: today })
    .eq('id', userId);

  return newCount;
}

module.exports = {
  fetchEmpreendimentos,
  fetchReservas,
  fetchReservasResumo,
  fetchVendasResumo,
  fetchTabelaPrecoAgregado,
  fetchContextData,
  getConversations,
  getConversation,
  createConversation,
  getMessages,
  saveMessage,
  updateConversationTitle,
  incrementMessageCount,
};
