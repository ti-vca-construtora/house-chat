-- Generated from BigQuery metadata.
-- Source: datawarehouse-492815.cv.vw_Vendas_Consolidada
-- This file intentionally creates only vw_Vendas_Consolidada.

DROP TABLE IF EXISTS public."vw_Vendas_Consolidada";

CREATE TABLE public."vw_Vendas_Consolidada" (
  "referencia" BIGINT,
  "referenciaData" TIMESTAMP,
  "dataVenda" TIMESTAMP,
  "cliente" TEXT,
  "idEmpreendimento" BIGINT,
  "empreendimento" TEXT,
  "etapa" TEXT,
  "bloco" TEXT,
  "unidade" TEXT,
  "idTipoVenda" BIGINT,
  "tipoVenda" TEXT,
  "cidade" TEXT,
  "cepCliente" TEXT,
  "renda" DOUBLE PRECISION,
  "sexo" TEXT,
  "idade" BIGINT,
  "valorContrato" DOUBLE PRECISION,
  "estadoCivil" TEXT,
  "corretor" TEXT,
  "idcorretor" BIGINT,
  "idimobiliaria" BIGINT,
  "imobiliaria" TEXT,
  "idmidia" BIGINT,
  "midia" TEXT,
  "nomeTabelaAjustado" TEXT,
  "dataTabelaAjustado" TIMESTAMP,
  "Valor_VGV" DOUBLE PRECISION,
  "VALOR_ENTRADA" DOUBLE PRECISION,
  "Fonte" TEXT,
  "id" TEXT,
  "referencia_fonte" TEXT,
  "Status" TEXT,
  "distrato_dataCad" TEXT,
  "distrato_situacaoData" TEXT,
  "distrato_motivoDistrato" TEXT,
  "Valor_VGV_Correto" DOUBLE PRECISION
);

ALTER TABLE public."vw_Vendas_Consolidada" DISABLE ROW LEVEL SECURITY;
