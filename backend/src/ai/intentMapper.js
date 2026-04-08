/**
 * Classifica a intenção da pergunta usando Claude Haiku.
 * Não requer atualização de regex ao adicionar novas tabelas —
 * basta atualizar o CLASSIFIER_SYSTEM e fetchContextData.
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
    pattern: /\breservas?\b|\bvendas?\b|\bcontratos?\b|\bcompradores?\b|\btitulares?\b|\bcompras?\b/i,
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
  - "reservas"        → vendas realizadas, contratos ativos, compradores
  - "clientes"        → dados de clientes, CPF, corretor, imobiliária
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
  - "titular": nome do comprador/titular, se mencionado
  - "estado": sigla do estado brasileiro se mencionado (ex: "Bahia" → "BA", "São Paulo" → "SP", "Minas Gerais" → "MG")
  - "cidade": nome da cidade se mencionada

Responda APENAS com JSON válido, sem markdown, sem texto extra.

Exemplos:
- "quantos distratos tem o CAMPUS VIVANT?" → {"intents":["distratos"],"entities":{"empreendimento":"CAMPUS VIVANT"}}
- "unidades do Uni Ville por situação" → {"intents":["estoque"],"entities":{"empreendimento":"Uni Ville"}}
- "quais empreendimentos existem?" → {"intents":["empreendimentos"],"entities":{}}
- "total de vendas VCA" → {"intents":["reservas"],"entities":{}}
- "qual o endereço e quantas unidades disponíveis do Heleusa?" → {"intents":["empreendimentos","estoque"],"entities":{"empreendimento":"Heleusa"}}
- "oi tudo bem?" → {"intents":["geral"],"entities":{}}
- "unidade mais barata na Bahia" → {"intents":["tabela_preco"],"entities":{"estado":"BA"}}
- "tabela de preço dos empreendimentos em Salvador" → {"intents":["tabela_preco"],"entities":{"cidade":"Salvador"}}`;

async function classifyMessage(message) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: 'user', content: message }],
    });

    const raw = response.content[0].text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);

    const intents = Array.isArray(parsed.intents) && parsed.intents.length > 0
      ? parsed.intents.filter((i) => i in INTENT_PERMISSIONS)
      : ['geral'];

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
      entities,
    };
  } catch (err) {
    console.warn('[IntentMapper] Falha na classificação, usando fallback geral:', err.message);
    return {
      intents: ['geral'],
      intent: 'geral',
      permissions: ['view_empreendimentos'],
      entities: {},
    };
  }
}

module.exports = { classifyMessage, quickRoleCheck, getBlockedMessage, RESTRICTED_INTENTS_FOR_CORRETOR };
