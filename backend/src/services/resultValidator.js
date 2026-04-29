const { normalizeText } = require('./queryPlanner');

function warning(code, message) {
  return { code, message };
}

function validateCheapestProjects(payload) {
  const warnings = [];
  if (payload.total_registros_preco > 0 && payload.ranking.length === 0) {
    warnings.push(warning(
      'empty_ranking_with_price_rows',
      'A tabela de preco tem registros, mas o ranking ficou vazio apos filtros de qualidade.'
    ));
  }

  for (const item of payload.ranking || []) {
    const searchable = normalizeText([
      item.bloco_referencia,
      item.unidade_referencia,
      item.tabela,
    ].filter(Boolean).join(' '));

    if (Number(item.valor_minimo) > 0 && Number(item.valor_minimo) < 50000) {
      warnings.push(warning('suspicious_low_price', `Preco muito baixo no ranking: ${item.valor_minimo}.`));
    }
    if (/\bgaragem\b|\bextra\b|\bvaga\b|\bbaia\b/.test(searchable)) {
      warnings.push(warning('non_primary_unit_in_ranking', `Item possivelmente nao principal: ${item.empreendimento}.`));
    }
  }

  return warnings;
}

function validateSemanticAggregate(payload) {
  const warnings = [];
  if (payload.total_rows_read > 0 && payload.total_rows_after_filters === 0) {
    warnings.push(warning(
      'semantic_filters_removed_all_rows',
      'A consulta leu registros, mas os filtros removeram todos os resultados.'
    ));
  }

  if (payload.metric?.column === 'valor_total' || payload.metric?.function === 'min') {
    for (const item of payload.results || []) {
      const value = Number(item.metric?.value);
      const searchable = normalizeText([
        item.reference?.bloco,
        item.reference?.unidade,
        item.reference?.tabela,
      ].filter(Boolean).join(' '));

      if (Number.isFinite(value) && value > 0 && value < 50000) {
        warnings.push(warning('semantic_suspicious_low_price', `Valor agregado muito baixo: ${value}.`));
      }
      if (/\bgaragem\b|\bextra\b|\bvaga\b|\bbaia\b/.test(searchable)) {
        warnings.push(warning('semantic_non_primary_unit', 'Referencia pode ser item acessorio, nao unidade principal.'));
      }
    }
  }

  return warnings;
}

function validateAnswerPayload(payload) {
  if (!payload || typeof payload !== 'object') return [];

  if (payload.type === 'cheapest_projects_by_price') {
    return validateCheapestProjects(payload);
  }
  if (payload.type === 'semantic_aggregate') {
    return validateSemanticAggregate(payload);
  }
  return [];
}

module.exports = {
  validateAnswerPayload,
};
