const { classifyMessage, quickRoleCheck, getBlockedMessage, RESTRICTED_INTENTS_FOR_CORRETOR } = require('../ai/intentMapper');
const permissionService = require('../services/permissionService');
const supabaseService = require('../services/supabaseService');
const claudeService = require('../services/claudeService');

async function sendMessage(req, res, next) {
  try {
    const { message, conversationId } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Mensagem é obrigatória' });
    }

    const trimmed = message.trim();

    // ── Layer 1: verificação rápida por keywords (sem chamar IA) ─────────────
    if (userRole !== 'admin') {
      const layer1 = quickRoleCheck(trimmed, userRole);
      if (layer1.blocked) {
        let convId = conversationId;
        if (!convId) {
          const conv = await supabaseService.createConversation(userId, trimmed.slice(0, 50));
          convId = conv.id;
        }
        await supabaseService.saveMessage(convId, 'user', trimmed);
        await supabaseService.saveMessage(convId, 'assistant', layer1.message);
        return res.json({ conversationId: convId, response: layer1.message, permissionDenied: true });
      }
    }

    // 1. Classificar intenção da pergunta via Claude Haiku
    const { intents, intent, permissions, entities } = await classifyMessage(trimmed);

    // ── Layer 2: verificação pós-classificação por intent ────────────────────
    if (userRole !== 'admin') {
      const hasPerms = await permissionService.hasPermissions(userRole, permissions);
      if (!hasPerms) {
        const blockedIntent = intents.find((i) => RESTRICTED_INTENTS_FOR_CORRETOR.has(i)) || intents[0];
        const errorMsg = getBlockedMessage(blockedIntent);

        let convId = conversationId;
        if (!convId) {
          const conv = await supabaseService.createConversation(userId, trimmed.slice(0, 50));
          convId = conv.id;
        }
        await supabaseService.saveMessage(convId, 'user', trimmed);
        await supabaseService.saveMessage(convId, 'assistant', errorMsg);
        return res.json({ conversationId: convId, response: errorMsg, permissionDenied: true });
      }
    }

    // 3. Verificar/criar conversa
    let convId = conversationId;
    if (!convId) {
      const conv = await supabaseService.createConversation(userId, trimmed.slice(0, 50));
      convId = conv.id;
    } else {
      await supabaseService.getConversation(convId, userId);
    }

    // 4. Salvar mensagem do usuário
    await supabaseService.saveMessage(convId, 'user', trimmed);

    // 5. Buscar dados do banco baseado nos intents identificados
    const contextData = await supabaseService.fetchContextData(intents, entities);

    // 6. Pegar histórico recente da conversa (últimas 10 mensagens)
    const history = await supabaseService.getMessages(convId, userId);
    const recentHistory = history.slice(-10);

    // 7. Enviar para Claude com contexto dos dados e role do usuário
    const aiResponse = await claudeService.chat(trimmed, contextData, recentHistory, userRole);

    // 8. Salvar resposta da IA
    await supabaseService.saveMessage(convId, 'assistant', aiResponse);

    // 9. Incrementar contador diário
    await supabaseService.incrementMessageCount(userId);

    // 10. Atualizar título se for primeira mensagem
    if (!conversationId) {
      await supabaseService.updateConversationTitle(convId, trimmed.slice(0, 60));
    }

    res.json({ conversationId: convId, response: aiResponse });
  } catch (err) {
    next(err);
  }
}

async function getConversations(req, res, next) {
  try {
    const conversations = await supabaseService.getConversations(req.user.id);
    res.json(conversations);
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const { conversationId } = req.params;
    const messages = await supabaseService.getMessages(conversationId, req.user.id);
    res.json(messages);
  } catch (err) {
    next(err);
  }
}

async function deleteConversation(req, res, next) {
  try {
    const { conversationId } = req.params;
    // Validar ownership
    await supabaseService.getConversation(conversationId, req.user.id);

    const supabase = require('../database/supabase');
    // Deletar mensagens primeiro
    await supabase.from('messages').delete().eq('conversation_id', conversationId);
    await supabase.from('conversations').delete().eq('id', conversationId);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendMessage, getConversations, getMessages, deleteConversation };
