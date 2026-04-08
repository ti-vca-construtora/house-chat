const { Router } = require('express');
const chatRoutes = require('./chat');
const syncRoutes = require('./sync');

const router = Router();

router.use('/chat', chatRoutes);
router.use('/sync', syncRoutes);

module.exports = router;
