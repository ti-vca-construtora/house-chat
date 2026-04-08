const cvcrmService = require('../services/cvcrmService');
const syncJobService = require('../services/syncJobService');

async function syncEmpreendimentos(req, res, next) {
  try {
    const result = await cvcrmService.syncEmpreendimentos(cvcrmService.DATA_SOURCES[0]);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function syncVendas(req, res, next) {
  try {
    const mode = req.body?.mode === 'partial' ? 'partial' : 'total';
    const result = await cvcrmService.syncVendas(cvcrmService.DATA_SOURCES[0], mode);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function startSyncAll(req, res, next) {
  try {
    const mode = req.body?.mode === 'partial' ? 'partial' : 'total';
    const scope = req.body?.scope || 'all';

    const plan = cvcrmService.getScopedPlan(scope);
    const tableDefs = cvcrmService.getPlanTableDefinitions(plan);
    const job = syncJobService.createJob(mode, scope, tableDefs);

    res.status(202).json({ success: true, jobId: job.id, job });

    syncJobService.runJob(job.id, async (reportProgress) => {
      return cvcrmService.syncScoped(scope, mode, reportProgress);
    });
  } catch (err) {
    next(err);
  }
}

async function getSyncJob(req, res, next) {
  try {
    const job = syncJobService.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job de sincronização não encontrado' });
    }

    res.json({ success: true, job });
  } catch (err) {
    next(err);
  }
}

module.exports = { syncEmpreendimentos, syncVendas, startSyncAll, getSyncJob };
