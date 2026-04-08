const permissionService = require('../services/permissionService');

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Você não tem permissão para executar esta ação.',
      });
    }

    next();
  };
}

function requirePermissions(...permissionNames) {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;

      // Admin tem acesso total
      if (userRole === 'admin') {
        return next();
      }

      const hasAll = await permissionService.hasPermissions(userRole, permissionNames);

      if (!hasAll) {
        return res.status(403).json({
          error: 'Você não tem permissão para essa consulta.',
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

async function checkQuota(req, res, next) {
  try {
    const { role, daily_message_count, last_message_date } = req.user;

    // Admin não tem limite
    if (role === 'admin') {
      return next();
    }

    const today = new Date().toISOString().split('T')[0];
    const lastDate = last_message_date
      ? new Date(last_message_date).toISOString().split('T')[0]
      : null;

    // Se é um novo dia, o contador reinicia
    if (lastDate !== today) {
      req.user.daily_message_count = 0;
      return next();
    }

    if (daily_message_count >= 20) {
      return res.status(429).json({
        error: 'Você atingiu o limite de 20 mensagens por dia. Tente novamente amanhã.',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireRole, requirePermissions, checkQuota };
