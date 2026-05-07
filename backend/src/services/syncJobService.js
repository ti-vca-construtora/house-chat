const { randomUUID } = require('crypto');

const jobs = new Map();
const TABLE_DEFINITIONS = [
  ['vw_Vendas_Consolidada', 'Vendas Consolidada'],
];

function createBaseTableState(label) {
  return {
    label,
    status: 'pending',
    totalPages: 0,
    completedPages: 0,
    progressPercent: 0,
    estimatedRemainingMs: null,
    updatedRecords: 0,
    currentPage: null,
    totalRegistrosCvcrm: null,
    pageRange: null,
    message: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

function createJob(mode, scope, tableDefinitions) {
  const now = new Date().toISOString();
  const defs = tableDefinitions && tableDefinitions.length > 0 ? tableDefinitions : TABLE_DEFINITIONS;
  const tables = Object.fromEntries(
    defs.map(([key, label]) => [key, createBaseTableState(label)])
  );

  const job = {
    id: randomUUID(),
    mode,
    scope: scope || 'all',
    status: 'queued',
    createdAt: now,
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
    tables,
  };

  jobs.set(job.id, job);
  return job;
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function updateTable(jobId, tableKey, patch) {
  const job = getJob(jobId);
  if (!job || !job.tables[tableKey]) {
    return;
  }

  job.tables[tableKey] = {
    ...job.tables[tableKey],
    ...patch,
  };
}

function reportProgress(jobId, tableKey, patch) {
  updateTable(jobId, tableKey, patch);
}

async function runJob(jobId, runner) {
  const job = getJob(jobId);
  if (!job) {
    return;
  }

  job.status = 'running';
  job.startedAt = new Date().toISOString();

  try {
    const result = await runner((tableKey, patch) => reportProgress(jobId, tableKey, patch));
    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.result = result;
  } catch (error) {
    job.status = 'failed';
    job.completedAt = new Date().toISOString();
    job.error = error.message || 'Erro na sincronização';
  }
}

module.exports = {
  createJob,
  getJob,
  runJob,
};
