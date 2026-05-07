const { BUSINESS_CATALOG } = require('./businessCatalog');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasAny(normalizedMessage, terms) {
  return terms.some((term) => normalizedMessage.includes(normalizeText(term)));
}

function hasIntent(intents, intent) {
  return Array.isArray(intents) && intents.includes(intent);
}

function hasEntity(entities, key) {
  return entities && entities[key] != null && String(entities[key]).trim() !== '';
}

function collectPermissions(planId) {
  const catalogPermissions = BUSINESS_CATALOG.permissions;
  const map = {
    action_not_supported: [],
    cheapest_unit_by_typology: [...catalogPermissions.estoque, ...catalogPermissions.tabela_preco],
    cheapest_projects_by_price: catalogPermissions.tabela_preco,
    cheapest_project_by_base: catalogPermissions.tabela_preco,
    unit_typology_lookup: catalogPermissions.estoque,
    composite_query: catalogPermissions.geral,
    stock_by_project: catalogPermissions.estoque,
    price_by_project: catalogPermissions.tabela_preco,
    sales_by_project: catalogPermissions.vendas,
    cancellations_by_project: catalogPermissions.distratos,
    leads_summary: catalogPermissions.leads,
    precadastros_summary: catalogPermissions.precadastros,
    general_commercial_overview: catalogPermissions.geral,
    not_answerable: [],
  };

  return [...new Set(map[planId] || catalogPermissions.geral)];
}

function buildPlan(planId, message, entities, confidence, missingFields = []) {
  return {
    planId,
    requiredPermissions: collectPermissions(planId),
    missingFields,
    confidence,
    executionSpec: {
      message,
      filters: entities || {},
    },
  };
}

function buildSemanticPlan(message, executionSpec, confidence = 0.9) {
  return {
    planId: 'semantic_aggregate',
    requiredPermissions: collectPermissions('sales_by_project'),
    missingFields: [],
    confidence,
    executionSpec: {
      message,
      tables: ['vw_Vendas_Consolidada'],
      filters: [],
      groupBy: [],
      metric: { function: 'count' },
      order: { by: 'metric', direction: 'desc' },
      limit: 10,
      outputType: 'summary',
      ...executionSpec,
    },
  };
}

function splitQuestionItems(message) {
  return String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((line) => line.length > 8 && !/^diga pra mim qual/i.test(line));
}

function parseUnitReference(message) {
  const normalized = normalizeText(message).toUpperCase();
  const match = normalized.match(/\b(BL(?:OCO)?\s*\d+)\s*-\s*(APT\s*\d+|\d+)\b/i);
  if (!match) return {};
  return {
    bloco: match[1].replace(/\s+/g, ' ').replace(/^BLOCO/i, 'BL').trim(),
    unidade: `${match[1].replace(/\s+/g, '').replace(/^BLOCO/i, 'BL')} - ${match[2].replace(/\s+/g, ' ').trim()}`,
  };
}

function parseBlockFromMessage(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/\b(?:bloco|bl|torre)\s*([a-z0-9-]+)\b/);
  if (!match) return null;
  return match[1].toUpperCase();
}

function parseBaseFromMessage(message) {
  const normalized = normalizeText(message);
  if (/\bbase\s+vca\b|\bfonte\s+vca\b|\bvca\b|\bcvcrm\b/.test(normalized)) return 'vca';
  if (/\bbase\s+lotear\b|\bfonte\s+lotear\b|\blotear\b/.test(normalized)) return 'lotear';
  return null;
}

function canonicalProjectName(value) {
  if (!value) return null;
  const normalized = normalizeText(value);
  if (normalized.includes('uni ville')) return 'UNI VILLE RESIDENCIAL';
  return String(value).trim();
}

function cleanProjectCandidate(candidate) {
  const cleaned = String(candidate || '')
    .replace(/\bcom\s+unidades?\s+(?:distratadas?|canceladas?).*$/i, '')
    .replace(/\b(?:atualmente|hoje|agora)\b.*$/i, '')
    .trim()
    .replace(/[?.:,;]+$/, '');
  if (!cleaned) return null;
  if (/^(?:base|fonte|vca|cvcrm|lotear|bloco|bl|torre|unidade|apto|apartamento|vgv)\b/i.test(cleaned)) return null;
  return canonicalProjectName(cleaned);
}

function isPhraseMistakenAsProject(value) {
  const normalized = normalizeText(value);
  if (/^(?:bloco|bl|torre|unidade|apto|apartamento)\s*[a-z0-9-]+\b/.test(normalized)) return true;
  return /^(?:base|fonte)\s+(?:vca|cvcrm|lotear)\b/.test(normalized)
    || /^(?:vca|cvcrm|lotear)(?:\s+(?:nos?|nós)?\s*temos|\s+hoje|\s+atual)/.test(normalized);
}

function sanitizeEntitiesForPlanning(message, entities = {}) {
  const inferredBase = parseBaseFromMessage(message);
  const sanitized = { ...entities };

  if (isPhraseMistakenAsProject(sanitized.empreendimento)) {
    delete sanitized.empreendimento;
  }

  if (inferredBase && !sanitized.base) {
    sanitized.base = inferredBase;
  }

  if (sanitized.empreendimento) {
    sanitized.empreendimento = canonicalProjectName(sanitized.empreendimento);
  }

  return sanitized;
}

function extractConversationContext(conversationHistory = []) {
  let latestBase = null;
  let latestCancellationScope = false;
  let latestVgvScope = false;
  let latestVgvGroupBy = null;
  const history = Array.isArray(conversationHistory) ? [...conversationHistory].reverse() : [];

  for (const message of history) {
    const content = message?.content || '';
    if (!content) continue;

    if (!latestCancellationScope && isCancellationContextMessage(content)) latestCancellationScope = true;
    if (!latestVgvScope && isVgvContextMessage(content)) {
      latestVgvScope = true;
      if (hasAny(normalizeText(content), ['empreendimento', 'empreendimentos', 'obra', 'projeto'])) {
        latestVgvGroupBy = 'empreendimento';
      }
    }
    const project = extractProjectFromMessage(content);
    const base = parseBaseFromMessage(content);
    const block = parseBlockFromMessage(content);
    if (project) {
      return {
        empreendimento: project,
        ...(base ? { base } : {}),
        ...(block ? { bloco: block } : {}),
        ...(latestCancellationScope ? { cancellationFollowUp: true } : {}),
        ...(latestVgvScope ? { vgvFollowUp: true } : {}),
        ...(latestVgvGroupBy ? { vgvGroupBy: latestVgvGroupBy } : {}),
      };
    }

    if (!latestBase && base) latestBase = base;
  }

  return {
    ...(latestBase ? { base: latestBase } : {}),
    ...(latestCancellationScope ? { cancellationFollowUp: true } : {}),
    ...(latestVgvScope ? { vgvFollowUp: true } : {}),
    ...(latestVgvGroupBy ? { vgvGroupBy: latestVgvGroupBy } : {}),
  };
}

function shouldInheritConversationScope(message, entities = {}) {
  const normalized = normalizeText(message);
  const hasLocalScope = hasEntity(entities, 'empreendimento') || hasEntity(entities, 'base');
  const isScopedFollowUp = /\bbloco\b|\bbl\b|\btorre\b|\bunidades?\b|\bapto\b|\bapartamentos?\b|\betapa\b/.test(normalized);
  const isReferentialFollowUp = /\b(?:ess|dess)(?:e|a|es|as)\b|\bdesse\s+empreendimento\b|\bnesse\s+periodo\b|\bnesse\s+mes\b|\bnessa\s+base\b|\bdos\s+\d+\b/.test(normalized);
  const isExplanationFollowUp = /\bpor\s+que\b|\bporque\b|\bpor\s+qual\s+motivo\b|\bcomo\s+chegou\b|\bde\s+onde\b|\bexplica\b|\bexplique\b/.test(normalized);
  const isVgvStatusChoice = isVgvStatusChoiceMessage(message);
  const isCommercialQuestion = /\bvendas?\b|\bcompras?\b|\bcompraram\b|\bcomprad(?:or|ores|ora|oras)\b|\bclientes?\b|\breservas?\b|\bcontratos?\b|\bdistratos?\b|\bcancelamentos?\b|\bvgv\b|\bvalor\b|\brenda\b|\bmotivos?\b|\bquem\s+vendeu\b|\btipo\s+de\s+venda\b|\bso\b|\bsomente\b|\bapenas\b/.test(normalized);
  return !hasLocalScope && (((isScopedFollowUp || isReferentialFollowUp || isVgvStatusChoice) && isCommercialQuestion) || isExplanationFollowUp);
}

function asksBuyerUnitListQuestion(message) {
  const normalized = normalizeText(message);
  const asksUnits = /\bunidades?\b|\bapartamentos?\b|\baptos?\b/.test(normalized);
  const asksBuyers = /\bclientes?\b|\bcomprad(?:or|ores|ora|oras)\b|\bcompraram\b|\btitulares?\b|\bnomes?\b/.test(normalized);
  return asksUnits && asksBuyers;
}

function recentHistoryAskedBuyerUnitList(conversationHistory = []) {
  const history = Array.isArray(conversationHistory) ? [...conversationHistory].reverse() : [];
  return history.slice(0, 6).some((message) => asksBuyerUnitListQuestion(message?.content || ''));
}

function isCancellationContextMessage(message) {
  return /\bdistratos?\b|\bcancelamentos?\b|\bcancelad[ao]s?\b|\brescis(?:ao|oes)\b|\binativ[ao]s?\b/.test(normalizeText(message));
}

function isVgvContextMessage(message) {
  return /\bvgv\b|\bvalor\s+financeiro\b|\btotal\s+financeiro\b/.test(normalizeText(message));
}

function isVgvStatusChoiceMessage(message) {
  const normalized = normalizeText(message);
  return /\bativas?\b|\bso\s+ativas?\b|\bsomente\s+ativas?\b|\bapenas\s+ativas?\b|\binclu(?:i|ir|indo)\b|\bdistratadas?\b|\bcanceladas?\b|\bhistoric[ao]\b/.test(normalized);
}

function enrichEntitiesWithConversationContext(message, entities = {}, conversationHistory = []) {
  const current = sanitizeEntitiesForPlanning(message, entities);
  const block = parseBlockFromMessage(message);
  if (block && !current.bloco) current.bloco = block;

  const currentMentionsCancellation = isCancellationContextMessage(message);
  const currentIsVgvStatusChoice = isVgvStatusChoiceMessage(message);
  if (!shouldInheritConversationScope(message, current)) {
    return {
      ...current,
      ...(currentMentionsCancellation ? { cancellationFollowUp: true } : {}),
      ...(asksBuyerUnitListQuestion(message) ? { buyerUnitList: true } : {}),
    };
  }

  const context = extractConversationContext(conversationHistory);
  return {
    ...current,
    ...(context.empreendimento && !current.empreendimento ? { empreendimento: context.empreendimento } : {}),
    ...(context.base && !current.base ? { base: context.base } : {}),
    ...(context.bloco && !current.bloco ? { bloco: context.bloco } : {}),
    ...(context.empreendimento || context.base || context.bloco ? { commercialFollowUp: true } : {}),
    ...(currentMentionsCancellation || context.cancellationFollowUp ? { cancellationFollowUp: true } : {}),
    ...(currentIsVgvStatusChoice && context.vgvFollowUp ? { vgvFollowUp: true } : {}),
    ...(context.vgvGroupBy ? { vgvGroupBy: context.vgvGroupBy } : {}),
    ...(asksBuyerUnitListQuestion(message) || recentHistoryAskedBuyerUnitList(conversationHistory) ? { buyerUnitList: true } : {}),
  };
}

function extractProjectFromMessage(message) {
  const text = String(message || '').trim();
  const direct = text.match(/\bempreendimento\s+(.+)$/i);
  if (direct?.[1] && !/^(?:com|que|mais|maior|menor)\b/i.test(direct[1].trim())) {
    return cleanProjectCandidate(direct[1]);
  }

  const afterPreposition = text.match(/\b(?:do|da|no|na)\s+(.+)$/i);
  if (afterPreposition?.[1] && !/^(?:tipologia|base|unidade)\b/i.test(afterPreposition[1].trim())) {
    return cleanProjectCandidate(afterPreposition[1]
      .replace(/\b(?:na|no|da|do)\s+base\b.*$/i, '')
      .trim());
  }

  return null;
}

function parseDateRangeFromMessage(message) {
  const normalized = normalizeText(message);
  const months = {
    janeiro: 1,
    fevereiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };

  for (const [monthName, monthNumber] of Object.entries(months)) {
    const match = normalized.match(new RegExp(`\\b${monthName}\\s+(?:de\\s+)?(20\\d{2})\\b`));
    if (!match) continue;
    const year = Number(match[1]);
    const start = `${year}-${String(monthNumber).padStart(2, '0')}-01`;
    const endDate = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const end = `${year}-${String(monthNumber).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`;
    return { dataInicio: start, dataFim: end };
  }

  return {};
}

function buildSemanticFiltersFromEntities(entities = {}, options = {}) {
  const filters = [];
  const add = (column, operator, value) => {
    if (value == null || String(value).trim() === '') return;
    if (!filters.some((filter) => filter.column === column && filter.operator === operator && String(filter.value) === String(value))) {
      filters.push({ column, operator, value });
    }
  };

  add('empreendimento', 'contains', entities.empreendimento);
  add('cliente', 'contains', entities.cliente || entities.titular);
  add('corretor', 'contains', entities.corretor);
  add('imobiliaria', 'contains', entities.imobiliaria);
  add('unidade', 'contains', entities.unidade);
  add('bloco', 'contains', entities.bloco);
  add('etapa', 'contains', entities.etapa);
  add('cidade', 'contains', entities.cidade);
  add('nomeTabelaAjustado', 'contains', entities.tabela || entities.nomeTabelaAjustado);
  add('Fonte', 'contains', entities.Fonte || entities.fonte || entities.base);
  add('tipoVenda', 'contains', entities.tipoVenda);
  add('dataVenda', 'gte', entities.dataInicio || entities.data_inicio || entities.dataVendaInicio);
  add('dataVenda', 'lte', entities.dataFim || entities.data_fim || entities.dataVendaFim);

  if (options.onlyInactive) add('Status', 'eq', 'INATIVO');
  else if (options.activeOnly) add('Status', 'neq', 'INATIVO');

  return filters;
}

function getCommercialFieldIntent(message, options = {}) {
  const normalized = normalizeText(message);
  const asksMost = /\bmais\b|\bmaior\b|\bmaiores\b|\btop\b|\branking\b|\bprincipal\b/.test(normalized);
  const isCancellationScope = options.isCancellationScope === true || isCancellationContextMessage(message);
  const asksActiveOnly = /\bativas?\b|\bso\s+ativas?\b|\bsomente\s+ativas?\b|\bapenas\s+ativas?\b|\bsem\s+(?:distrat|cancel|inativ)/.test(normalized);
  const asksAllStatuses = /\binclu(?:i|ir|indo).*(?:distrat|cancel|inativ)|\btodas?\b.*(?:distrat|cancel|inativ)|\bhistoric[ao]\s+geral\b|\bhistoric[ao]\s+completo\b/.test(normalized);
  const forceVgv = options.forceVgv === true;

  if (forceVgv || /\bvgv\b|\blucro\b|\bfaturamento\b|\btotal\s+financeiro\b|\bvalor\s+total\b/.test(normalized)) {
    return {
      filtersScope: asksAllStatuses
        ? 'all'
        : asksActiveOnly
          ? 'active'
          : isCancellationScope
            ? 'inactive'
            : 'active',
      groupBy: options.vgvGroupBy === 'empreendimento' || hasAny(normalized, ['empreendimento', 'obra', 'projeto']) ? ['empreendimento'] : [],
      metric: { function: 'sum', column: 'Valor_VGV_Correto' },
      outputType: asksMost ? 'ranking' : 'summary',
    };
  }

  if (isCancellationScope && /\bmotivos?\b|\bpor\s+qual\s+motivo\b|\bporque\b/.test(normalized)) {
    return {
      filtersScope: 'inactive',
      groupBy: ['distrato_motivoDistrato'],
      metric: { function: 'count' },
      outputType: 'ranking',
    };
  }

  if (isCancellationScope && /\bquando\b|\bdata\b|\bperiodo\b|\bdia\b|\bmes\b/.test(normalized)) {
    return {
      filtersScope: 'inactive',
      groupBy: ['distrato_dataCad'],
      metric: { function: 'count' },
      outputType: 'ranking',
    };
  }

  if (/\bquem\s+vendeu\b|\bcorretor(?:es)?\b|\bimobiliarias?\b/.test(normalized)) {
    return {
      filtersScope: isCancellationScope ? 'inactive' : 'active',
      groupBy: ['corretor', 'imobiliaria'],
      metric: { function: 'count' },
      outputType: 'ranking',
    };
  }

  if (/\bestado\s+civil\b/.test(normalized)) {
    return {
      filtersScope: isCancellationScope ? 'inactive' : 'active',
      groupBy: ['estadoCivil'],
      metric: { function: 'count' },
      outputType: 'ranking',
    };
  }

  if (/\brenda\b/.test(normalized)) {
    return {
      filtersScope: isCancellationScope ? 'inactive' : 'active',
      groupBy: [],
      metric: { function: /\bmedia\b|\bmedio\b/.test(normalized) ? 'avg' : 'sum', column: 'renda' },
      outputType: 'summary',
    };
  }

  if (/\btipo\s+de\s+venda\b|\btipo\s+venda\b/.test(normalized)) {
    return {
      filtersScope: isCancellationScope ? 'inactive' : 'active',
      groupBy: ['tipoVenda'],
      metric: { function: 'count' },
      outputType: 'ranking',
    };
  }

  return null;
}

function planSingleQuery({ message, userRole, intents = [], entities = {} }) {
  const normalized = normalizeText(message);
  const actionTerms = BUSINESS_CATALOG.operationalActions;
  const sanitizedEntities = {
    ...sanitizeEntitiesForPlanning(message, entities),
    ...parseDateRangeFromMessage(message),
  };

  if (hasAny(normalized, actionTerms)) {
    return buildPlan('action_not_supported', message, entities, 0.98);
  }

  const mentionsStock = hasIntent(intents, 'estoque')
    || hasAny(normalized, BUSINESS_CATALOG.concepts.estoque.synonyms);
  const mentionsPrice = hasIntent(intents, 'tabela_preco')
    || hasAny(normalized, BUSINESS_CATALOG.concepts.preco.synonyms);
  const asksCheapest = /\bbarat[ao]\b|\bmenor\s+(?:preco|valor)\b|\bpreco\s+minimo\b|\bvalor\s+(?:mais\s+)?baixo\b|\bmais\s+baixo\b/.test(normalized);
  const asksRanking = /\btop\s*\d+\b|\branking\b|\branque/i.test(normalized);
  const mentionsProjectRanking = hasAny(normalized, ['empreendimento', 'empreendimentos', 'obra', 'obras', 'projeto', 'projetos']);
  const asksEachBase = /\bcada\s+base\b|\bpor\s+base\b|\bpor\s+cada\s+base\b|\bvca\s+e\s+lotear\b|\blotear\s+e\s+vca\b/.test(normalized);
  const asksMost = /\bmais\b|\bmaior\b|\bmaiores\b|\btop\b|\branking\b/.test(normalized);
  const inferredProject = extractProjectFromMessage(message);
  const inferredBase = parseBaseFromMessage(message);
  const inferredBlock = parseBlockFromMessage(message);
  const inferredEntities = {
    ...sanitizedEntities,
    ...(inferredProject && !sanitizedEntities.empreendimento ? { empreendimento: inferredProject } : {}),
    ...(inferredBase && !sanitizedEntities.base ? { base: inferredBase } : {}),
    ...(inferredBlock && !sanitizedEntities.bloco ? { bloco: inferredBlock } : {}),
  };
  const mentionsSales = hasIntent(intents, 'reservas')
    || inferredEntities.commercialFollowUp === true
    || /\bvendas?\b|\bcompras?\b|\bcompraram\b|\breservas?\b|\bcontratos?\b|\bcompradores?\b|\btitulares?\b|\bclientes?\b|\bcorretor(?:es)?\b|\bimobiliarias?\b|\bvgv\b/.test(normalized);
  const mentionsCancellation = inferredEntities.cancellationFollowUp === true
    || hasIntent(intents, 'distratos')
    || hasAny(normalized, BUSINESS_CATALOG.concepts.distratos.synonyms);
  const mentionsVgv = /\bvgv\b|\blucro\b|\breceita\b|\bvalor\s+(?:total|vendido|de venda)\b|\bfaturamento\b/.test(normalized);
  const fieldIntent = getCommercialFieldIntent(message, {
    isCancellationScope: mentionsCancellation,
    forceVgv: inferredEntities.vgvFollowUp === true,
    vgvGroupBy: inferredEntities.vgvGroupBy,
  });
  const hasTypology = hasEntity(entities, 'tipologia')
    || hasEntity(entities, 'pavimento')
    || (Array.isArray(entities.tipologia_terms) && entities.tipologia_terms.length > 0);

  if (fieldIntent) {
    const filters = buildSemanticFiltersFromEntities(inferredEntities, {
      onlyInactive: fieldIntent.filtersScope === 'inactive',
      activeOnly: fieldIntent.filtersScope === 'active',
    });

    return buildSemanticPlan(message, {
      filters,
      groupBy: fieldIntent.groupBy,
      metric: fieldIntent.metric,
      order: { by: 'metric', direction: 'desc' },
      limit: inferredEntities.limit || 10,
      outputType: fieldIntent.outputType,
    }, 0.9);
  }

  if (mentionsVgv && mentionsSales) {
    return buildSemanticPlan(message, {
      filters: [{ column: 'Status', operator: 'neq', value: 'INATIVO' }],
      groupBy: hasAny(normalized, ['empreendimento', 'obra', 'projeto']) ? ['empreendimento'] : [],
      metric: { function: 'sum', column: 'Valor_VGV_Correto' },
      order: { by: 'metric', direction: 'desc' },
      limit: inferredEntities.limit || 10,
      outputType: 'ranking',
    }, 0.92);
  }

  if (mentionsSales) {
    return buildPlan('sales_by_project', message, inferredEntities, hasEntity(inferredEntities, 'empreendimento') ? 0.9 : 0.8);
  }

  if (asksCheapest && asksEachBase && mentionsProjectRanking && mentionsPrice && !mentionsSales) {
    return buildPlan('cheapest_project_by_base', message, { ...inferredEntities, limit: 1 }, 0.96);
  }

  const unitRefForLookup = parseUnitReference(message);
  if (unitRefForLookup.unidade && (/\btipologia\b|\bsituacao\b|\bstatus\b|\bdetalhes?\b|\binformacoes?\b|\bdados?\b|\bvendid[ao]\b|\breservad[ao]\b/.test(normalized))) {
    const unitRef = unitRefForLookup;
    const nextEntities = { ...inferredEntities, ...unitRef };
    if (!nextEntities.empreendimento && normalized.includes('uni ville')) {
      nextEntities.empreendimento = 'UNI VILLE RESIDENCIAL';
    }
    return buildPlan('unit_typology_lookup', message, nextEntities, 0.94);
  }

  if (asksMost && /\bvendas?\b/.test(normalized)) {
    const nextEntities = { ...inferredEntities };
    if (hasAny(normalized, ['base vca', 'vca', 'cvcrm'])) nextEntities.base = 'vca';
    if (hasAny(normalized, ['base lotear', 'lotear'])) nextEntities.base = 'lotear';
    return buildPlan('sales_by_project', message, nextEntities, 0.92);
  }

  if (asksMost && /\bdistratos?\b|\bcancelamentos?\b|\brescis/.test(normalized)) {
    const nextEntities = { ...inferredEntities };
    if (hasAny(normalized, ['base vca', 'vca', 'cvcrm'])) nextEntities.base = 'vca';
    if (hasAny(normalized, ['base lotear', 'lotear'])) nextEntities.base = 'lotear';
    return buildPlan('cancellations_by_project', message, nextEntities, 0.92);
  }

  if (asksMost && !asksCheapest && /\bunidades?\b/.test(normalized) && mentionsProjectRanking) {
    const nextEntities = { ...inferredEntities };
    if (hasAny(normalized, ['base vca', 'vca', 'cvcrm'])) nextEntities.base = 'vca';
    if (hasAny(normalized, ['base lotear', 'lotear'])) nextEntities.base = 'lotear';
    return buildPlan('stock_by_project', message, nextEntities, 0.9);
  }

  if ((asksRanking || asksCheapest) && mentionsProjectRanking && mentionsPrice && !mentionsSales) {
    const limitMatch = normalized.match(/\btop\s*(\d+)\b/);
    const nextEntities = {
      ...inferredEntities,
      limit: limitMatch ? Number(limitMatch[1]) : inferredEntities.limit || 5,
    };
    if (hasAny(normalized, ['base vca', 'vca', 'cvcrm'])) nextEntities.base = 'vca';
    if (hasAny(normalized, ['base lotear', 'lotear'])) nextEntities.base = 'lotear';
    return buildPlan('cheapest_projects_by_price', message, nextEntities, 0.93);
  }

  if ((asksCheapest || mentionsPrice) && mentionsStock && hasTypology && !mentionsSales) {
    const missing = [];
    if (!hasEntity(inferredEntities, 'empreendimento')) missing.push('empreendimento');
    return buildPlan('cheapest_unit_by_typology', message, inferredEntities, missing.length ? 0.65 : 0.95, missing);
  }

  if (asksCheapest && /\bunidade\b/.test(normalized)) {
    return buildPlan('price_by_project', message, inferredEntities, hasEntity(inferredEntities, 'empreendimento') ? 0.9 : 0.72);
  }

  if (mentionsStock) {
    return buildPlan('stock_by_project', message, inferredEntities, hasEntity(inferredEntities, 'empreendimento') ? 0.9 : 0.75);
  }

  if (mentionsPrice && !mentionsSales) {
    return buildPlan('price_by_project', message, inferredEntities, hasEntity(inferredEntities, 'empreendimento') ? 0.88 : 0.72);
  }

  if (mentionsCancellation) {
    return buildPlan('cancellations_by_project', message, inferredEntities, hasEntity(inferredEntities, 'empreendimento') ? 0.9 : 0.78);
  }

  if (hasAny(normalized, BUSINESS_CATALOG.concepts.precadastros.synonyms)) {
    return buildPlan('precadastros_summary', message, inferredEntities, 0.82);
  }

  if (hasIntent(intents, 'clientes') || hasAny(normalized, BUSINESS_CATALOG.concepts.leads.synonyms)) {
    return buildPlan('leads_summary', message, inferredEntities, 0.82);
  }

  if (hasIntent(intents, 'empreendimentos') || hasIntent(intents, 'geral')) {
    return buildPlan('general_commercial_overview', message, inferredEntities, 0.7);
  }

  return buildPlan('not_answerable', message, inferredEntities, 0.4);
}

function planQuery({ message, userRole, intents = [], entities = {}, conversationHistory = [] }) {
  const contextualEntities = enrichEntitiesWithConversationContext(message, entities, conversationHistory);
  const items = splitQuestionItems(message);
  if (items.length >= 2) {
    const subPlans = items.map((item) => planSingleQuery({
      message: item,
      userRole,
      intents,
      entities: {},
    }));

    const requiredPermissions = [...new Set(subPlans.flatMap((plan) => plan.requiredPermissions))];
    return {
      planId: 'composite_query',
      requiredPermissions,
      missingFields: [...new Set(subPlans.flatMap((plan) => plan.missingFields || []))],
      confidence: Math.min(...subPlans.map((plan) => plan.confidence || 0.5)),
      executionSpec: {
        message,
        filters: contextualEntities || {},
        subPlans,
      },
    };
  }

  return planSingleQuery({ message, userRole, intents, entities: contextualEntities });
}

async function buildQueryPlan({ message, userRole, intents = [], entities = {}, conversationHistory = [] }) {
  const deterministicPlan = planQuery({ message, userRole, intents, entities, conversationHistory });
  const { generateSemanticPlan } = require('./semanticQueryPlanner');
  return generateSemanticPlan({
    message,
    userRole,
    intents,
    entities,
    deterministicPlan,
  });
}

module.exports = { planQuery, buildQueryPlan, normalizeText };
