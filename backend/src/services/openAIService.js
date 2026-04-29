const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY e obrigatorio');
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';
const OPENAI_MODEL_FALLBACK = process.env.OPENAI_MODEL_FALLBACK || 'gpt-5';
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1200;

const systemPromptPath = path.join(__dirname, '..', '..', '..', 'system-prompt.md');
let SYSTEM_PROMPT = '';
try {
  SYSTEM_PROMPT = fs.readFileSync(systemPromptPath, 'utf-8');
} catch {
  SYSTEM_PROMPT = 'Voce e o House Bot, assistente da VCA Construtora. Responda em portugues brasileiro, de forma natural, direta e comercial.';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOpenAIRetryableError(error) {
  return error?.status === 429
    || error?.status === 500
    || error?.status === 502
    || error?.status === 503
    || error?.status === 504
    || /rate|overloaded|temporarily|timeout/i.test(error?.message || '');
}

function isModelFallbackError(error) {
  return error?.status === 400
    || error?.status === 404
    || /model|not found|does not exist|unsupported|not available/i.test(error?.message || '');
}

function getModelPlan() {
  return [...new Set([OPENAI_MODEL, OPENAI_MODEL_FALLBACK].filter(Boolean))];
}

function buildFriendlyOpenAIError(error) {
  if (isOpenAIRetryableError(error)) {
    return Object.assign(
      new Error('A IA esta temporariamente sobrecarregada. Tente novamente em alguns instantes.'),
      { status: 503 }
    );
  }

  return Object.assign(
    new Error('Nao foi possivel obter resposta da IA no momento.'),
    { status: error?.status || 502 }
  );
}

const ROLE_LABELS = {
  admin: 'Administrador - acesso total ao sistema.',
  corretor: 'Corretor - acesso restrito a empreendimentos e estoque de unidades. Nao tem acesso a reservas, contratos, distratos, dados de clientes ou informacoes financeiras.',
};

function buildDataContext(contextData) {
  if (!contextData || Object.keys(contextData).length === 0) {
    return '';
  }

  let dataContext = '\n\n--- DADOS DO BANCO DE DADOS ---\n';
  for (const [key, value] of Object.entries(contextData)) {
    dataContext += `\n[${key.toUpperCase()}]:\n${JSON.stringify(value, null, 2)}\n`;
  }
  dataContext += '\n--- FIM DOS DADOS ---\n';
  return dataContext;
}

async function chat(userMessage, contextData, conversationHistory = [], userRole = 'corretor') {
  const roleLabel = ROLE_LABELS[userRole] || `Perfil: ${userRole}.`;
  const roleContext = `\n\n--- PERFIL DO USUARIO ---\n${roleLabel}\nSe o usuario perguntar algo fora do seu nivel de acesso, informe com educacao que voce nao pode fornecer essa informacao.\n--- FIM DO PERFIL ---\n`;
  const instructions = SYSTEM_PROMPT + roleContext + buildDataContext(contextData);

  const input = [
    ...conversationHistory.map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  let lastError;

  for (const model of getModelPlan()) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await client.responses.create({
          model,
          instructions,
          input,
          max_output_tokens: 2048,
          store: true,
        });

        return response.output_text;
      } catch (error) {
        lastError = error;

        if (isModelFallbackError(error) && model !== OPENAI_MODEL_FALLBACK) {
          console.warn(`[OpenAI] modelo ${model} indisponivel. Tentando fallback ${OPENAI_MODEL_FALLBACK}.`);
          break;
        }

        if (!isOpenAIRetryableError(error) || attempt === MAX_RETRIES) {
          break;
        }

        const delayMs = INITIAL_RETRY_DELAY_MS * attempt;
        console.warn(`[OpenAI] erro temporario no modelo ${model}, tentativa ${attempt}/${MAX_RETRIES}. Retentando em ${delayMs}ms.`);
        await sleep(delayMs);
      }
    }
  }

  throw buildFriendlyOpenAIError(lastError);
}

module.exports = { chat };
