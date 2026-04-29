const supabase = require('../database/supabase');
const bigQuery = require('./bigQueryClient');

const UPSERT_CHUNK_SIZE = 500;

function getDatasetRef(table) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const dataset = process.env.BIGQUERY_DATASET;
  if (!projectId || !dataset) {
    throw new Error('GOOGLE_CLOUD_PROJECT_ID e BIGQUERY_DATASET sao obrigatorios para sincronizacao BigQuery');
  }
  return `\`${projectId}.${dataset}.${table}\``;
}

function nowSql() {
  return "FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E*S%Ez', CURRENT_TIMESTAMP())";
}

const RAW_TABLE_COLUMNS = {
  TB_HIST_LEADS: [
    'id', 'referencia', 'referencia_data', 'ativo', 'idhistorico', 'idlead', 'data_cad', 'de', 'para',
    'de_nome', 'para_nome', 'motivo_cancelamento', 'data_cancelamento', 'painel_usuario', 'idusuario',
  ],
  TB_LEADS: [
    'id', 'referencia', 'referencia_data', 'ativo', 'idlead', 'idsituacao', 'situacao', 'data_cad',
    'nome', 'email', 'telefone', 'documento_cliente', 'cep_cliente', 'idponto_venda', 'ponto_venda',
    'conversao_original', 'conversao_ultimo', 'idempreendimento_primeiro', 'empreendimento_primeiro',
    'idempreendimento_ultimo', 'empreendimento_ultimo', 'idmotivo', 'motivo', 'idgestor', 'gestor',
    'idcorretor', 'corretor', 'idimobiliaria', 'imobiliaria', 'feedback', 'origem', 'origem_ultimo',
    'midia_ultimo', 'midia_original', 'renda_familiar', 'motivo_cancelamento', 'data_cancelamento',
    'data_ultima_interacao', 'ultima_data_conversao', 'data_reativacao', 'idsituacao_anterior',
    'nome_situacao_anterior_lead', 'descricao_motivo_cancelamento', 'possibilidade_venda',
    'inserido_bolsao', 'data_primeira_interacao_gestor', 'data_primeira_interacao_corretor', 'score',
    'idgestor_ultimo', 'gestor_ultimo', 'idcorretor_ultimo', 'corretor_ultimo', 'idcorretor_penultimo',
    'idimobiliaria_ultimo', 'corretor_penultimo', 'nome_momento_lead', 'novo', 'retorno',
    'data_ultima_alteracao', 'estado', 'cidade', 'regiao', 'vencido', 'data_vencimento',
    'empreendimento', 'caracteristicas', 'tags', 'conversao', 'idempreendimento',
    'codigointerno_empreendimento', 'reserva', 'origem_nome', 'origem_ultimo_nome',
  ],
  TB_PRECADASTROS: [
    'id', 'referencia', 'referencia_data', 'ativo', 'idprecadastro', 'codigointerno', 'idsituacao',
    'situacao', 'condicao_aprovada', 'idempreendimento', 'empreendimento', 'idunidade', 'unidade',
    'idcorretor', 'corretor', 'idimobiliaria', 'imobiliaria', 'idempresa', 'empresa', 'pessoa',
    'cep_cliente', 'renda_cliente_principal', 'idusuario_correspondente', 'usuario_correspondente',
    'idpessoa', 'idlead', 'valor_avaliacao', 'valor_aprovado', 'valor_subsidio', 'valor_total',
    'valor_fgts', 'saldo_devedor', 'prazo', 'observacoes', 'tabela', 'valor_prestacao',
    'carta_credito', 'vencimento_aprovacao', 'idmotivo_reprovacao', 'motivo_reprovacao',
    'descricao_motivo_reprovacao', 'idmotivo_cancelamento', 'motivo_cancelamento',
    'descricao_motivo_cancelamento', 'sla_vencimento', 'data_cad', 'empresa_correspondente',
    'idsituacao_anterior', 'situacao_anterior', 'data_ultima_alteracao_situacao',
    'idintencao_compra', 'intencao_compra', 'renda_total', 'tipo_venda', 'responsavel_cadastro',
  ],
  TB_PRECADASTROS_LOT: [
    'id', 'referencia', 'referencia_data', 'ativo', 'idprecadastro', 'codigointerno', 'idsituacao',
    'situacao', 'condicao_aprovada', 'idempreendimento', 'empreendimento', 'idunidade', 'unidade',
    'idcorretor', 'corretor', 'idimobiliaria', 'imobiliaria', 'idempresa', 'empresa', 'pessoa',
    'cep_cliente', 'renda_cliente_principal', 'idusuario_correspondente', 'usuario_correspondente',
    'idpessoa', 'idlead', 'valor_avaliacao', 'valor_aprovado', 'valor_subsidio', 'valor_total',
    'valor_fgts', 'saldo_devedor', 'prazo', 'observacoes', 'tabela', 'valor_prestacao',
    'carta_credito', 'vencimento_aprovacao', 'idmotivo_reprovacao', 'motivo_reprovacao',
    'descricao_motivo_reprovacao', 'idmotivo_cancelamento', 'motivo_cancelamento',
    'descricao_motivo_cancelamento', 'sla_vencimento', 'data_cad', 'empresa_correspondente',
    'idsituacao_anterior', 'situacao_anterior', 'data_ultima_alteracao_situacao',
    'idintencao_compra', 'intencao_compra', 'renda_total', 'tipo_venda', 'responsavel_cadastro',
  ],
};

function rawSelect(table) {
  const columns = RAW_TABLE_COLUMNS[table].map((column) => `\`${column}\``).join(',\n  ');
  return `SELECT\n  ${columns}\nFROM ${getDatasetRef(table)}`;
}

const TABLES = [
  {
    key: 'empreendimentos_cvcrm',
    label: 'Empreendimentos VCA',
    supabaseTable: 'empreendimentos_cvcrm',
    conflict: 'id_empreendimento',
    query: () => `
      SELECT
        idempreendimento AS id_empreendimento,
        nome,
        CAST(NULL AS STRING) AS endereco,
        cidade,
        estado,
        CAST(data_entrega AS STRING) AS data_entrega,
        CAST(NULL AS STRING) AS situacao_obra,
        0 AS quantidade_unidades_disponiveis,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('TB_EMPREENDIMENTOS')}
      WHERE idempreendimento IS NOT NULL
        AND nome IS NOT NULL
    `,
  },
  {
    key: 'empreendimentos_lotear',
    label: 'Empreendimentos LOTEAR',
    supabaseTable: 'empreendimentos_lotear',
    conflict: 'id_empreendimento',
    query: () => `
      SELECT
        idempreendimento AS id_empreendimento,
        nome,
        CAST(NULL AS STRING) AS endereco,
        cidade,
        estado,
        CAST(data_entrega AS STRING) AS data_entrega,
        CAST(NULL AS STRING) AS situacao_obra,
        0 AS quantidade_unidades_disponiveis,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('TB_EMPREENDIMENTOS_LOT')}
      WHERE idempreendimento IS NOT NULL
        AND nome IS NOT NULL
    `,
  },
  {
    key: 'vendas_cvcrm',
    label: 'Vendas VCA',
    supabaseTable: 'vendas_cvcrm',
    conflict: 'numero_reserva',
    query: () => `
      SELECT
        CAST(referencia AS STRING) AS numero_reserva,
        CAST(tipoVenda AS STRING) AS tipo_de_venda,
        empreendimento,
        CAST(unidade AS STRING) AS unidade,
        cliente AS titular_nome,
        CAST(NULL AS STRING) AS documento_cliente,
        corretor,
        imobiliaria,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('vw_Vendas')}
      WHERE referencia IS NOT NULL
    `,
  },
  {
    key: 'vendas_lotear',
    label: 'Vendas LOTEAR',
    supabaseTable: 'vendas_lotear',
    conflict: 'numero_reserva',
    query: () => `
      SELECT
        CAST(referencia AS STRING) AS numero_reserva,
        CAST(tipoVenda AS STRING) AS tipo_de_venda,
        empreendimento,
        CAST(unidade AS STRING) AS unidade,
        cliente AS titular_nome,
        CAST(NULL AS STRING) AS documento_cliente,
        corretor,
        imobiliaria,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('TB_VENDAS_LOT')}
      WHERE referencia IS NOT NULL
    `,
  },
  {
    key: 'estoque_cvcrm',
    label: 'Estoque VCA',
    supabaseTable: 'estoque_cvcrm',
    conflict: 'idunidade',
    query: () => `
      SELECT
        referencia AS idunidade,
        idEmpreendimento AS idempreendimento,
        nomeEmpreendimento AS nome_empreendimento,
        CAST(NULL AS STRING) AS tipo_empreendimento,
        etapa,
        bloco,
        CAST(unidade AS STRING) AS unidade,
        CAST(NULL AS FLOAT64) AS area_privativa,
        CAST(tipologia AS STRING) AS tipologia,
        CAST(NULL AS STRING) AS vagas_garagem,
        CAST(NULL AS INT64) AS situacao_mapa_disponibilidade,
        statusUnidade AS situacao,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('vw_EstoqueVendas')}
      WHERE referencia IS NOT NULL
    `,
  },
  {
    key: 'estoque_lotear',
    label: 'Estoque LOTEAR',
    supabaseTable: 'estoque_lotear',
    conflict: 'idunidade',
    query: () => `
      SELECT
        referencia AS idunidade,
        idEmpreendimento AS idempreendimento,
        nomeEmpreendimento AS nome_empreendimento,
        CAST(NULL AS STRING) AS tipo_empreendimento,
        etapa,
        bloco,
        CAST(unidade AS STRING) AS unidade,
        CAST(NULL AS FLOAT64) AS area_privativa,
        CAST(tipologia AS STRING) AS tipologia,
        CAST(NULL AS STRING) AS vagas_garagem,
        CAST(NULL AS INT64) AS situacao_mapa_disponibilidade,
        statusUnidade AS situacao,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('vw_EstoqueVendas_LOT')}
      WHERE referencia IS NOT NULL
    `,
  },
  {
    key: 'tabela_de_preco_cvcrm',
    label: 'Tabela de Preco VCA',
    supabaseTable: 'tabela_de_preco_cvcrm',
    conflict: 'idtabela,unidade,bloco',
    query: () => `
      SELECT
        idtabela,
        ANY_VALUE(SAFE_CAST(idempreendimento AS INT64)) AS idempreendimento,
        CAST(NULL AS INT64) AS idunidade,
        ANY_VALUE(empreendimento) AS empreendimento,
        ANY_VALUE(tabela) AS tabela,
        COALESCE(bloco, '') AS bloco,
        CAST(unidade AS STRING) AS unidade,
        ANY_VALUE(SAFE_CAST(REPLACE(CAST(area_privativa AS STRING), ',', '.') AS FLOAT64)) AS area_privativa,
        ANY_VALUE(valor_total) AS valor_total,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('TB_PRECOS')}
      WHERE idtabela IS NOT NULL
        AND SAFE_CAST(idempreendimento AS INT64) IS NOT NULL
        AND unidade IS NOT NULL
      GROUP BY idtabela, unidade, bloco
    `,
  },
  {
    key: 'tabela_de_preco_lotear',
    label: 'Tabela de Preco LOTEAR',
    supabaseTable: 'tabela_de_preco_lotear',
    conflict: 'idtabela,unidade,bloco',
    query: () => `
      SELECT
        idtabela,
        ANY_VALUE(SAFE_CAST(idempreendimento AS INT64)) AS idempreendimento,
        CAST(NULL AS INT64) AS idunidade,
        ANY_VALUE(empreendimento) AS empreendimento,
        ANY_VALUE(tabela) AS tabela,
        COALESCE(bloco, '') AS bloco,
        CAST(unidade AS STRING) AS unidade,
        ANY_VALUE(SAFE_CAST(REPLACE(CAST(area_privativa AS STRING), ',', '.') AS FLOAT64)) AS area_privativa,
        ANY_VALUE(valor_total) AS valor_total,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('TB_PRECOS_LOT')}
      WHERE idtabela IS NOT NULL
        AND SAFE_CAST(idempreendimento AS INT64) IS NOT NULL
        AND unidade IS NOT NULL
      GROUP BY idtabela, unidade, bloco
    `,
  },
  {
    key: 'distratos_cvcrm',
    label: 'Distratos VCA',
    supabaseTable: 'distratos_cvcrm',
    conflict: 'id_distrato',
    query: () => `
      SELECT
        CAST(referencia AS STRING) AS id_distrato,
        SAFE_CAST(referencia AS INT64) AS id_reserva,
        situacaoAtual AS situacao_atual,
        empreendimento,
        CAST(NULL AS STRING) AS etapa,
        bloco,
        CAST(unidade AS STRING) AS unidade,
        CAST(NULL AS STRING) AS corretor,
        CAST(NULL AS STRING) AS imobiliaria,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('vw_DistratosStatus')}
      WHERE StatusDistrato = 'OK'
        AND referencia IS NOT NULL
    `,
  },
  {
    key: 'distratos_lotear',
    label: 'Distratos LOTEAR',
    supabaseTable: 'distratos_lotear',
    conflict: 'id_distrato',
    query: () => `
      SELECT
        CAST(referencia AS STRING) AS id_distrato,
        SAFE_CAST(referencia AS INT64) AS id_reserva,
        situacaoAtual AS situacao_atual,
        empreendimento,
        CAST(NULL AS STRING) AS etapa,
        bloco,
        CAST(unidade AS STRING) AS unidade,
        CAST(NULL AS STRING) AS corretor,
        CAST(NULL AS STRING) AS imobiliaria,
        ${nowSql()} AS synced_at
      FROM ${getDatasetRef('vw_DistratosStatus_LOT')}
      WHERE StatusDistrato = 'OK'
        AND referencia IS NOT NULL
    `,
  },
  {
    key: 'TB_HIST_LEADS',
    label: 'Historico de Leads',
    supabaseTable: 'TB_HIST_LEADS',
    replace: true,
    query: () => rawSelect('TB_HIST_LEADS'),
  },
  {
    key: 'TB_LEADS',
    label: 'Leads',
    supabaseTable: 'TB_LEADS',
    replace: true,
    query: () => rawSelect('TB_LEADS'),
  },
  {
    key: 'TB_PRECADASTROS',
    label: 'Pre-cadastros VCA',
    supabaseTable: 'TB_PRECADASTROS',
    replace: true,
    query: () => rawSelect('TB_PRECADASTROS'),
  },
  {
    key: 'TB_PRECADASTROS_LOT',
    label: 'Pre-cadastros LOTEAR',
    supabaseTable: 'TB_PRECADASTROS_LOT',
    replace: true,
    query: () => rawSelect('TB_PRECADASTROS_LOT'),
  },
];

function getPlan(scope) {
  switch (scope) {
    case 'source:cvcrm':
      return TABLES.filter((table) => table.key.endsWith('_cvcrm') || ['TB_HIST_LEADS', 'TB_LEADS', 'TB_PRECADASTROS'].includes(table.key));
    case 'source:lotear':
      return TABLES.filter((table) => table.key.endsWith('_lotear') || table.key === 'TB_PRECADASTROS_LOT');
    case 'all':
    case undefined:
    case null:
      return TABLES;
    default:
      if (scope.startsWith('table:')) {
        const tableKey = scope.slice('table:'.length);
        return TABLES.filter((table) => table.key === tableKey);
      }
      return TABLES;
  }
}

function getPlanTableDefinitions(plan) {
  return plan.map((table) => [table.key, table.label]);
}

function getConflictKey(row, conflict) {
  return conflict
    .split(',')
    .map((column) => {
      const value = row[column.trim()];
      return value == null ? '' : String(value);
    })
    .join('\u001f');
}

function dedupeRowsForConflict(rows, conflict) {
  if (!conflict) {
    return rows;
  }

  const byKey = new Map();
  for (const row of rows) {
    byKey.set(getConflictKey(row, conflict), row);
  }

  return Array.from(byKey.values());
}

async function deleteExistingRows(tableName) {
  const { error } = await supabase.from(tableName).delete().not('id', 'is', null);
  if (error) {
    throw new Error(`Erro ao limpar ${tableName}: ${error.message}`);
  }
}

async function writeRows(table, rows, progress) {
  const rowsToWrite = table.replace ? rows : dedupeRowsForConflict(rows, table.conflict);
  const duplicateCount = rows.length - rowsToWrite.length;

  if (table.replace) {
    progress?.(table.key, { message: `Limpando ${table.label} antes da carga...` });
    await deleteExistingRows(table.supabaseTable);
  } else if (duplicateCount > 0) {
    progress?.(table.key, {
      message: `${table.label}: ${duplicateCount} duplicidade(s) removida(s) antes do upsert.`,
    });
  }

  let written = 0;
  for (let index = 0; index < rowsToWrite.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rowsToWrite.slice(index, index + UPSERT_CHUNK_SIZE);
    const query = supabase.from(table.supabaseTable);
    const { data, error } = table.replace
      ? await query.insert(chunk).select('id')
      : await query.upsert(chunk, { onConflict: table.conflict }).select();

    if (error) {
      throw new Error(`Erro ao salvar ${table.supabaseTable}: ${error.message}`);
    }

    written += data?.length || chunk.length;
    progress?.(table.key, {
      updatedRecords: written,
      completedPages: Math.ceil((index + chunk.length) / UPSERT_CHUNK_SIZE),
      progressPercent: rowsToWrite.length === 0 ? 100 : Math.round(((index + chunk.length) / rowsToWrite.length) * 100),
      message: `${table.label}: ${written}/${rowsToWrite.length} registros gravados.`,
    });
  }

  return written;
}

async function syncTable(table, progress) {
  const startedAt = Date.now();
  progress?.(table.key, {
    status: 'running',
    startedAt: new Date(startedAt).toISOString(),
    totalPages: 0,
    completedPages: 0,
    progressPercent: 0,
    message: `Consultando BigQuery para ${table.label}...`,
  });

  const rows = await bigQuery.queryRows(table.query());
  const totalPages = Math.max(1, Math.ceil(rows.length / UPSERT_CHUNK_SIZE));
  progress?.(table.key, {
    totalPages,
    totalRegistrosCvcrm: rows.length,
    message: `${rows.length} registros retornados do BigQuery para ${table.label}.`,
  });

  const updatedRecords = await writeRows(table, rows, progress);

  progress?.(table.key, {
    status: 'completed',
    completedPages: totalPages,
    progressPercent: 100,
    estimatedRemainingMs: 0,
    updatedRecords,
    completedAt: new Date().toISOString(),
    message: `${table.label} sincronizado via BigQuery.`,
  });

  return {
    table: table.key,
    updatedRecords,
    totalPages,
    completedPages: totalPages,
    totalRegistrosCvcrm: rows.length,
  };
}

async function syncScoped(scope, mode, progress) {
  const plan = getPlan(scope);
  const tables = {};
  let totalUpdatedRecords = 0;

  for (const table of plan) {
    try {
      const result = await syncTable(table, progress);
      tables[table.key] = result;
      totalUpdatedRecords += result.updatedRecords;
    } catch (error) {
      progress?.(table.key, {
        status: 'failed',
        error: error.message,
        completedAt: new Date().toISOString(),
        message: `Falha ao sincronizar ${table.label}.`,
      });
      throw error;
    }
  }

  return {
    mode: mode === 'partial' ? 'partial' : 'total',
    scope: scope || 'all',
    tables,
    totalUpdatedRecords,
  };
}

module.exports = {
  syncScoped,
  getPlan,
  getPlanTableDefinitions,
  TABLES,
};
