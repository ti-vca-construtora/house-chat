const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY é obrigatório');
}

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1200;

// Carregar system prompt
const systemPromptPath = path.join(__dirname, '..', '..', '..', 'system-prompt.md');
let SYSTEM_PROMPT = '';
try {
  SYSTEM_PROMPT = fs.readFileSync(systemPromptPath, 'utf-8');
} catch {
  SYSTEM_PROMPT = `Você é o Jardas Bot, assistente da VCA Construtora. Responda em português brasileiro, de forma natural, direta e comercial. Pode usar "Tio" ocasionalmente e frases de efeito apenas em momentos relevantes, evitando repetição no mesmo diálogo.`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAnthropicOverloadedError(error) {
  return error?.status === 529
    || error?.error?.type === 'overloaded_error'
    || error?.type === 'overloaded_error'
    || /overloaded/i.test(error?.message || '');
}

function buildFriendlyAnthropicError(error) {
  if (isAnthropicOverloadedError(error)) {
    return Object.assign(
      new Error('A IA está temporariamente sobrecarregada. Tente novamente em alguns instantes.'),
      { status: 503 }
    );
  }

  return Object.assign(
    new Error('Não foi possível obter resposta da IA no momento.'),
    { status: error?.status || 502 }
  );
}

const ROLE_LABELS = {
  admin:    'Administrador — acesso total ao sistema.',
  corretor: 'Corretor — acesso restrito a empreendimentos e estoque de unidades. Não tem acesso a reservas, contratos, distratos, dados de clientes ou informações financeiras.',
};

async function chat(userMessage, contextData, conversationHistory = [], userRole = 'corretor') {
  // Montar contexto dos dados
  let dataContext = '';
  if (contextData && Object.keys(contextData).length > 0) {
    dataContext = '\n\n--- DADOS DO BANCO DE DADOS ---\n';
    for (const [key, value] of Object.entries(contextData)) {
      dataContext += `\n[${key.toUpperCase()}]:\n${JSON.stringify(value, null, 2)}\n`;
    }
    dataContext += '\n--- FIM DOS DADOS ---\n';
  }

  const roleLabel = ROLE_LABELS[userRole] || `Perfil: ${userRole}.`;
  const roleContext = `\n\n--- PERFIL DO USUÁRIO ---\n${roleLabel}\nSe o usuário perguntar algo fora do seu nível de acesso, informe com educação que você não pode fornecer essa informação.\n--- FIM DO PERFIL ---\n`;

  const systemWithData = SYSTEM_PROMPT + roleContext + dataContext;

  // Montar histórico de mensagens
  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemWithData,
        messages,
      });

      return response.content[0].text;
    } catch (error) {
      lastError = error;

      if (!isAnthropicOverloadedError(error) || attempt === MAX_RETRIES) {
        break;
      }

      const delayMs = INITIAL_RETRY_DELAY_MS * attempt;
      console.warn(`[Claude] overloaded_error na tentativa ${attempt}/${MAX_RETRIES}. Retentando em ${delayMs}ms.`);
      await sleep(delayMs);
    }
  }

  throw buildFriendlyAnthropicError(lastError);
}

module.exports = { chat };
