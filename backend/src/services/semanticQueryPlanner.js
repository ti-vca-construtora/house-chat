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
- Prefira planos deterministicos quando existirem: cheapest_unit_by_typology, cheapest_projects_by_price, stock_by_project, price_by_project, sales_by_project, cancellations_by_project, leads_summary, precadastros_summary.
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

  const tableSuffix = base === 'vca' ? '_cvcrm' : '_lotear';
  const spec = plan.executionSpec || {};
  const tables = Array.isArray(spec.tables)
    ? spec.tables.filter((table) => table.endsWith(tableSuffix) || !/_cvcrm$|_lotear$/.test(table))
    : [];

  return {
    ...plan,
    executionSpec: {
      ...spec,
      tables: tables.length > 0 ? tables : spec.tables,
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
