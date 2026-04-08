const { Router } = require('express');
const syncController = require('../controllers/syncController');
const authMiddleware = require('../middlewares/auth');
const { requireRole } = require('../middlewares/permissions');

const router = Router();

// Apenas admin pode sincronizar dados
router.use(authMiddleware);
router.use(requireRole('admin'));

router.post('/empreendimentos', syncController.syncEmpreendimentos);
router.post('/vendas', syncController.syncVendas);
router.post('/jobs', syncController.startSyncAll);
router.get('/jobs/:jobId', syncController.getSyncJob);

module.exports = router;
