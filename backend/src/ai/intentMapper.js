/**
 * Classifica a intenção da pergunta usando OpenAI.
 * Não requer atualização de regex ao adicionar novas tabelas —
 * basta atualizar o CLASSIFIER_SYSTEM e fetchContextData.
 */

const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY e obrigatorio');
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';
const OPENAI_MODEL_FALLBACK = process.env.OPENAI_MODEL_FALLBACK || 'gpt-5';

// Mapeamento estático intent → permissões. Atualize aqui ao adicionar novos intents.
const INTENT_PERMISSIONS = {
  reservas:        ['view_reservas'],
  clientes:        ['view_clientes'],
  empreendimentos: ['view_empreendimentos'],
  unidades:        ['view_unidades'],
  estoque:         ['view_empreendimentos'],
  distratos:       ['view_reservas'],
  financeiro:      ['view_financeiro'],
  tabela_preco:    ['view_tabela_preco'],
  geral:           ['view_empreendimentos'],
};

// Intents que o role corretor NÃO pode acessar
const RESTRICTED_INTENTS_FOR_CORRETOR = new Set(['reservas', 'distratos', 'clientes', 'financeiro']);

/**
 * Mensagens de bloqueio amigáveis por intent.
 */
const BLOCKED_MESSAGES = {
  reservas:   'Você não tem acesso a dados de reservas e contratos. Essa informação está disponível apenas para o time administrativo.',
  distratos:  'Você não tem acesso a dados de distratos e rescisões. Essa informação está disponível apenas para o time administrativo.',
  clientes:   'Você não tem acesso a dados de clientes e CPF. Essa informação está disponível apenas para o time administrativo.',
  financeiro: 'Você não tem acesso a informações financeiras como preços, parcelas e pagamentos. Essa informação está disponível apenas para o time administrativo.',
  default:    'Você não tem permissão para acessar essa informação.',
};

/**
 * Layer 1 — Verificação rápida por keywords sem chamar a IA.
 * Retorna { blocked: false } ou { blocked: true, blockedIntent, message }.
 *
 * Intents e seus padrões de keywords:
 *   - reservas:   reservas, vendas, contrato(s), comprador(es), titular(es), compras
 *   - distratos:  distratos, rescisão, rescisões, cancelamento(s)
 *   - clientes:   clientes, cpf, documento(s)
 *   - financeiro: financeiro, finanças, financeira, preço(s), parcela(s), pagamento(s), saldo, custo(s), valor(es)
 */
const KEYWORD_RULES = [
  {
    intent: 'reservas',
    pattern: /\breservas?\b|\bvendas?\b|\bcontratos?\b|\bcompradores?\b|\btitulares?\b|\bcompras?\b|\bvgv\b/i,
  },
  {
    intent: 'distratos',
    pattern: /\bdistratos?\b|\brescis[aã]o\b|\brescis[õo]es\b|\bcancelamentos?\b/i,
  },
  {
    intent: 'clientes',
    pattern: /\bclientes?\b|\bcpf\b|\bdocumentos?\b/i,
  },
  {
    intent: 'financeiro',
    // Preços e valores NÃO fazem parte aqui — eles podem ser tabela_preco (permitido ao corretor).
    // Somente termos exclusivamente financeiros (parcelas, pagamentos, etc.) bloqueiam no Layer 1.
    pattern: /\bfinanc\w*\b|\bparcelas?\b|\bpagamentos?\b|\bsaldo\b|\bcustos?\b/i,
  },
];

function quickRoleCheck(message, role) {
  // Admin nunca é bloqueado
  if (role === 'admin') return { blocked: false };

  for (const rule of KEYWORD_RULES) {
    if (RESTRICTED_INTENTS_FOR_CORRETOR.has(rule.intent) && rule.pattern.test(message)) {
      return {
        blocked: true,
        blockedIntent: rule.intent,
        message: BLOCKED_MESSAGES[rule.intent] || BLOCKED_MESSAGES.default,
      };
    }
  }

  return { blocked: false };
}

/**
 * Retorna a mensagem de bloqueio para um dado intent.
 */
function getBlockedMessage(intent) {
  return BLOCKED_MESSAGES[intent] || BLOCKED_MESSAGES.default;
}

const CLASSIFIER_SYSTEM = `Você é um classificador de intenções para um sistema imobiliário da VCA Construtora. Dado uma pergunta, retorne um JSON com:

- "intents": array com TODOS os tipos de dados necessários. Inclua todos os relevantes, mesmo quando a pergunta mistura contextos. Valores válidos:
  - "reservas"        → vendas realizadas, compras, contratos ativos, compradores, VGV, tabela da compra, base/Fonte, corretor da venda, imobiliária da venda
  - "clientes"        → dados de clientes, CPF, cidade, renda, estado civil, genero/sexo do comprador
  - "empreendimentos" → lista de projetos/obras imobiliárias, endereços, situação da obra
  - "estoque"         → disponibilidade de unidades por situação (disponível, reservado, vendido, bloqueado)
  - "distratos"       → contratos cancelados, rescisões
  - "financeiro"      → valores financeiros, preços de contrato, parcelas, pagamentos
  - "tabela_preco"    → tabela de preço de unidades, preço de apartamento/lote por empreendimento, consulta de valor de imóvel em tabela
  - "geral"           → dúvidas gerais sem contexto específico de dados

- "entities": objeto com filtros extraídos:
  - "empreendimento": nome do empreendimento (extraia exatamente como escrito pelo usuário, sem correção)
  - "situacao": situação específica mencionada (ex: "disponível", "vendido")
  - "corretor": nome do corretor, se mencionado
  - "cliente": nome do comprador/cliente, se mencionado
  - "titular": nome do comprador/titular, se mencionado
  - "imobiliaria": nome da imobiliaria, se mencionado
  - "tabela": nome da tabela comercial da compra, se mencionada
  - "estado": sigla do estado brasileiro se mencionado (ex: "Bahia" → "BA", "São Paulo" → "SP", "Minas Gerais" → "MG")
  - "cidade": nome da cidade se mencionada
  - "tipologia": tipologia ou característica da unidade mencionada (ex: "2 quartos com suíte", "3 quartos", "lote")
  - "pavimento": pavimento mencionado (ex: "térreo", "primeiro andar")

Responda APENAS com JSON válido, sem markdown, sem texto extra.

Exemplos:
- "quantos distratos tem o CAMPUS VIVANT?" → {"intents":["distratos"],"entities":{"empreendimento":"CAMPUS VIVANT"}}
- "unidades do Uni Ville por situação" → {"intents":["estoque"],"entities":{"empreendimento":"Uni Ville"}}
- "unidade no Uni Ville de 2 quartos com suíte no térreo" → {"intents":["estoque"],"entities":{"empreendimento":"Uni Ville","tipologia":"2 quartos com suíte","pavimento":"térreo","situacao":"Disponível"}}
- "quais empreendimentos existem?" → {"intents":["empreendimentos"],"entities":{}}
- "total de vendas VCA" → {"intents":["reservas"],"entities":{}}
- "qual o endereço e quantas unidades disponíveis do Heleusa?" → {"intents":["empreendimentos","estoque"],"entities":{"empreendimento":"Heleusa"}}
- "oi tudo bem?" → {"intents":["geral"],"entities":{}}
- "unidade mais barata na Bahia" → {"intents":["tabela_preco"],"entities":{"estado":"BA"}}
- "tabela de preço dos empreendimentos em Salvador" → {"intents":["tabela_preco"],"entities":{"cidade":"Salvador"}}`;

const CLASSIFIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intents: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['reservas', 'clientes', 'empreendimentos', 'estoque', 'distratos', 'financeiro', 'tabela_preco', 'geral'],
      },
    },
    entities: {
      type: 'object',
      additionalProperties: false,
      properties: {
        empreendimento: { type: ['string', 'null'] },
        situacao: { type: ['string', 'null'] },
        corretor: { type: ['string', 'null'] },
        cliente: { type: ['string', 'null'] },
        titular: { type: ['string', 'null'] },
        imobiliaria: { type: ['string', 'null'] },
        tabela: { type: ['string', 'null'] },
        estado: { type: ['string', 'null'] },
        cidade: { type: ['string', 'null'] },
        tipologia: { type: ['string', 'null'] },
        pavimento: { type: ['string', 'null'] },
        bloco: { type: ['string', 'null'] },
        unidade: { type: ['string', 'null'] },
        base: { type: ['string', 'null'], enum: ['vca', 'lotear', null] },
        limit: { type: ['integer', 'null'] },
        tipologia_terms: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: [
        'empreendimento',
        'situacao',
        'corretor',
        'cliente',
        'titular',
        'imobiliaria',
        'tabela',
        'estado',
        'cidade',
        'tipologia',
        'pavimento',
        'bloco',
        'unidade',
        'base',
        'limit',
        'tipologia_terms',
      ],
    },
  },
  required: ['intents', 'entities'],
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function enrichEntitiesFromMessage(message, entities = {}) {
  const enriched = { ...entities };
  const normalized = normalizeText(message);
  const tipologiaTerms = new Set(Array.isArray(enriched.tipologia_terms) ? enriched.tipologia_terms : []);
  const invalidProjectCandidate = (value) => {
    const normalizedValue = normalizeText(value);
    if (/^(?:bloco|bl|torre|unidade|apto|apartamento)\s*[a-z0-9-]+\b/.test(normalizedValue)) return true;
    return /^(?:base|fonte)\s+(?:vca|cvcrm|lotear)\b/.test(normalizedValue)
      || /^(?:vca|cvcrm|lotear)(?:\s+(?:nos?|nós)?\s*temos|\s+hoje|\s+atual)/.test(normalizedValue);
  };

  if (invalidProjectCandidate(enriched.empreendimento)) {
    delete enriched.empreendimento;
  }

  if (!enriched.empreendimento) {
    const empreendimentoMatch = normalized.match(/\b(?:no|na|do|da|dos|das)\s+([a-z0-9\s]+?)(?=\s+(?:na|no|da|do)\s+tipologia|\s+(?:de|com)\s+\d|\s+que\b|\s+disponivel\b|\s+mais\b|\?|$)/);
    if (empreendimentoMatch?.[1] && !invalidProjectCandidate(empreendimentoMatch[1])) {
      enriched.empreendimento = empreendimentoMatch[1]
        .trim()
        .replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }

  if (!enriched.empreendimento && normalized.includes('uni ville')) {
    enriched.empreendimento = 'UNI VILLE RESIDENCIAL';
  }

  const blocoMatch = normalized.match(/\b(?:bloco|bl|torre)\s*([a-z0-9-]+)\b/);
  if (blocoMatch && !enriched.bloco) {
    enriched.bloco = blocoMatch[1].toUpperCase();
  }

  const quartosMatch = normalized.match(/\b([1-5])\s*(?:quartos?|dormitorios?|dorms?)\b/);
  if (quartosMatch) {
    tipologiaTerms.add(`${quartosMatch[1]} quarto`);
    if (!enriched.tipologia) enriched.tipologia = `${quartosMatch[1]} quartos`;
  }

  if (/\bsuite\b/.test(normalized)) {
    tipologiaTerms.add('suite');
    if (!enriched.tipologia) enriched.tipologia = 'suite';
  }

  if (/\bterreo\b|\bpavimento\s+terreo\b/.test(normalized)) {
    tipologiaTerms.add('terreo');
    enriched.pavimento = enriched.pavimento || 'térreo';
  }

  if (/\bdisponivel\b|\bdisponiveis\b|\bdisponibilidade\b/.test(normalized) && !enriched.situacao) {
    enriched.situacao = 'Disponível';
  }

  if (tipologiaTerms.size > 0) {
    enriched.tipologia_terms = Array.from(tipologiaTerms);
  }

  return enriched;
}

function isModelFallbackError(error) {
  return error?.status === 400
    || error?.status === 404
    || /model|not found|does not exist|unsupported|not available/i.test(error?.message || '');
}

function getModelPlan() {
  return [...new Set([OPENAI_MODEL, OPENAI_MODEL_FALLBACK].filter(Boolean))];
}

function inferIntentsFromMessage(message, parsedIntents = []) {
  const normalized = normalizeText(message);
  const intents = new Set(parsedIntents.filter((i) => i in INTENT_PERMISSIONS));

  if (/\bunidades?\b|\bapartamentos?\b|\bapto\b|\bestoque\b|\btipologia\b|\bquartos?\b|\bsuite\b|\bterreo\b/.test(normalized)) {
    intents.add('estoque');
  }

  if (/\bbarat[ao]\b|\bmenor\s+preco\b|\bprecos?\b|\bvalor(?:es)?\b|\btabela\b/.test(normalized)) {
    intents.add('tabela_preco');
  }

  if (/\bvendas?\b|\bcompras?\b|\breservas?\b|\bcontratos?\b|\bcompradores?\b|\btitulares?\b|\bclientes?\b|\bcorretores?\b|\bimobiliarias?\b|\bvgv\b|\bfonte\b|\bbase\b/.test(normalized)) {
    intents.add('reservas');
  }

  if (/\bdistratos?\b|\brescis(?:ao|oes)\b|\bcancelamentos?\b|\bcancelad[ao]s?\b|\binativ[ao]s?\b/.test(normalized)) {
    intents.add('distratos');
  }

  if (intents.size === 0) {
    intents.add('geral');
  }

  return Array.from(intents);
}

async function classifyWithModel(message, model) {
  const response = await client.responses.create({
    model,
    instructions: CLASSIFIER_SYSTEM,
    input: message,
    max_output_tokens: 1600,
    text: {
      format: {
        type: 'json_schema',
        name: 'intent_classification',
        strict: true,
        schema: CLASSIFIER_SCHEMA,
      },
    },
  });

  const raw = response.output_text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(raw);
}

async function classifyMessage(message) {
  try {
    let parsed;
    let lastError;
    for (const model of getModelPlan()) {
      try {
        parsed = await classifyWithModel(message, model);
        break;
      } catch (error) {
        lastError = error;
        if (isModelFallbackError(error) && model !== OPENAI_MODEL_FALLBACK) {
          console.warn(`[IntentMapper] modelo ${model} indisponivel. Tentando fallback ${OPENAI_MODEL_FALLBACK}.`);
          continue;
        }
        throw error;
      }
    }
    if (!parsed) throw lastError;

    const intents = inferIntentsFromMessage(
      message,
      Array.isArray(parsed.intents) && parsed.intents.length > 0 ? parsed.intents : []
    );

    const entities = (parsed.entities && typeof parsed.entities === 'object')
      ? parsed.entities
      : {};

    const permissions = new Set();
    for (const intent of intents) {
      (INTENT_PERMISSIONS[intent] || INTENT_PERMISSIONS.geral).forEach((p) => permissions.add(p));
    }

    return {
      intents,
      intent: intents[0],
      permissions: Array.from(permissions),
      entities: enrichEntitiesFromMessage(message, entities),
    };
  } catch (err) {
    console.warn('[IntentMapper] Falha na classificação, usando fallback geral:', err.message);
    const intents = inferIntentsFromMessage(message, []);
    const permissions = new Set();
    for (const intent of intents) {
      (INTENT_PERMISSIONS[intent] || INTENT_PERMISSIONS.geral).forEach((p) => permissions.add(p));
    }

    return {
      intents,
      intent: intents[0],
      permissions: Array.from(permissions),
      entities: enrichEntitiesFromMessage(message, {}),
    };
  }
}

module.exports = { classifyMessage, quickRoleCheck, getBlockedMessage, RESTRICTED_INTENTS_FOR_CORRETOR };
