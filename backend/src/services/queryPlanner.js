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

function extractProjectFromMessage(message) {
  const text = String(message || '').trim();
  const direct = text.match(/\bempreendimento\s+(.+)$/i);
  if (direct?.[1] && !/^(?:com|que|mais|maior|menor)\b/i.test(direct[1].trim())) {
    return direct[1].trim().replace(/[?.:,;]+$/, '');
  }

  const afterPreposition = text.match(/\b(?:do|da|no|na)\s+(.+)$/i);
  if (afterPreposition?.[1] && !/^(?:tipologia|base|unidade)\b/i.test(afterPreposition[1].trim())) {
    return afterPreposition[1]
      .replace(/\b(?:na|no|da|do)\s+base\b.*$/i, '')
      .trim()
      .replace(/[?.:,;]+$/, '');
  }

  return null;
}

function planSingleQuery({ message, userRole, intents = [], entities = {} }) {
  const normalized = normalizeText(message);
  const actionTerms = BUSINESS_CATALOG.operationalActions;

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
  const hasTypology = hasEntity(entities, 'tipologia')
    || hasEntity(entities, 'pavimento')
    || (Array.isArray(entities.tipologia_terms) && entities.tipologia_terms.length > 0);

  const inferredProject = extractProjectFromMessage(message);
  const inferredEntities = inferredProject && !entities.empreendimento
    ? { ...entities, empreendimento: inferredProject }
    : entities;

  if (asksCheapest && asksEachBase && mentionsProjectRanking && mentionsPrice) {
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

  if ((asksRanking || asksCheapest) && mentionsProjectRanking && mentionsPrice) {
    const limitMatch = normalized.match(/\btop\s*(\d+)\b/);
    const nextEntities = {
      ...inferredEntities,
      limit: limitMatch ? Number(limitMatch[1]) : inferredEntities.limit || 5,
    };
    if (hasAny(normalized, ['base vca', 'vca', 'cvcrm'])) nextEntities.base = 'vca';
    if (hasAny(normalized, ['base lotear', 'lotear'])) nextEntities.base = 'lotear';
    return buildPlan('cheapest_projects_by_price', message, nextEntities, 0.93);
  }

  if ((asksCheapest || mentionsPrice) && mentionsStock && hasTypology) {
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

  if (mentionsPrice) {
    return buildPlan('price_by_project', message, inferredEntities, hasEntity(inferredEntities, 'empreendimento') ? 0.88 : 0.72);
  }

  if (hasIntent(intents, 'reservas') || hasAny(normalized, BUSINESS_CATALOG.concepts.vendas.synonyms)) {
    return buildPlan('sales_by_project', message, inferredEntities, hasEntity(inferredEntities, 'empreendimento') ? 0.88 : 0.75);
  }

  if (hasIntent(intents, 'distratos') || hasAny(normalized, BUSINESS_CATALOG.concepts.distratos.synonyms)) {
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

function planQuery({ message, userRole, intents = [], entities = {} }) {
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
        filters: entities || {},
        subPlans,
      },
    };
  }

  return planSingleQuery({ message, userRole, intents, entities });
}

async function buildQueryPlan({ message, userRole, intents = [], entities = {} }) {
  const deterministicPlan = planQuery({ message, userRole, intents, entities });
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
