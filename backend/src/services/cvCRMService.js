const supabase = require('../database/supabase');

const VENDAS_PAGE_SIZE = 500;

// Pausa entre chamadas à API para não sobrecarregar o servidor
const ESTOQUE_REQUEST_DELAY_MS = 350;
// Retry com backoff exponencial em caso de erro 500/429
const FETCH_MAX_RETRIES = 4;
const FETCH_RETRY_BASE_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const PARTIAL_SYNC_PAGE_COUNT = 5;
const DATA_SOURCES = [
  {
    key: 'cvcrm',
    label: 'VCA',
    baseUrl: 'https://vca.cvcrm.com.br/api/v1',
    emailEnv: 'CVCRM_EMAIL',
    tokenEnv: 'CVCRM_TOKEN',
    empreendimentoTableKey: 'empreendimentos_cvcrm',
    empreendimentoLabel: 'Empreendimentos VCA',
    empreendimentoTableName: 'empreendimentos_cvcrm',
    vendasTableKey: 'vendas_cvcrm',
    vendasLabel: 'Vendas VCA',
    vendasTableName: 'vendas_cvcrm',
    estoqueTableKey: 'estoque_cvcrm',
    estoqueLabel: 'Estoque VCA',
    estoqueTableName: 'estoque_cvcrm',
    distratosTableKey: 'distratos_cvcrm',
    distratosLabel: 'Distratos VCA',
    distratosTableName: 'distratos_cvcrm',
    tabelaPrecoTableKey: 'tabela_de_preco_cvcrm',
    tabelaPrecoLabel: 'Tabela de Preço VCA',
    tabelaPrecoTableName: 'tabela_de_preco_cvcrm',
  },
  {
    key: 'lotear',
    label: 'LOTEAR',
    baseUrl: 'https://vcalotear.cvcrm.com.br/api/v1',
    emailEnv: 'LOTEAR_EMAIL',
    tokenEnv: 'LOTEAR_TOKEN',
    empreendimentoTableKey: 'empreendimentos_lotear',
    empreendimentoLabel: 'Empreendimentos LOTEAR',
    empreendimentoTableName: 'empreendimentos_lotear',
    vendasTableKey: 'vendas_lotear',
    vendasLabel: 'Vendas LOTEAR',
    vendasTableName: 'vendas_lotear',
    estoqueTableKey: 'estoque_lotear',
    estoqueLabel: 'Estoque LOTEAR',
    estoqueTableName: 'estoque_lotear',
    distratosTableKey: 'distratos_lotear',
    distratosLabel: 'Distratos LOTEAR',
    distratosTableName: 'distratos_lotear',
    tabelaPrecoTableKey: 'tabela_de_preco_lotear',
    tabelaPrecoLabel: 'Tabela de Preço LOTEAR',
    tabelaPrecoTableName: 'tabela_de_preco_lotear',
  },
];

function assertSourceCredentials(source) {
  if (!process.env[source.emailEnv] || !process.env[source.tokenEnv]) {
    throw new Error(`${source.emailEnv} e ${source.tokenEnv} são obrigatórios para sincronização`);
  }
}

function getHeaders(source) {
  assertSourceCredentials(source);

  return {
    'Content-Type': 'application/json',
    email: process.env[source.emailEnv],
    token: process.env[source.tokenEnv],
  };
}

function normalizeArrayPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
}

async function fetchCvcrm(source, url, retries = FETCH_MAX_RETRIES) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const backoff = FETCH_RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(`[CVCRM] Tentativa ${attempt}/${retries} após ${backoff}ms — ${url}`);
      await sleep(backoff);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: getHeaders(source),
    });

    // Erros que vale re-tentar: sobrecarga/rate-limit do servidor
    if (response.status === 500 || response.status === 429 || response.status === 503) {
      lastError = new Error(`CVCRM API erro: ${response.status} ${response.statusText}`);
      continue;
    }

    if (!response.ok) {
      throw new Error(`CVCRM API erro: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  throw lastError;
}

function normalizePagedPayload(payload, entityName) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.dados)) {
    throw new Error(`Payload de ${entityName} da CVCRM em formato inválido`);
  }

  return {
    pagina: Number(payload.pagina) || 1,
    totalPaginas: Number(payload.total_de_paginas) || 1,
    totalRegistros: Number(payload.total_de_registros) || payload.dados.length,
    dados: payload.dados,
  };
}

async function fetchVendasPage(source, page) {
  const params = new URLSearchParams({
    pagina: String(page),
    registros_por_pagina: String(VENDAS_PAGE_SIZE),
  });

  const payload = await fetchCvcrm(source, `${source.baseUrl}/cvdw/vendas?${params.toString()}`);
  return normalizePagedPayload(payload, 'vendas');
}

function mapVendaRecord(item) {
  return {
    numero_reserva: String(item.idvenda || item.idreserva || item.numero_venda || item.referencia),
    tipo_de_venda: item.tipovenda || null,
    empreendimento: item.empreendimento || null,
    unidade: item.unidade != null ? String(item.unidade) : null,
    titular_nome: item.cliente || null,
    documento_cliente: item.documento_cliente || null,
    corretor: item.corretor || null,
    imobiliaria: item.imobiliaria || null,
    synced_at: new Date().toISOString(),
  };
}

async function upsertVendas(source, records) {
  if (records.length === 0) {
    return 0;
  }

  const { data, error } = await supabase
    .from(source.vendasTableName)
    .upsert(records, { onConflict: 'numero_reserva' })
    .select('numero_reserva');

  if (error) {
    throw new Error(`Erro ao salvar vendas: ${error.message}`);
  }

  return data?.length || 0;
}

function getEstimatedRemainingMs(startedAt, processedSteps, totalSteps) {
  if (!startedAt || processedSteps <= 0 || totalSteps <= processedSteps) {
    return 0;
  }

  const elapsedMs = Date.now() - startedAt;
  const averageMsPerStep = elapsedMs / processedSteps;
  return Math.max(0, Math.round((totalSteps - processedSteps) * averageMsPerStep));
}

function reportTableProgress(progress, tableKey, patch) {
  if (!progress || typeof progress !== 'function') {
    return;
  }

  progress(tableKey, patch);
}

async function syncEmpreendimentos(source, progress) {
  const startedAt = Date.now();
  reportTableProgress(progress, source.empreendimentoTableKey, {
    status: 'running',
    label: source.empreendimentoLabel,
    totalPages: 1,
    completedPages: 0,
    progressPercent: 0,
    estimatedRemainingMs: null,
    message: `Consultando a API de empreendimentos ${source.label}...`,
    startedAt: new Date(startedAt).toISOString(),
  });

  const payload = await fetchCvcrm(source, `${source.baseUrl}/cvbot/empreendimentos`);
  const data = normalizeArrayPayload(payload);

  const records = data.map((item) => ({
    id_empreendimento: item.idempreendimento,
    nome: item.nome,
    endereco: item.endereco,
    cidade: item.cidade,
    estado: item.estado,
    data_entrega: item.data_entrega,
    situacao_obra: item.situacao_obra,
    quantidade_unidades_disponiveis: item.quantidade_unidades_disponiveis || 0,
    synced_at: new Date().toISOString(),
  }));

  // Upsert no banco
  const { data: result, error } = await supabase
    .from(source.empreendimentoTableName)
    .upsert(records, { onConflict: 'id_empreendimento' })
    .select();

  if (error) throw new Error(`Erro ao salvar empreendimentos: ${error.message}`);

  console.log(`[Sync] ${records.length} empreendimentos sincronizados (${source.label})`);
  reportTableProgress(progress, source.empreendimentoTableKey, {
    status: 'completed',
    totalPages: 1,
    completedPages: 1,
    progressPercent: 100,
    estimatedRemainingMs: 0,
    message: `Empreendimentos ${source.label} sincronizados.`,
    updatedRecords: result.length,
    completedAt: new Date().toISOString(),
  });

  return {
    table: source.empreendimentoTableKey,
    updatedRecords: result.length,
    totalPages: 1,
    completedPages: 1,
  };
}

async function syncVendas(source, mode = 'total', progress) {
  const syncMode = mode === 'partial' ? 'partial' : 'total';
  const startedAt = Date.now();

  reportTableProgress(progress, source.vendasTableKey, {
    status: 'running',
    label: source.vendasLabel,
    totalPages: 0,
    completedPages: 0,
    progressPercent: 0,
    estimatedRemainingMs: null,
    message: `Consultando a primeira página da API de vendas ${source.label}...`,
    startedAt: new Date(startedAt).toISOString(),
  });

  const firstPage = await fetchVendasPage(source, 1);
  const paginaInicial = syncMode === 'partial'
    ? Math.max(1, firstPage.totalPaginas - PARTIAL_SYNC_PAGE_COUNT + 1)
    : 1;
  const paginaFinal = firstPage.totalPaginas;
  const totalPagesToProcess = Math.max(0, paginaFinal - paginaInicial + 1);

  let paginasProcessadas = 0;
  let vendasAtualizadas = 0;

  reportTableProgress(progress, source.vendasTableKey, {
    totalPages: totalPagesToProcess,
    completedPages: 0,
    progressPercent: 0,
    estimatedRemainingMs: null,
    message: `Sincronizando páginas ${paginaInicial} até ${paginaFinal} de ${source.label}...`,
    pageRange: { start: paginaInicial, end: paginaFinal },
    totalRegistrosCvcrm: firstPage.totalRegistros,
  });

  for (let pagina = paginaInicial; pagina <= paginaFinal; pagina += 1) {
    const currentPage = pagina === 1 && paginaInicial === 1 ? firstPage : await fetchVendasPage(source, pagina);
    const records = currentPage.dados
      .filter((item) => item && (item.idvenda != null || item.idreserva != null || item.numero_venda != null || item.referencia != null))
      .map(mapVendaRecord);

    vendasAtualizadas += await upsertVendas(source, records);
    paginasProcessadas += 1;

    const progressPercent = totalPagesToProcess === 0
      ? 100
      : Math.round((paginasProcessadas / totalPagesToProcess) * 100);

    reportTableProgress(progress, source.vendasTableKey, {
      totalPages: totalPagesToProcess,
      completedPages: paginasProcessadas,
      progressPercent,
      estimatedRemainingMs: getEstimatedRemainingMs(startedAt, paginasProcessadas, totalPagesToProcess),
      message: `Página ${pagina} de ${paginaFinal} sincronizada em ${source.label}.`,
      currentPage: pagina,
      updatedRecords: vendasAtualizadas,
    });
  }

  console.log(
    `[Sync] ${vendasAtualizadas} vendas sincronizadas (${source.label}, ${syncMode}) em ${paginasProcessadas} página(s)`
  );

  reportTableProgress(progress, source.vendasTableKey, {
    status: 'completed',
    totalPages: totalPagesToProcess,
    completedPages: paginasProcessadas,
    progressPercent: 100,
    estimatedRemainingMs: 0,
    message: `Vendas ${source.label} sincronizadas.`,
    updatedRecords: vendasAtualizadas,
    completedAt: new Date().toISOString(),
  });

  return {
    table: source.vendasTableKey,
    paginaInicial,
    paginaFinal,
    paginasProcessadas,
    totalPaginas: firstPage.totalPaginas,
    totalRegistrosCvcrm: firstPage.totalRegistros,
    updatedRecords: vendasAtualizadas,
  };
}

// ─── Estoque (Unidades via /cvdw/unidades) ────────────────────────────────────

const SITUACAO_MAPA = {
  1: 'Disponível',
  2: 'Reservada',
  3: 'Vendida',
  4: 'Bloqueada',
  5: 'Em processo de reserva',
};

async function fetchEstoquePage(source, page) {
  const params = new URLSearchParams({ pagina: String(page), registros_por_pagina: '500' });
  const payload = await fetchCvcrm(source, `${source.baseUrl}/cvdw/unidades?${params.toString()}`);
  return normalizePagedPayload(payload, 'estoque');
}

function mapEstoqueRecord(item) {
  const situacaoId = item.situacao_mapa_disponibilidade != null ? Number(item.situacao_mapa_disponibilidade) : null;
  return {
    idunidade: Number(item.idunidade),
    idempreendimento: item.idempreendimento != null ? Number(item.idempreendimento) : null,
    nome_empreendimento: item.nome_empreendimento || null,
    tipo_empreendimento: item.tipo_empreendimento || null,
    etapa: item.etapa || null,
    bloco: item.bloco || null,
    unidade: item.nome != null ? String(item.nome) : null,
    area_privativa: item.area_privativa != null ? Number(item.area_privativa) : null,
    tipologia: item.tipologia || null,
    vagas_garagem: item.vagas_garagem != null ? String(item.vagas_garagem) : null,
    situacao_mapa_disponibilidade: situacaoId,
    situacao: situacaoId != null ? (SITUACAO_MAPA[situacaoId] || null) : null,
    synced_at: new Date().toISOString(),
  };
}

async function upsertEstoque(source, records) {
  if (records.length === 0) return 0;
  const { data, error } = await supabase
    .from(source.estoqueTableName)
    .upsert(records, { onConflict: 'idunidade' })
    .select('idunidade');
  if (error) throw new Error(`Erro ao salvar estoque: ${error.message}`);
  return data?.length || 0;
}

async function getEmpreendimentoIds(source) {
  // Consulta direto na API — mesma rota que alimenta as tabelas empreendimentos_cvcrm/lotear.
  const payload = await fetchCvcrm(source, `${source.baseUrl}/cvbot/empreendimentos`);
  const data = normalizeArrayPayload(payload);
  const ids = data
    .map((item) => item.idempreendimento)
    .filter((id) => id != null);
  console.log(`[Sync] ${ids.length} empreendimentos encontrados na API ${source.label}.`);
  return ids;
}

async function getEmpreendimentoIdsForTabelaPreco(source) {
  // Usa /cadastros/empreendimentos conforme fluxo correto da tabela de preço
  const payload = await fetchCvcrm(source, `${source.baseUrl}/cadastros/empreendimentos`);
  const data = normalizeArrayPayload(payload);
  const ids = data
    .map((item) => item.idempreendimento)
    .filter((id) => id != null);
  console.log(`[Sync] ${ids.length} empreendimentos encontrados via /cadastros/empreendimentos (${source.label}) para tabela de preço.`);
  return ids;
}

async function syncEstoque(source, progress) {
  const startedAt = Date.now();
  reportTableProgress(progress, source.estoqueTableKey, {
    status: 'running',
    label: source.estoqueLabel,
    totalPages: 0,
    completedPages: 0,
    progressPercent: 0,
    estimatedRemainingMs: null,
    message: `Consultando primeira página do estoque ${source.label}...`,
    startedAt: new Date(startedAt).toISOString(),
  });

  const firstPage = await fetchEstoquePage(source, 1);
  const totalPaginas = firstPage.totalPaginas;

  reportTableProgress(progress, source.estoqueTableKey, {
    totalPages: totalPaginas,
    totalRegistrosCvcrm: firstPage.totalRegistros,
    message: `Sincronizando ${totalPaginas} páginas de estoque ${source.label}...`,
    pageRange: { start: 1, end: totalPaginas },
  });

  let paginasProcessadas = 0;
  let totalUpserted = 0;

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    try {
      if (pagina > 1) await sleep(ESTOQUE_REQUEST_DELAY_MS);
      const currentPage = pagina === 1 ? firstPage : await fetchEstoquePage(source, pagina);
      const records = currentPage.dados
        .filter((item) => item && item.idunidade != null)
        .map(mapEstoqueRecord);
      totalUpserted += await upsertEstoque(source, records);
    } catch (err) {
      console.warn(`[Sync] Estoque página ${pagina} (${source.label}) ignorada: ${err.message}`);
    }
    paginasProcessadas += 1;
    reportTableProgress(progress, source.estoqueTableKey, {
      completedPages: paginasProcessadas,
      progressPercent: Math.round((paginasProcessadas / totalPaginas) * 100),
      estimatedRemainingMs: getEstimatedRemainingMs(startedAt, paginasProcessadas, totalPaginas),
      message: `Estoque: página ${pagina}/${totalPaginas} ${source.label} sincronizada.`,
      updatedRecords: totalUpserted,
    });
  }

  console.log(`[Sync] ${totalUpserted} unidades de estoque sincronizadas (${source.label})`);
  reportTableProgress(progress, source.estoqueTableKey, {
    status: 'completed',
    completedPages: totalPaginas,
    progressPercent: 100,
    estimatedRemainingMs: 0,
    message: `Estoque ${source.label} sincronizado.`,
    updatedRecords: totalUpserted,
    completedAt: new Date().toISOString(),
  });

  return { table: source.estoqueTableKey, updatedRecords: totalUpserted, totalPages: totalPaginas, completedPages: totalPaginas };
}

// ─── Distratos ────────────────────────────────────────────────────────────────

async function fetchDistratosPage(source, page) {
  const params = new URLSearchParams({ pagina: String(page), registros_por_pagina: '500' });
  const payload = await fetchCvcrm(source, `${source.baseUrl}/cvdw/distratos?${params.toString()}`);
  return normalizePagedPayload(payload, 'distratos');
}

function mapDistratosRecord(item) {
  return {
    id_distrato: String(item.referencia),
    id_reserva: item.idreserva ? Number(item.idreserva) : null,
    situacao_atual: item.situacao_atual || null,
    empreendimento: item.empreendimento || null,
    etapa: item.etapa || null,
    bloco: item.bloco || null,
    unidade: item.unidade != null ? String(item.unidade) : null,
    corretor: item.corretor || null,
    imobiliaria: item.imobiliaria || null,
    synced_at: new Date().toISOString(),
  };
}

async function upsertDistratos(source, records) {
  if (records.length === 0) return 0;
  const { data, error } = await supabase
    .from(source.distratosTableName)
    .upsert(records, { onConflict: 'id_distrato' })
    .select('id_distrato');
  if (error) throw new Error(`Erro ao salvar distratos: ${error.message}`);
  return data?.length || 0;
}

async function syncDistratos(source, progress) {
  const startedAt = Date.now();
  reportTableProgress(progress, source.distratosTableKey, {
    status: 'running',
    label: source.distratosLabel,
    totalPages: 0,
    completedPages: 0,
    progressPercent: 0,
    estimatedRemainingMs: null,
    message: `Consultando primeira página de distratos ${source.label}...`,
    startedAt: new Date(startedAt).toISOString(),
  });

  const firstPage = await fetchDistratosPage(source, 1);
  const totalPaginas = firstPage.totalPaginas;

  reportTableProgress(progress, source.distratosTableKey, {
    totalPages: totalPaginas,
    totalRegistrosCvcrm: firstPage.totalRegistros,
    message: `Sincronizando ${totalPaginas} páginas de distratos ${source.label}...`,
    pageRange: { start: 1, end: totalPaginas },
  });

  let paginasProcessadas = 0;
  let distratosAtualizados = 0;

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    const currentPage = pagina === 1 ? firstPage : await fetchDistratosPage(source, pagina);
    const records = currentPage.dados
      .filter((item) => item && item.referencia != null)
      .map(mapDistratosRecord);
    distratosAtualizados += await upsertDistratos(source, records);
    paginasProcessadas += 1;
    const progressPercent = Math.round((paginasProcessadas / totalPaginas) * 100);
    reportTableProgress(progress, source.distratosTableKey, {
      completedPages: paginasProcessadas,
      progressPercent,
      estimatedRemainingMs: getEstimatedRemainingMs(startedAt, paginasProcessadas, totalPaginas),
      message: `Distratos: página ${pagina}/${totalPaginas} em ${source.label}.`,
      currentPage: pagina,
      updatedRecords: distratosAtualizados,
    });
  }

  console.log(`[Sync] ${distratosAtualizados} distratos sincronizados (${source.label})`);
  reportTableProgress(progress, source.distratosTableKey, {
    status: 'completed',
    completedPages: totalPaginas,
    progressPercent: 100,
    estimatedRemainingMs: 0,
    message: `Distratos ${source.label} sincronizados.`,
    updatedRecords: distratosAtualizados,
    completedAt: new Date().toISOString(),
  });

  return {
    table: source.distratosTableKey,
    updatedRecords: distratosAtualizados,
    totalPages: totalPaginas,
    completedPages: paginasProcessadas,
    totalRegistrosCvcrm: firstPage.totalRegistros,
  };
}

// ─── Tabela de Preço ─────────────────────────────────────────────────────────

/**
 * Busca as tabelas de preço de um empreendimento e retorna a mais atual com aprovado = 'S'.
 * Critério: aprovado === 'S', data_vigencia_de mais recente.
 */
async function fetchTabelaAtiva(source, idempreendimento) {
  const url = `${source.baseUrl}/cadastros/empreendimentos/${idempreendimento}/tabelasdepreco`;
  const payload = await fetchCvcrm(source, url, 1);
  const lista = Array.isArray(payload) ? payload : [];

  const aprovadas = lista.filter((t) => t.aprovado === 'S');
  if (aprovadas.length === 0) return null;

  // A mais atual = maior data_vigencia_de
  aprovadas.sort((a, b) => {
    const da = a.data_vigencia_de || '';
    const db = b.data_vigencia_de || '';
    return db.localeCompare(da);
  });

  return aprovadas[0];
}

/**
 * Busca os detalhes (unidades + preços) de uma tabela específica.
 */
async function fetchTabelaDetalhe(source, idempreendimento, idtabela) {
  const url = `${source.baseUrl}/cv/tabelasdepreco?idempreendimento=${idempreendimento}&idtabela=${idtabela}`;
  return fetchCvcrm(source, url, 1);
}

function mapTabelaPrecoRecord(item, tabela, idempreendimentoFallback) {
  return {
    idtabela: Number(tabela.idtabela),
    idempreendimento: tabela.idempreendimento != null ? Number(tabela.idempreendimento) : Number(idempreendimentoFallback),
    idunidade: item.idunidade != null ? Number(item.idunidade) : null,
    empreendimento: tabela.empreendimento || null,
    tabela: tabela.tabela || null,
    bloco: item.bloco || null,
    unidade: String(item.unidade),
    area_privativa: item.area_privativa != null ? Number(item.area_privativa) : null,
    valor_total: item.valor_total != null ? Number(item.valor_total) : null,
    synced_at: new Date().toISOString(),
  };
}

async function upsertTabelaPreco(source, records) {
  if (records.length === 0) return 0;
  const { data, error } = await supabase
    .from(source.tabelaPrecoTableName)
    .upsert(records, { onConflict: 'idtabela,unidade,bloco' })
    .select('id');
  if (error) throw new Error(`Erro ao salvar tabela de preço: ${error.message}`);
  return data?.length || 0;
}

async function syncTabelaPreco(source, progress) {
  const startedAt = Date.now();
  reportTableProgress(progress, source.tabelaPrecoTableKey, {
    status: 'running',
    label: source.tabelaPrecoLabel,
    totalPages: 0,
    completedPages: 0,
    progressPercent: 0,
    estimatedRemainingMs: null,
    message: `Buscando empreendimentos para tabela de preço ${source.label}...`,
    startedAt: new Date(startedAt).toISOString(),
  });

  const ids = await getEmpreendimentoIdsForTabelaPreco(source);
  const total = ids.length;
  let processed = 0;
  let totalUpserted = 0;

  reportTableProgress(progress, source.tabelaPrecoTableKey, {
    totalPages: total,
    message: `Sincronizando tabela de preço de ${total} empreendimentos ${source.label}...`,
  });

  for (const idempreendimento of ids) {
    try {
      if (processed > 0) await sleep(ESTOQUE_REQUEST_DELAY_MS);

      const tabelaAtiva = await fetchTabelaAtiva(source, idempreendimento);
      if (!tabelaAtiva) {
        console.log(`[Sync] Empreendimento ${idempreendimento} (${source.label}): nenhuma tabela de preço ativa.`);
      } else {
        await sleep(ESTOQUE_REQUEST_DELAY_MS);
        const detalhe = await fetchTabelaDetalhe(source, idempreendimento, tabelaAtiva.idtabela);

        // DEBUG: log da primeira iteração com tabela ativa para inspecionar estrutura real do detalhe
        if (processed === 0) {
          const detalheItem = Array.isArray(detalhe) ? detalhe[0] : detalhe;
          console.log(`[DEBUG] tabelaDetalhe keys (emp ${idempreendimento}, tabela ${tabelaAtiva.idtabela}):`, JSON.stringify(Object.keys(detalheItem || {})));
          console.log(`[DEBUG] tabelaDetalhe raw:`, JSON.stringify(detalhe).slice(0, 1500));
        }

        // A resposta pode ser um array ou objeto — normaliza e busca a chave de unidades
        const detalheItem = Array.isArray(detalhe) ? detalhe[0] : detalhe;
        const unidades = Array.isArray(detalheItem?.unidades)
          ? detalheItem.unidades
          : Array.isArray(detalheItem?.dados)
            ? detalheItem.dados
            : Array.isArray(detalheItem?.lotes)
              ? detalheItem.lotes
              : [];

        const records = unidades
          .filter((u) => u && u.unidade != null)
          .map((u) => mapTabelaPrecoRecord(u, tabelaAtiva, idempreendimento));
        totalUpserted += await upsertTabelaPreco(source, records);
      }
    } catch (err) {
      console.warn(`[Sync] Tabela de preço empreendimento ${idempreendimento} (${source.label}) ignorado: ${err.message}`);
    }

    processed += 1;
    reportTableProgress(progress, source.tabelaPrecoTableKey, {
      completedPages: processed,
      progressPercent: Math.round((processed / total) * 100),
      estimatedRemainingMs: getEstimatedRemainingMs(startedAt, processed, total),
      message: `Tabela de preço: ${processed}/${total} empreendimentos ${source.label}.`,
      updatedRecords: totalUpserted,
    });
  }

  console.log(`[Sync] ${totalUpserted} unidades de tabela de preço sincronizadas (${source.label})`);
  reportTableProgress(progress, source.tabelaPrecoTableKey, {
    status: 'completed',
    completedPages: total,
    progressPercent: 100,
    estimatedRemainingMs: 0,
    message: `Tabela de preço ${source.label} sincronizada.`,
    updatedRecords: totalUpserted,
    completedAt: new Date().toISOString(),
  });

  return { table: source.tabelaPrecoTableKey, updatedRecords: totalUpserted, totalPages: total, completedPages: total };
}

async function syncAll(mode = 'total', progress) {  const syncMode = mode === 'partial' ? 'partial' : 'total';
  const tables = {};
  let totalUpdatedRecords = 0;

  for (const source of DATA_SOURCES) {
    const empreendimentos = await syncEmpreendimentos(source, progress);
    const vendas = await syncVendas(source, syncMode, progress);
    const estoque = await syncEstoque(source, progress);
    const distratos = await syncDistratos(source, progress);
    const tabelaPreco = await syncTabelaPreco(source, progress);
    tables[source.empreendimentoTableKey] = empreendimentos;
    tables[source.vendasTableKey] = vendas;
    tables[source.estoqueTableKey] = estoque;
    tables[source.distratosTableKey] = distratos;
    tables[source.tabelaPrecoTableKey] = tabelaPreco;
    totalUpdatedRecords += empreendimentos.updatedRecords + vendas.updatedRecords + estoque.updatedRecords + distratos.updatedRecords + tabelaPreco.updatedRecords;
  }

  return { mode: syncMode, tables, totalUpdatedRecords };
}

// Returns an execution plan array based on the requested scope
function getScopedPlan(scope) {
  const allSteps = DATA_SOURCES.flatMap((source) => [
    { source, type: 'empreendimentos' },
    { source, type: 'vendas' },
    { source, type: 'estoque' },
    { source, type: 'distratos' },
    { source, type: 'tabela_preco' },
  ]);

  switch (scope) {
    case 'all':
      return allSteps;
    case 'source:cvcrm':
      return allSteps.filter((s) => s.source.key === 'cvcrm');
    case 'source:lotear':
      return allSteps.filter((s) => s.source.key === 'lotear');
    case 'table:empreendimentos_cvcrm':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'cvcrm'), type: 'empreendimentos' }];
    case 'table:vendas_cvcrm':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'cvcrm'), type: 'vendas' }];
    case 'table:empreendimentos_lotear':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'lotear'), type: 'empreendimentos' }];
    case 'table:vendas_lotear':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'lotear'), type: 'vendas' }];
    case 'table:estoque_cvcrm':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'cvcrm'), type: 'estoque' }];
    case 'table:estoque_lotear':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'lotear'), type: 'estoque' }];
    case 'table:distratos_cvcrm':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'cvcrm'), type: 'distratos' }];
    case 'table:distratos_lotear':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'lotear'), type: 'distratos' }];
    case 'table:tabela_de_preco_cvcrm':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'cvcrm'), type: 'tabela_preco' }];
    case 'table:tabela_de_preco_lotear':
      return [{ source: DATA_SOURCES.find((s) => s.key === 'lotear'), type: 'tabela_preco' }];
    default:
      return allSteps;
  }
}

// Returns [tableKey, label] pairs for all steps in a plan (for job creation)
function getPlanTableDefinitions(plan) {
  return plan.map((step) => {
    switch (step.type) {
      case 'empreendimentos':
        return [step.source.empreendimentoTableKey, step.source.empreendimentoLabel];
      case 'estoque':
        return [step.source.estoqueTableKey, step.source.estoqueLabel];
      case 'distratos':
        return [step.source.distratosTableKey, step.source.distratosLabel];
      case 'tabela_preco':
        return [step.source.tabelaPrecoTableKey, step.source.tabelaPrecoLabel];
      default:
        return [step.source.vendasTableKey, step.source.vendasLabel];
    }
  });
}

async function syncScoped(scope, mode, progress) {
  const syncMode = mode === 'partial' ? 'partial' : 'total';
  const plan = getScopedPlan(scope);
  const tables = {};
  let totalUpdatedRecords = 0;

  for (const step of plan) {
    let result;
    if (step.type === 'empreendimentos') {
      result = await syncEmpreendimentos(step.source, progress);
      tables[step.source.empreendimentoTableKey] = result;
    } else if (step.type === 'estoque') {
      result = await syncEstoque(step.source, progress);
      tables[step.source.estoqueTableKey] = result;
    } else if (step.type === 'distratos') {
      result = await syncDistratos(step.source, progress);
      tables[step.source.distratosTableKey] = result;
    } else if (step.type === 'tabela_preco') {
      result = await syncTabelaPreco(step.source, progress);
      tables[step.source.tabelaPrecoTableKey] = result;
    } else {
      result = await syncVendas(step.source, syncMode, progress);
      tables[step.source.vendasTableKey] = result;
    }
    totalUpdatedRecords += result.updatedRecords;
  }

  return { mode: syncMode, scope, tables, totalUpdatedRecords };
}

module.exports = { syncEmpreendimentos, syncVendas, syncEstoque, syncDistratos, syncTabelaPreco, syncAll, syncScoped, getScopedPlan, getPlanTableDefinitions, DATA_SOURCES };
