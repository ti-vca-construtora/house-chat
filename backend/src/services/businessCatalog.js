const BUSINESS_CATALOG = {
  tables: {
    vendasConsolidada: 'vw_Vendas_Consolidada',
  },
  concepts: {
    empreendimento: {
      synonyms: ['obra', 'projeto', 'condominio', 'residencial', 'loteamento'],
      tables: ['vw_Vendas_Consolidada'],
      fields: ['empreendimento', 'etapa', 'bloco', 'unidade', 'cidade', 'Fonte'],
    },
    estoque: {
      synonyms: ['unidade', 'apartamento', 'apto', 'disponibilidade', 'tipologia', 'quarto', 'suite', 'terreo'],
      tables: ['vw_Vendas_Consolidada'],
      fields: ['empreendimento', 'etapa', 'bloco', 'unidade', 'Status', 'cliente', 'Fonte'],
    },
    preco: {
      synonyms: ['preco', 'valor', 'tabela', 'mais barato', 'menor preco'],
      tables: ['vw_Vendas_Consolidada'],
      fields: ['empreendimento', 'bloco', 'unidade', 'nomeTabelaAjustado', 'Valor_VGV_Correto', 'Fonte'],
    },
    vendas: {
      synonyms: [
        'venda', 'vendas', 'compra', 'compras', 'reserva', 'reservas', 'contrato', 'contratos',
        'cliente', 'clientes', 'comprador', 'compradores', 'titular', 'titulares', 'corretor',
        'corretores', 'imobiliaria', 'imobiliarias', 'vgv', 'renda', 'genero', 'gÃªnero',
        'sexo', 'estado civil', 'tabela', 'fonte', 'base',
      ],
      tables: ['vw_Vendas_Consolidada'],
      fields: [
        'referencia', 'dataVenda', 'cliente', 'empreendimento', 'etapa', 'bloco', 'unidade',
        'cidade', 'corretor', 'imobiliaria', 'estadoCivil', 'sexo', 'renda',
        'nomeTabelaAjustado', 'Fonte', 'Status', 'Valor_VGV_Correto',
      ],
    },
    distratos: {
      synonyms: [
        'distrato', 'distratos', 'rescisao', 'rescisÃ£o', 'rescisoes', 'rescisÃµes',
        'cancelamento', 'cancelamentos', 'cancelada', 'canceladas', 'cancelado', 'cancelados',
        'inativo', 'inativos', 'motivo', 'motivos',
      ],
      tables: ['vw_Vendas_Consolidada'],
      fields: [
        'referencia', 'dataVenda', 'cliente', 'empreendimento', 'etapa', 'bloco', 'unidade',
        'corretor', 'imobiliaria', 'Fonte', 'Status', 'distrato_motivoDistrato',
        'Valor_VGV_Correto',
      ],
    },
    leads: {
      synonyms: ['lead', 'origem', 'midia', 'conversao', 'historico'],
      tables: ['vw_Vendas_Consolidada'],
      fields: ['cliente', 'empreendimento', 'corretor', 'imobiliaria', 'Fonte'],
    },
    precadastros: {
      synonyms: ['pre-cadastro', 'precadastro', 'aprovacao', 'correspondente', 'renda'],
      tables: ['vw_Vendas_Consolidada'],
      fields: ['cliente', 'renda', 'empreendimento', 'unidade', 'corretor', 'imobiliaria', 'Valor_VGV_Correto'],
    },
  },
  relationships: {
    venda_unidade: {
      from: ['vw_Vendas_Consolidada'],
      to: ['vw_Vendas_Consolidada'],
      fallbackKeys: ['empreendimento', 'bloco', 'unidade'],
    },
  },
  permissions: {
    empreendimentos: ['view_empreendimentos'],
    estoque: ['view_empreendimentos'],
    tabela_preco: ['view_tabela_preco'],
    vendas: ['view_reservas'],
    distratos: ['view_reservas'],
    leads: ['view_clientes'],
    precadastros: ['view_clientes'],
    geral: ['view_empreendimentos'],
  },
  operationalActions: [
    'bloquear',
    'bloqueia',
    'bloqueie',
    'bloqueio',
    'reservar',
    'reserva essa',
    'reserve',
    'segurar',
    'segura',
    'segure',
    'simular',
    'financiamento',
    'aprovar',
    'proposta',
    'acionar corretor',
    'condicoes de pagamento',
    'condição de pagamento',
  ],
};

function getCatalogSummary() {
  return {
    concepts: Object.fromEntries(
      Object.entries(BUSINESS_CATALOG.concepts).map(([key, value]) => [
        key,
        { tables: value.tables, fields: value.fields, synonyms: value.synonyms },
      ])
    ),
    relationships: BUSINESS_CATALOG.relationships,
  };
}

module.exports = { BUSINESS_CATALOG, getCatalogSummary };
