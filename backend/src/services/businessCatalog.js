const BUSINESS_CATALOG = {
  concepts: {
    empreendimento: {
      synonyms: ['obra', 'projeto', 'condominio', 'residencial', 'loteamento'],
      tables: ['empreendimentos_cvcrm', 'empreendimentos_lotear'],
      fields: ['nome', 'cidade', 'estado', 'data_entrega', 'situacao_obra'],
    },
    estoque: {
      synonyms: ['unidade', 'apartamento', 'apto', 'disponibilidade', 'tipologia', 'quarto', 'suite', 'terreo'],
      tables: ['estoque_cvcrm', 'estoque_lotear'],
      fields: ['nome_empreendimento', 'bloco', 'unidade', 'situacao', 'tipologia', 'area_privativa', 'vagas_garagem'],
    },
    preco: {
      synonyms: ['preco', 'valor', 'tabela', 'mais barato', 'menor preco'],
      tables: ['tabela_de_preco_cvcrm', 'tabela_de_preco_lotear'],
      fields: ['empreendimento', 'bloco', 'unidade', 'area_privativa', 'valor_total', 'tabela', 'idunidade'],
    },
    vendas: {
      synonyms: ['venda', 'reserva', 'contrato', 'cliente', 'corretor', 'imobiliaria'],
      tables: ['vendas_cvcrm', 'vendas_lotear'],
      fields: ['numero_reserva', 'tipo_de_venda', 'empreendimento', 'unidade', 'titular_nome', 'corretor', 'imobiliaria'],
    },
    distratos: {
      synonyms: ['distrato', 'rescisao', 'cancelamento'],
      tables: ['distratos_cvcrm', 'distratos_lotear'],
      fields: ['id_distrato', 'id_reserva', 'situacao_atual', 'empreendimento', 'bloco', 'unidade'],
    },
    leads: {
      synonyms: ['lead', 'origem', 'midia', 'conversao', 'historico'],
      tables: ['TB_LEADS', 'TB_HIST_LEADS'],
      fields: ['idlead', 'situacao', 'empreendimento', 'origem', 'midia_original', 'corretor', 'imobiliaria'],
    },
    precadastros: {
      synonyms: ['pre-cadastro', 'precadastro', 'aprovacao', 'correspondente', 'renda'],
      tables: ['TB_PRECADASTROS', 'TB_PRECADASTROS_LOT'],
      fields: ['idprecadastro', 'situacao', 'empreendimento', 'unidade', 'corretor', 'imobiliaria', 'valor_total'],
    },
  },
  relationships: {
    estoque_preco: {
      from: ['estoque_cvcrm', 'estoque_lotear'],
      to: ['tabela_de_preco_cvcrm', 'tabela_de_preco_lotear'],
      preferredKeys: ['idunidade'],
      fallbackKeys: ['empreendimento', 'bloco', 'unidade'],
    },
    venda_unidade: {
      from: ['vendas_cvcrm', 'vendas_lotear'],
      to: ['estoque_cvcrm', 'estoque_lotear'],
      fallbackKeys: ['empreendimento', 'unidade'],
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
