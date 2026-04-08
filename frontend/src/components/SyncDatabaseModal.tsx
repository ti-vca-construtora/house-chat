'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  CheckCircle2,
  Clock3,
  Database,
  FileX,
  Loader2,
  Package,
  RefreshCw,
  Tag,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type { SyncJob, SyncMode, SyncScope, SyncTableKey, SyncTableProgress } from '@/types';

interface SyncDatabaseModalProps {
  open: boolean;
  loading: boolean;
  job: SyncJob | null;
  error: string | null;
  onConfirm: (scope: SyncScope, mode: SyncMode) => void;
  onReset: () => void;
  onClose: () => void;
}

//  Helpers 

function getModeLabel(mode: SyncMode | null) {
  return mode === 'partial' ? 'Parcial' : 'Total';
}

function getScopeLabel(scope: SyncScope | string | null | undefined) {
  switch (scope) {
    case 'all': return 'Todas as Bases';
    case 'source:cvcrm': return 'Base VCA';
    case 'source:lotear': return 'Base LOTEAR';
    case 'table:empreendimentos_cvcrm': return 'Empreendimentos VCA';
    case 'table:vendas_cvcrm': return 'Vendas VCA';
    case 'table:estoque_cvcrm': return 'Estoque VCA';
    case 'table:distratos_cvcrm': return 'Distratos VCA';
    case 'table:tabela_de_preco_cvcrm': return 'Tabela de Preços VCA';
    case 'table:empreendimentos_lotear': return 'Empreendimentos LOTEAR';
    case 'table:vendas_lotear': return 'Vendas LOTEAR';
    case 'table:estoque_lotear': return 'Estoque LOTEAR';
    case 'table:distratos_lotear': return 'Distratos LOTEAR';
    case 'table:tabela_de_preco_lotear': return 'Tabela de Preços LOTEAR';
    default: return 'Banco de Dados';
  }
}

function formatEta(estimatedRemainingMs: number | null) {
  if (estimatedRemainingMs == null) return 'Calculando...';
  if (estimatedRemainingMs <= 0) return 'Finalizando';
  const totalSeconds = Math.ceil(estimatedRemainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes === 0 ? `${seconds}s restantes` : `${minutes}m ${seconds}s restantes`;
}

//  Table definitions ────────────────────────────────────────────

const TABLE_ROWS = [
  { label: 'Empreendimentos',  Icon: Building2,  scopeVca: 'table:empreendimentos_cvcrm'   as SyncScope, scopeLotear: 'table:empreendimentos_lotear'   as SyncScope },
  { label: 'Vendas',           Icon: TrendingUp, scopeVca: 'table:vendas_cvcrm'            as SyncScope, scopeLotear: 'table:vendas_lotear'            as SyncScope },
  { label: 'Estoque',          Icon: Package,    scopeVca: 'table:estoque_cvcrm'           as SyncScope, scopeLotear: 'table:estoque_lotear'           as SyncScope },
  { label: 'Distratos',        Icon: FileX,      scopeVca: 'table:distratos_cvcrm'         as SyncScope, scopeLotear: 'table:distratos_lotear'         as SyncScope },
  { label: 'Tabela de Precos', Icon: Tag,        scopeVca: 'table:tabela_de_preco_cvcrm'   as SyncScope, scopeLotear: 'table:tabela_de_preco_lotear'   as SyncScope },
];

const ORDERED_TABLE_KEYS: SyncTableKey[] = [
  'empreendimentos_cvcrm', 'vendas_cvcrm', 'estoque_cvcrm', 'distratos_cvcrm', 'tabela_de_preco_cvcrm',
  'empreendimentos_lotear', 'vendas_lotear', 'estoque_lotear', 'distratos_lotear', 'tabela_de_preco_lotear',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TableProgressCard({ table }: { table: SyncTableProgress }) {
  const isRunning = table.status === 'running';
  const isDone    = table.status === 'completed';
  const isFailed  = table.status === 'failed';

  return (
    <div className={`rounded-lg border px-4 py-3 transition-colors ${
      isDone    ? 'border-emerald-500/30 bg-emerald-500/5' :
      isFailed  ? 'border-red-500/30 bg-red-500/5' :
      isRunning ? 'border-brand-500/40 bg-brand-500/5' :
      'border-dark-800 bg-dark-950'
    }`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isDone    && <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />}
          {isFailed  && <XCircle      size={14} className="text-red-400 shrink-0" />}
          {isRunning && <Loader2      size={14} className="animate-spin text-brand-400 shrink-0" />}
          {table.status === 'pending' && <Clock3 size={14} className="text-dark-500 shrink-0" />}
          <span className="text-sm font-medium text-dark-100 truncate">{table.label}</span>
        </div>
        <span className="text-xs text-dark-500 shrink-0 tabular-nums">
          {table.completedPages}/{Math.max(table.totalPages, table.completedPages, 1)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-dark-800 mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-emerald-500' : isFailed ? 'bg-red-500' : 'bg-brand-500'}`}
          style={{ width: `${Math.max(isDone ? 100 : 4, table.progressPercent)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-dark-500">
        <span>{table.progressPercent}%</span>
        <span>{table.updatedRecords} registros</span>
        {isRunning && (
          <span className="inline-flex items-center gap-1">
            <Clock3 size={11} />{formatEta(table.estimatedRemainingMs)}
          </span>
        )}
        {table.message && <span className="text-dark-600 truncate max-w-[200px]">{table.message}</span>}
      </div>
    </div>
  );
}

function getOrderedTables(job: SyncJob) {
  return ORDERED_TABLE_KEYS
    .filter((key) => key in job.tables)
    .map((key) => job.tables[key])
    .filter((t): t is SyncTableProgress => t != null);
}

// ─── Button styles ────────────────────────────────────────────────────────────

const btnSecondary = 'rounded-lg px-3 py-1.5 text-xs font-medium border border-dark-700 text-dark-300 hover:bg-dark-800 hover:text-dark-100 transition-colors';
const btnSource    = 'w-full rounded-lg px-3 py-2 text-xs font-semibold border border-dark-700 text-dark-300 hover:bg-dark-800 hover:border-dark-600 hover:text-dark-100 transition-colors mt-1';

// ─── Main component ───────────────────────────────────────────────────────────

export default function SyncDatabaseModal({
  open,
  loading,
  job,
  error,
  onConfirm,
  onReset,
  onClose,
}: SyncDatabaseModalProps) {
  const [selectedMode, setSelectedMode] = useState<SyncMode>('total');

  const completed    = job?.status === 'completed';
  const jobError     = job?.status === 'failed' ? job.error : null;
  const showProgress = !!(loading || job);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/80 backdrop-blur-sm px-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="w-full max-w-3xl rounded-2xl border border-dark-700 bg-dark-900 shadow-2xl max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-dark-800 shrink-0">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/20 text-brand-300 shrink-0">
                    {loading ? <Loader2 size={20} className="animate-spin" /> : <Database size={20} />}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-dark-100">Sincronizacao de Banco</h2>
                    <p className="text-xs text-dark-400 mt-0.5">
                      {showProgress
                        ? `${getScopeLabel(job?.scope)} — modo ${getModeLabel(job?.mode ?? null)}`
                        : 'Selecione as tabelas e o modo de sincronizacao.'}
                    </p>
                  </div>
                </div>

                {!showProgress && !error && (
                  <div className="flex items-center gap-1 rounded-lg border border-dark-700 bg-dark-950 p-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedMode('total')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        selectedMode === 'total' ? 'bg-brand-600 text-white' : 'text-dark-400 hover:text-dark-200'
                      }`}
                    >
                      Total
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedMode('partial')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        selectedMode === 'partial' ? 'bg-brand-600 text-white' : 'text-dark-400 hover:text-dark-200'
                      }`}
                    >
                      Parcial
                    </button>
                  </div>
                )}
              </div>

              {!showProgress && !error && (
                <p className="mt-3 text-xs text-dark-500 bg-dark-950 border border-dark-800 rounded-lg px-3 py-2">
                  {selectedMode === 'total'
                    ? 'Modo Total  percorre todas as paginas disponiveis na API para cada tabela.'
                    : 'Modo Parcial  sincroniza apenas as 5 ultimas paginas de vendas e todos os empreendimentos.'}
                </p>
              )}
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">

              {/* Selection view */}
              {!showProgress && !error && (
                <>
                  <button
                    type="button"
                    onClick={() => onConfirm('all', selectedMode)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-brand-500/40 bg-brand-600/10 hover:bg-brand-600/20 text-brand-300 font-semibold py-3 text-sm transition-colors"
                  >
                    <RefreshCw size={15} />
                    Sincronizar todas as tabelas  VCA + LOTEAR
                  </button>

                  <div className="grid grid-cols-2 gap-4">
                    {/* VCA */}
                    <div className="rounded-xl border border-dark-800 bg-dark-950 overflow-hidden">
                      <div className="px-4 py-3 border-b border-dark-800 flex items-center justify-between">
                        <span className="text-sm font-bold text-dark-100">Base VCA</span>
                        <span className="text-xs text-dark-500 bg-dark-800 px-2 py-0.5 rounded-full">vca.cvcrm.com.br</span>
                      </div>
                      <div className="divide-y divide-dark-800/60">
                        {TABLE_ROWS.map(({ label, Icon, scopeVca }) => (
                          <div key={label} className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-dark-900 group transition-colors">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon size={14} className="text-dark-500 group-hover:text-brand-400 shrink-0 transition-colors" />
                              <span className="text-sm text-dark-300 group-hover:text-dark-100 transition-colors truncate">{label}</span>
                            </div>
                            <button type="button" onClick={() => onConfirm(scopeVca, selectedMode)} className={btnSecondary}>
                              Sync
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 pb-4 pt-2">
                        <button type="button" onClick={() => onConfirm('source:cvcrm', selectedMode)} className={btnSource}>
                          Sincronizar Base VCA completa
                        </button>
                      </div>
                    </div>

                    {/* LOTEAR */}
                    <div className="rounded-xl border border-dark-800 bg-dark-950 overflow-hidden">
                      <div className="px-4 py-3 border-b border-dark-800 flex items-center justify-between">
                        <span className="text-sm font-bold text-dark-100">Base LOTEAR</span>
                        <span className="text-xs text-dark-500 bg-dark-800 px-2 py-0.5 rounded-full">vcalotear.cvcrm.com.br</span>
                      </div>
                      <div className="divide-y divide-dark-800/60">
                        {TABLE_ROWS.map(({ label, Icon, scopeLotear }) => (
                          <div key={label} className="flex items-center justify-between px-4 py-3 gap-3 hover:bg-dark-900 group transition-colors">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Icon size={14} className="text-dark-500 group-hover:text-brand-400 shrink-0 transition-colors" />
                              <span className="text-sm text-dark-300 group-hover:text-dark-100 transition-colors truncate">{label}</span>
                            </div>
                            <button type="button" onClick={() => onConfirm(scopeLotear, selectedMode)} className={btnSecondary}>
                              Sync
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 pb-4 pt-2">
                        <button type="button" onClick={() => onConfirm('source:lotear', selectedMode)} className={btnSource}>
                          Sincronizar Base LOTEAR completa
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Progress view */}
              {showProgress && job && (
                <>
                  <div className="flex items-center gap-3 rounded-xl border border-dark-800 bg-dark-950 px-4 py-3 text-sm text-dark-300">
                    {loading
                      ? <Loader2 size={15} className="animate-spin text-brand-400 shrink-0" />
                      : <Database size={15} className="text-brand-300 shrink-0" />}
                    <span>Job <span className="font-mono text-dark-400">{job.id.slice(0, 8)}...</span></span>
                    <span className="ml-auto text-xs text-dark-500">{getScopeLabel(job.scope)}  Modo {getModeLabel(job.mode)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {getOrderedTables(job).map((table) => (
                      <TableProgressCard key={table.label} table={table} />
                    ))}
                  </div>
                </>
              )}

              {/* Completion summary */}
              {completed && job?.result && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  <div className="flex items-center gap-2 font-semibold mb-3">
                    <CheckCircle2 size={18} />
                    Sincronizacao concluida com sucesso
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-emerald-100 text-xs mb-3">
                    {Object.values(job.result.tables).map((table) => (
                      <div key={table.table} className="flex items-center justify-between">
                        <span className="text-emerald-200/70">{job.tables[table.table as SyncTableKey]?.label ?? table.table}</span>
                        <span className="font-medium tabular-nums">{table.updatedRecords} reg.</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-emerald-500/20 pt-2 font-semibold">
                    Total: {job.result.totalUpdatedRecords} registros atualizados
                  </div>
                </div>
              )}

              {/* Error block */}
              {(jobError || error) && !loading && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                  <div className="flex items-center gap-2 font-semibold mb-2">
                    <XCircle size={18} />
                    Falha na sincronizacao
                  </div>
                  <p className="text-red-100 text-xs">{jobError || error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap justify-end gap-3 border-t border-dark-800 px-6 py-4 shrink-0">
              {!loading && (job || error) && (
                <button type="button" onClick={onReset} className={btnSecondary}>
                  Nova sincronizacao
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-lg border border-dark-700 px-4 py-2 text-sm text-dark-200 transition-colors hover:bg-dark-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}