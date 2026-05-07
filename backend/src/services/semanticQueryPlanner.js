const OpenAI = require('openai');
const { getCatalogSummary } = require('./businessCatalog');
const { getSchemaProfile } = require('./schemaProfiler');
const { validateQueryPlan, parseBaseFromMessage } = require('./queryPlanValidator');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';
const OPENAI_MODEL_FALLBACK = process.env.OPENAI_MODEL_FALLBACK || 'gpt-5';

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

const SEMANTIC_PLANNER_SYSTEM = `Voce e um planejador de consultas para um backend imobiliario.
Sua tarefa e transformar a pergunta do usuario em um plano JSON seguro.

Regras:
- Responda somente JSON valido.
- Nao gere SQL.
- Use apenas tabelas e colunas presentes no schema enviado.
- Por enquanto o Supabase tem somente a tabela vw_Vendas_Consolidada para dados comerciais. Nunca use tabelas antigas como estoque_cvcrm, estoque_lotear, vendas_cvcrm, vendas_lotear, distratos_cvcrm, distratos_lotear, tabela_de_preco_cvcrm, tabela_de_preco_lotear, TB_LEADS ou TB_PRECADASTROS.
- Prefira planos deterministicos quando existirem: sales_by_project e cancellations_by_project. Use semantic_aggregate somente sobre vw_Vendas_Consolidada.
- Para qualquer pergunta sobre vendas, compras, reservas, contratos, unidades compradas/vendidas, compradores, clientes compradores, corretores, imobiliarias, Fonte/base, tabela comercial ou VGV, use a tabela vw_Vendas_Consolidada.
- Pode combinar livremente multiplos filtros na mesma consulta quando a pergunta ou o historico indicarem escopo: empreendimento, bloco, unidade, etapa, Fonte/base, cliente, corretor, imobiliaria, nomeTabelaAjustado, cidade, dataVenda e Status.
- A coluna cliente esta disponivel para admins e deve ser usada para nomes de compradores/clientes que compraram.
- Para vendas ativas, adicione filtro Status != INATIVO, exceto quando o usuario pedir historico geral incluindo canceladas/distratadas.
- Para distratos, cancelamentos, rescisoes ou inativos, use a tabela vw_Vendas_Consolidada e filtro Status = INATIVO.
- Motivo de distrato/cancelamento fica em distrato_motivoDistrato.
- Data do distrato/cancelamento fica em distrato_dataCad.
- Quem vendeu a unidade deve usar corretor junto com imobiliaria.
- Estado civil fica em estadoCivil.
- Renda fica em renda; o executor avisara que esse dado pode ter distorcoes pelo preenchimento do CVCRM.
- Tipo de venda fica em tipoVenda.
- Periodo/data da venda deve filtrar dataVenda.
- Cliente/comprador fica em cliente.
- Tambem sao consultaveis empreendimento, etapa, bloco, unidade, cidade, Fonte/base, Status, sexo, idade, midia, nomeTabelaAjustado, valorContrato e VALOR_ENTRADA.
- Tabela comercial da venda fica em nomeTabelaAjustado.
- Base da venda fica em Fonte.
- VGV deve usar sempre Valor_VGV_Correto.
- Se a pergunta de VGV nao disser se deve considerar unidades distratadas/canceladas, o padrao e somente vendas ativas com Status != INATIVO.
- Se o usuario pedir VGV dos distratos/cancelamentos, use Status = INATIVO. Se pedir incluindo distratadas/canceladas ou historico completo, nao adicione filtro de Status.
- Se a pergunta for follow-up sobre "desses distratos", "esses 65", "desse empreendimento" ou escopo parecido, preserve filtros ja presentes no plano deterministico, trocando apenas a metrica/dimensao solicitada.
- Nao peca autorizacao: se o plano pode consultar a coluna na vw_Vendas_Consolidada, gere o plano com os filtros necessarios.
- Quando a pergunta pedir ranking, agrupamento, media, minimo, maximo, soma ou contagem que nao tenha plano fixo obvio, use semantic_aggregate.
- Para ranking de empreendimentos mais baratos, semantic_aggregate deve agrupar por empreendimento e usar min(valor_total), excluindo termos como garagem, extra, vaga e baia quando a pergunta buscar produto principal.
- Nunca planeje acoes operacionais como bloquear, reservar, simular financiamento, aprovar credito, acionar corretor ou enviar proposta; use action_not_supported.

Formato para semantic_aggregate:
{
  "planId": "semantic_aggregate",
  "confidence": 0.0-1.0,
  "executionSpec": {
    "message": "pergunta original",
    "tables": ["tabela"],
    "filters": [{"column":"coluna","operator":"contains|eq|neq|gte|lte|gt|lt|in","value":"valor"}],
    "groupBy": ["coluna"],
    "metric": {"function":"count|min|max|avg|sum","column":"coluna opcional para count"},
    "order": {"by":"metric","direction":"asc|desc"},
    "limit": 5,
    "excludeTerms": [{"columns":["coluna"],"terms":["garagem","extra"]}],
    "outputType": "ranking|summary|list"
  }
}`;

function safeJsonParse(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(clean);
}

function compactSchema(schemaProfile) {
  return {
    generated_at: schemaProfile.generated_at,
    tables: (schemaProfile.tables || []).map((table) => ({
      table: table.table,
      available: table.available,
      estimated_rows: table.estimated_rows,
      columns: (table.columns || []).map((column) => ({
        name: column.name,
        role: column.role,
        examples: column.examples,
      })),
    })),
    relationships: schemaProfile.relationships,
  };
}

function shouldTrySemanticPlanner(deterministicPlan) {
  return !deterministicPlan
    || deterministicPlan.planId === 'not_answerable'
    || (deterministicPlan.planId === 'general_commercial_overview' && deterministicPlan.confidence < 0.8)
    || deterministicPlan.confidence < 0.65;
}

function getModelPlan() {
  return [...new Set([OPENAI_MODEL, OPENAI_MODEL_FALLBACK].filter(Boolean))];
}

function enrichSemanticFilters(plan, message) {
  const base = parseBaseFromMessage(message);
  if (!base) return plan;

  const spec = plan.executionSpec || {};
  const filters = Array.isArray(spec.filters) ? [...spec.filters] : [];
  const usesConsolidatedSales = Array.isArray(spec.tables) && spec.tables.includes('vw_Vendas_Consolidada');

  if (usesConsolidatedSales && !filters.some((filter) => filter.column === 'Fonte')) {
    filters.push({ column: 'Fonte', operator: 'contains', value: base });
  }

  return {
    ...plan,
    executionSpec: {
      ...spec,
      filters,
      base,
    },
  };
}

async function generateSemanticPlan({ message, userRole, intents, entities, deterministicPlan }) {
  if (!client || !shouldTrySemanticPlanner(deterministicPlan)) {
    return deterministicPlan;
  }

  const schemaProfile = await getSchemaProfile();
  const input = {
    message,
    userRole,
    intents,
    entities,
    deterministicPlan,
    businessCatalog: getCatalogSummary(),
    schemaProfile: compactSchema(schemaProfile),
  };

  let lastError;
  for (const model of getModelPlan()) {
    try {
      const response = await client.responses.create({
        model,
        instructions: SEMANTIC_PLANNER_SYSTEM,
        input: JSON.stringify(input),
        max_output_tokens: 4096,
      });

      const rawPlan = enrichSemanticFilters(safeJsonParse(response.output_text), message);
      const validated = validateQueryPlan(rawPlan, schemaProfile, deterministicPlan);
      if (validated.ok) return validated.plan;
      console.warn(`[SemanticPlanner] Plano rejeitado: ${validated.reason}`);
      return deterministicPlan;
    } catch (error) {
      lastError = error;
      if (error?.status === 400 || error?.status === 404) continue;
      break;
    }
  }

  console.warn(`[SemanticPlanner] Falha ao gerar plano semantico: ${lastError?.message || 'erro desconhecido'}`);
  return deterministicPlan;
}

module.exports = {
  generateSemanticPlan,
  shouldTrySemanticPlanner,
};
