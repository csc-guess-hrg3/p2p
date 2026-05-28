# 1. Tabelas/views CONTRATO_* em GUESS_PRODUCAO
  BASE TABLE  CONTRATO
  BASE TABLE  CONTRATO_FATURAR
  BASE TABLE  CONTRATO_GRUPO
  BASE TABLE  CONTRATO_ITEM
  BASE TABLE  CONTRATO_TIPO
  BASE TABLE  CONTRATOS_DESCONTO
  VIEW        W_USP_CONTRATO_SALDO

# 2. Schema completo de cada tabela CONTRATO_*

## CONTRATO
    1. CONTRATO_GRUPO                      char(4)            NULL    
    2. ID_CONTRATO                         varchar(25)        NOT NULL
    3. NUMERO_CONTRATO                     varchar(40)        NOT NULL
    4. DESC_CONTRATO                       varchar(60)        NULL    
    5. EMISSAO                             datetime           NULL    
    6. COMPRA_VENDA                        char(1)            NULL    
    7. NOME_ARQUIVO_CONTRATO               varchar(250)       NULL    
    8. OBS_CONTRATO                        text(2147483647)   NULL    
    9. COD_CLIFOR                          char(6)            NOT NULL
   10. COD_FILIAL                          char(6)            NOT NULL
   11. COD_REPRESENTANTE_GERENTE           char(6)            NULL    
   12. COD_REPRESENTANTE                   char(6)            NULL    
  -- total linhas: 0
  PK: ID_CONTRATO

## CONTRATO_FATURAR
    1. ID_CONTRATO                         varchar(25)        NOT NULL
    2. ITEM                                char(4)            NOT NULL
    3. FILIAL                              varchar(25)        NULL    
    4. NF_SAIDA                            char(15)           NULL    
    5. SERIE_NF                            varchar(6)         NULL    
    6. ITEM_IMPRESSAO                      char(4)            NULL    
    7. SUB_ITEM_TAMANHO                    int                NULL    
    8. RECORRENCIA_ITEM                    varchar(8)         NOT NULL
    9. DATA_FATURAMENTO_RELATIVO           datetime           NULL    
   10. QTDE                                numeric(9,3)       NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
   11. VALOR_CONTRATO                      numeric(14,2)      NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
   12. CONDICAO_PGTO                       char(3)            NULL    
   13. CONTA_CONTABIL                      varchar(20)        NULL    
   14. RATEIO_CENTRO_CUSTO                 varchar(15)        NULL    
   15. RATEIO_FILIAL                       varchar(15)        NULL    
   16. OBS_FATURAMENTO                     varchar(500)       NULL    
   17. COMISSAO_ITEM                       numeric(8,5)       NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
   18. COMISSAO_ITEM_GERENTE               numeric(8,5)       NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
   19. COD_REPRESENTANTE                   char(6)            NULL    
   20. COD_REPRESENTANTE_GERENTE           char(6)            NULL    
  -- total linhas: 0
  PK: ID_CONTRATO, ITEM, RECORRENCIA_ITEM

## CONTRATO_GRUPO
    1. CONTRATO_GRUPO                      char(4)            NOT NULL
    2. DESC_CONTRATO_GRUPO                 varchar(40)        NOT NULL
  -- total linhas: 0
  PK: CONTRATO_GRUPO

## CONTRATO_ITEM
    1. ID_CONTRATO                         varchar(25)        NOT NULL
    2. ITEM                                char(4)            NOT NULL
    3. CONTRATO_TIPO                       char(4)            NOT NULL
    4. CODIGO_ITEM                         varchar(50)        NOT NULL
    5. ITEM_DESCRICAO_FATURA               varchar(80)        NOT NULL
    6. PRECO_UNITARIO                      numeric(15,5)      NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
    7. DESCONTO                            numeric(13,10)     NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
    8. ENCARGO                             numeric(13,10)     NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
    9. QTDE                                numeric(9,3)       NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
   10. VALOR_CONTRATO                      numeric(14,2)      NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
   11. COMISSAO_ITEM                       numeric(13,10)     NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
   12. COMISSAO_ITEM_GERENTE               numeric(13,10)     NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
   13. DATA_INICIO                         datetime           NULL    
   14. DATA_FIM                            datetime           NULL    
   15. ULTIMO_REAJUSTE                     datetime           NULL    
   16. OBS_ITEM                            varchar(250)       NULL    
   17. OBS_FATURAMENTO                     varchar(500)       NULL    
   18. OBS_INTERNA                         varchar(2000)      NULL    
   19. ACRESCER_IMPOSTO                    bit                NOT NULL  default=
/****** Object:  Default dbo.DEFAULT_0    Script
   20. NATUREZA_OPERACAO                   varchar(15)        NULL    
   21. CONDICAO_PGTO                       char(3)            NULL    
   22. RECORRENCIA                         tinyint            NULL      default=
/****** Object:  Default dbo.DEFAULT_N1    Scrip
   23. RECORRENCIA_REAJUSTE                tinyint            NULL      default=
/****** Object:  Default dbo.DEFAULT_N1    Scrip
   24. MOEDA_REAJUSTE                      char(6)            NOT NULL
   25. MOEDA                               char(6)            NOT NULL
   26. RATEIO_CENTRO_CUSTO                 varchar(15)        NULL    
   27. RATEIO_FILIAL                       varchar(15)        NULL    
   28. CONTA_CONTABIL                      varchar(20)        NULL    
   29. CAMBIO_REAJUSTE                     numeric(11,6)      NULL      default=
/****** Object:  Default dbo.DEFAULT_N1    Scrip
   30. DATA_CAMBIO_REAJUSTE                datetime           NULL    
   31. QTDE_SALDO                          numeric(9,3)       NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
  -- total linhas: 0
  PK: ID_CONTRATO, ITEM

## CONTRATO_TIPO
    1. CONTRATO_TIPO                       char(4)            NOT NULL
    2. LX_TIPO_CONTRATO                    int                NOT NULL
    3. DESC_TIPO_CONTRATO                  varchar(40)        NOT NULL
  -- total linhas: 1
  PK: CONTRATO_TIPO

## CONTRATOS_DESCONTO
    1. NUMERO_CONTRATO                     varchar(20)        NOT NULL
    2. CONTA_CONTABIL                      char(20)           NULL    
    3. DESC_CONTRATO                       varchar(40)        NULL    
    4. BANCO                               char(5)            NOT NULL
    5. CARTEIRA                            varchar(25)        NOT NULL
    6. DATA_INICIO                         datetime           NULL    
    7. DESATIVADO                          bit                NOT NULL  default=
/****** Object:  Default dbo.DEFAULT_0    Script
    8. TAXA                                decimal            NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
    9. VALOR                               numeric(14,2)      NOT NULL  default=
/****** Object:  Default dbo.DEFAULT_0    Script
   10. IOF                                 decimal            NULL      default=
/****** Object:  Default dbo.DEFAULT_0    Script
  -- total linhas: 0
  PK: NUMERO_CONTRATO


# 3. Foreign keys (relacionamentos formais)

## FKs SAINDO de CONTRATO_* (apontam pra outras tabelas):
  CONTRATO.COD_CLIFOR                                → CADASTRO_CLI_FOR.COD_CLIFOR
  CONTRATO.COD_FILIAL                                → FILIAIS.COD_FILIAL
  CONTRATO.COD_REPRESENTANTE                         → REPRESENTANTES.COD_REPRESENTANTE
  CONTRATO.COD_REPRESENTANTE_GERENTE                 → REPRESENTANTES.COD_REPRESENTANTE
  CONTRATO.CONTRATO_GRUPO                            → CONTRATO_GRUPO.CONTRATO_GRUPO
  CONTRATO_FATURAR.COD_REPRESENTANTE                 → REPRESENTANTES.COD_REPRESENTANTE
  CONTRATO_FATURAR.COD_REPRESENTANTE_GERENTE         → REPRESENTANTES.COD_REPRESENTANTE
  CONTRATO_FATURAR.CONTA_CONTABIL                    → CTB_CONTA_PLANO.CONTA_CONTABIL
  CONTRATO_FATURAR.FILIAL                            → FATURAMENTO_ITEM.FILIAL
  CONTRATO_FATURAR.ID_CONTRATO                       → CONTRATO_ITEM.ID_CONTRATO
  CONTRATO_FATURAR.ITEM                              → CONTRATO_ITEM.ITEM
  CONTRATO_FATURAR.ITEM_IMPRESSAO                    → FATURAMENTO_ITEM.ITEM_IMPRESSAO
  CONTRATO_FATURAR.NF_SAIDA                          → FATURAMENTO_ITEM.NF_SAIDA
  CONTRATO_FATURAR.RATEIO_CENTRO_CUSTO               → CTB_CENTRO_CUSTO_RATEIO.RATEIO_CENTRO_CUSTO
  CONTRATO_FATURAR.RATEIO_FILIAL                     → CTB_FILIAL_RATEIO.RATEIO_FILIAL
  CONTRATO_FATURAR.SERIE_NF                          → FATURAMENTO_ITEM.SERIE_NF
  CONTRATO_FATURAR.SUB_ITEM_TAMANHO                  → FATURAMENTO_ITEM.SUB_ITEM_TAMANHO
  CONTRATO_ITEM.CODIGO_ITEM                          → CADASTRO_ITEM_FISCAL.CODIGO_ITEM
  CONTRATO_ITEM.CONTA_CONTABIL                       → CTB_CONTA_PLANO.CONTA_CONTABIL
  CONTRATO_ITEM.CONTRATO_TIPO                        → CONTRATO_TIPO.CONTRATO_TIPO
  CONTRATO_ITEM.ID_CONTRATO                          → CONTRATO.ID_CONTRATO
  CONTRATO_ITEM.MOEDA                                → MOEDAS.MOEDA
  CONTRATO_ITEM.MOEDA_REAJUSTE                       → MOEDAS.MOEDA
  CONTRATO_ITEM.RATEIO_CENTRO_CUSTO                  → CTB_CENTRO_CUSTO_RATEIO.RATEIO_CENTRO_CUSTO
  CONTRATO_ITEM.RATEIO_FILIAL                        → CTB_FILIAL_RATEIO.RATEIO_FILIAL
  CONTRATOS_DESCONTO.BANCO                           → BANCOS.BANCO
  CONTRATOS_DESCONTO.CARTEIRA                        → CARTEIRAS_COBRANCA.CARTEIRA

## FKs CHEGANDO em CONTRATO_* (outras tabelas que referenciam):
  BANCOS_BORDERO.NUMERO_CONTRATO                     → CONTRATOS_DESCONTO.NUMERO_CONTRATO
  CONTAS_LANCAMENTOS.NUMERO_CONTRATO                 → CONTRATOS_DESCONTO.NUMERO_CONTRATO
  CONTRATO.CONTRATO_GRUPO                            → CONTRATO_GRUPO.CONTRATO_GRUPO
  CONTRATO_FATURAR.ID_CONTRATO                       → CONTRATO_ITEM.ID_CONTRATO
  CONTRATO_FATURAR.ITEM                              → CONTRATO_ITEM.ITEM
  CONTRATO_ITEM.CONTRATO_TIPO                        → CONTRATO_TIPO.CONTRATO_TIPO
  CONTRATO_ITEM.ID_CONTRATO                          → CONTRATO.ID_CONTRATO
  CRM_HORAS_TIPO.CONTRATO_TIPO                       → CONTRATO_TIPO.CONTRATO_TIPO
  CRM_TAREFA_HORAS.ID_CONTRATO                       → CONTRATO_ITEM.ID_CONTRATO
  CRM_TAREFA_HORAS.ITEM_CONTRATO                     → CONTRATO_ITEM.ITEM

# 4. Sequenciais relacionados a CONTRATO

  CONTRATO.CODIGO_CONTATO               seq=0 tam=6  SEQUENCIAL DE CONTRATOS                 
  CONTRATO.CODIGO_CONTRATO              seq=000008 tam=6  SEQUENCIAL DE CONTRATOS                 
  LJ_CREDIARIO_CONTRATO.ID_CONTRATO   seq=1000000000 tam=10  SEQUENCIAL PARA RENEGOCIAÇÃO DE CONTRATO

# 5. Procedures que tocam tabelas CONTRATO_*

  LX_CONTRATO_FATURAR
  LX_CTB_FLUXO_CAIXA
  LX_UPDATE_NOME_CLIFOR

# 6. Triggers em CONTRATO_*

  (nenhuma)

# 7. Views que mencionam CONTRATO

  W_LGPD_TABELAS_DEPENDENTES

# 8. Vínculos externos — outras tabelas que têm coluna ID_CONTRATO ou CONTRATO_TIPO

  A_RECEBER_CHEQUES                        NUMERO_CONTRATO      varchar(20)
  A_RECEBER_PARCELAS                       NUMERO_CONTRATO      varchar(20)
  B2C_CONTRATO_CORREIO                     ID_CONTRATO          int
  B2C_FORMA_ENVIO                          NUMERO_CONTRATO      varchar(25)
  BANCOS_BORDERO                           NUMERO_CONTRATO      varchar(20)
  CONTAS_LANCAMENTOS                       NUMERO_CONTRATO      varchar(20)
  CRD_CONTRATO_CARTOES                     ID_CONTRATO_CREDITO  int
  CRD_CONTRATO_CRITERIOS                   ID_CONTRATO_CREDITO  int
  CRD_CONTRATOS                            ID_CONTRATO_CREDITO  int
  CRM_HORAS_TIPO                           CONTRATO_TIPO        char(4)
  CRM_TAREFA_HORAS                         ID_CONTRATO          varchar(25)
  CTB_A_RECEBER_PARCELA                    CONTRATO_GRUPO       char(4)
  LJ_CREDIARIO_CONTRATO                    ID_CONTRATO          int
  LJ_CREDIARIO_CONTRATO                    ID_CONTRATO_ORIGINAL int
  LJ_CREDIARIO_PARCELA                     ID_CONTRATO          int
  LJ_CREDIARIO_PARCELA                     ID_CONTRATO_PARCELA  smallint
  LJ_CREDIARIO_PGTO                        ID_CONTRATO          int
  LJ_CREDIARIO_PGTO                        ID_CONTRATO_PARCELA  smallint
  LJ_CREDIARIO_PGTO                        ID_CONTRATO_PGTO     smallint
  LOJA_A_RECEBER_CHEQUES                   NUMERO_CONTRATO      varchar(20)
  VALES_A_RECEBER                          NUMERO_CONTRATO      varchar(20)
  W_CTB_A_RECEBER_PARCELA                  CONTRATO_GRUPO       char(4)
  w_ctb_a_receber_parcela_crediario        CONTRATO_GRUPO       int
  W_CTB_LOJA_CHEQUE_CARTAO                 NUMERO_CONTRATO      int
  W_CTB_VALES_A_RECEBER                    NUMERO_CONTRATO      int
  W_USP_CONTRATO_SALDO                     ID_CONTRATO          int
  W_USP_CONTRATO_SALDO                     ID_CONTRATO_PARCELA  smallint
  W_USP_LJ_CREDIARIO                       ID_CONTRATO          int
  W_USP_LJ_CREDIARIO                       ID_CONTRATO_PARCELA  smallint

# 9. Existem registros CONTRATO em HML / DB_HRG3?

  HML_GUESS.dbo.CONTRATO ERRO: Invalid object name 'HML_GUESS.dbo.CONTRATO'.
  DB_HRG3.dbo.CONTRATO total: 0

# 10. Conteúdo de CONTRATO_TIPO (catálogo)

  {"CONTRATO_TIPO":"1   ","LX_TIPO_CONTRATO":2,"DESC_TIPO_CONTRATO":"FRANQUIA                                "}

# 11. Salvando definições de procs/views relevantes em arquivos

  LX_CONTRATO_FATURAR.sql
  LX_CTB_FLUXO_CAIXA.sql
  LX_UPDATE_NOME_CLIFOR.sql
  W_LGPD_TABELAS_DEPENDENTES.sql