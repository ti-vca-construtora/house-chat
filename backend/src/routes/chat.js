const { Router } = require('express');
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middlewares/auth');
const { checkQuota } = require('../middlewares/permissions');

const router = Router();

// Todas as rotas de chat requerem autenticação
router.use(authMiddleware);

router.post('/send', checkQuota, chatController.sendMessage);
router.get('/conversations', chatController.getConversations);
router.get('/conversations/:conversationId/messages', chatController.getMessages);
router.delete('/conversations/:conversationId', chatController.deleteConversation);

module.exports = router;
