/**
 * Curadoria das colunas de cada aba da Consulta de Clientes — nome da coluna
 * na view (col) + rótulo em PT (label). Espelha as telas do Linx. Ajustável
 * sem tocar em SQL: é só editar aqui.
 */
export interface Col {
  col: string;
  label: string;
}
export interface Group {
  title: string;
  fields: Col[];
}

/** Aba Clientes — grade dos clientes do representante. */
export const CLIENTES_GRID: Col[] = [
  { col: 'CLIFOR', label: 'Código' },
  { col: 'NOME_CLIFOR', label: 'Cliente' },
  { col: 'PONTUALIDADE', label: 'Pontualidade' },
  { col: 'REGIAO', label: 'Região' },
  { col: 'MATRIZ_CLIENTE', label: 'Matriz Cliente' },
  { col: 'FILIAL', label: 'Filial' },
  { col: 'TIPO_BLOQUEIO', label: 'Tipo Bloqueio' },
  { col: 'BLOQUEIO_FATURAMENTO', label: 'Bloqueio Faturamento' },
  { col: 'BLOQUEIO_EXPEDICAO', label: 'Bloqueio Expedição' },
  { col: 'BLOQUEIO_PEDIDOS', label: 'Bloqueio Pedidos' },
  { col: 'SEM_CREDITO', label: 'Sem Crédito' },
  { col: 'LIMITE_CREDITO', label: 'Limite Crédito' },
  { col: 'PJ_PF', label: 'Pessoa Jurídica' },
  { col: 'RAZAO_SOCIAL', label: 'Razão Social' },
  { col: 'CGC_CPF', label: 'CGC / Cpf' },
  { col: 'RG_IE', label: 'Rg / Ie' },
  { col: 'ENDERECO', label: 'Endereço' },
  { col: 'NUMERO', label: 'Número' },
  { col: 'COMPLEMENTO', label: 'Complemento' },
  { col: 'BAIRRO', label: 'Bairro' },
  { col: 'CIDADE', label: 'Cidade' },
  { col: 'CEP', label: 'Cep' },
  { col: 'UF', label: 'Uf' },
  { col: 'PAIS', label: 'País' },
  { col: 'DDI', label: 'Ddi' },
  { col: 'DDD1', label: 'Ddd' },
  { col: 'TELEFONE1', label: 'Telefone' },
  { col: 'CADASTRAMENTO', label: 'Cadastramento' },
  { col: 'CONDICAO_PGTO', label: 'Condição Pgto' },
  { col: 'NOME_BANCO', label: 'Banco' },
  { col: 'NUMERO_PEDIDOS', label: 'Número Pedidos' },
  { col: 'DATA_MAIOR_PEDIDO', label: 'Data Maior Pedido' },
  { col: 'MAIOR_PEDIDO', label: 'Maior Pedido' },
  { col: 'MAIOR_SALDO', label: 'Maior Saldo' },
  { col: 'DATA_MAIOR_SALDO', label: 'Data Maior Saldo' },
  { col: 'NUMERO_ATRASOS', label: 'Número Atrasos' },
  { col: 'MAIOR_ATRASO', label: 'Maior Atraso' },
  { col: 'NUMERO_DEVOLUCOES', label: 'Número Devoluções' },
  { col: 'MAIOR_DEVOLUCAO', label: 'Maior Devolução' },
  { col: 'TRANSPORTADORA', label: 'Transportadora' },
  { col: 'CONTATO', label: 'Contato' },
  { col: 'TIPO', label: 'Tipo' },
  { col: 'CONCEITO', label: 'Conceito' },
  { col: 'PRIORIDADE', label: 'Prioridade' },
];

/** Aba Dados 1 — ficha do cliente selecionado, agrupada. */
export const DADOS1_GROUPS: Group[] = [
  {
    title: 'Cliente',
    fields: [
      { col: 'NOME_CLIFOR', label: 'Cliente' },
      { col: 'CLIFOR', label: 'Código' },
      { col: 'RAZAO_SOCIAL', label: 'Razão Social' },
      { col: 'CONTATO', label: 'Contato' },
      { col: 'FILIAL', label: 'Filial' },
      { col: 'MATRIZ_CLIENTE', label: 'Matriz' },
      { col: 'TRANSPORTADORA', label: 'Transp.' },
      { col: 'EMAIL', label: 'Email' },
      { col: 'ANIVERSARIO', label: 'Aniversário' },
      { col: 'CADASTRAMENTO', label: 'Cadastramento' },
      { col: 'PJ_PF', label: 'Pessoa Jurídica' },
    ],
  },
  {
    title: 'Endereço',
    fields: [
      { col: 'CGC_CPF', label: 'CNPJ / Cpf' },
      { col: 'RG_IE', label: 'Rg / Ie' },
      { col: 'ENDERECO', label: 'Endereço' },
      { col: 'COMPLEMENTO', label: 'Complemento' },
      { col: 'NUMERO', label: 'Número' },
      { col: 'BAIRRO', label: 'Bairro' },
      { col: 'CEP', label: 'Cep' },
      { col: 'CIDADE', label: 'Cidade' },
      { col: 'UF', label: 'Uf' },
      { col: 'PAIS', label: 'País' },
      { col: 'DDI', label: 'Ddi' },
      { col: 'DDD1', label: 'Ddd' },
      { col: 'TELEFONE1', label: 'Telefone' },
    ],
  },
  {
    title: 'Cobrança',
    fields: [
      { col: 'COBRANCA_CGC', label: 'CNPJ / Cpf' },
      { col: 'COBRANCA_IE', label: 'Ie / Rg' },
      { col: 'COBRANCA_ENDERECO', label: 'Endereço' },
      { col: 'COBRANCA_COMPLEMENTO', label: 'Complemento' },
      { col: 'COBRANCA_NUMERO', label: 'Número' },
      { col: 'COBRANCA_BAIRRO', label: 'Bairro' },
      { col: 'COBRANCA_CEP', label: 'Cep' },
      { col: 'COBRANCA_CIDADE', label: 'Cidade' },
      { col: 'COBRANCA_UF', label: 'Uf' },
      { col: 'COBRANCA_DDD', label: 'Ddd' },
      { col: 'COBRANCA_TELEFONE', label: 'Telefone' },
    ],
  },
  {
    title: 'Entrega',
    fields: [
      { col: 'ENTREGA_CGC', label: 'CNPJ / Cpf' },
      { col: 'ENTREGA_IE', label: 'Ie / Rg' },
      { col: 'ENTREGA_ENDERECO', label: 'Endereço' },
      { col: 'ENTREGA_COMPLEMENTO', label: 'Complemento' },
      { col: 'ENTREGA_NUMERO', label: 'Número' },
      { col: 'ENTREGA_BAIRRO', label: 'Bairro' },
      { col: 'ENTREGA_CEP', label: 'Cep' },
      { col: 'ENTREGA_CIDADE', label: 'Cidade' },
      { col: 'ENTREGA_UF', label: 'Uf' },
      { col: 'ENTREGA_DDD', label: 'Ddd' },
      { col: 'ENTREGA_TELEFONE', label: 'Telefone' },
    ],
  },
];

/** Aba Faturamentos — grade das notas do cliente. */
export const FATURAMENTOS_GRID: Col[] = [
  { col: 'NF_SAIDA', label: 'Nf Saída' },
  { col: 'SERIE_NF', label: 'Série' },
  { col: 'EMISSAO', label: 'Emissão' },
  { col: 'QTDE_TOTAL', label: 'Qtde Total' },
  { col: 'VALOR_MOEDA', label: 'Valor Total' },
  { col: 'MOEDA', label: 'Moeda' },
  { col: 'VALOR_TOTAL', label: 'Valor Total R$' },
  { col: 'REPRESENTANTE', label: 'Representante' },
  { col: 'DESC_COND_PGTO', label: 'Condição de Pgto' },
  { col: 'GERENTE', label: 'Gerente' },
  { col: 'DESCONTO', label: 'Desconto' },
  { col: 'ENCARGO', label: 'Encargo' },
  { col: 'NOTA_IMPRESSA', label: 'Nota Impressa' },
  { col: 'DESC_NATUREZA', label: 'Desc Natureza' },
  { col: 'ACERTO_CONTAS_P_R', label: 'Acerto Contas P R' },
  { col: 'FILIAL', label: 'Filial' },
  { col: 'COMISSAO', label: 'Comissão' },
  { col: 'COMISSAO_GERENTE', label: 'Comissão Gerente' },
  { col: 'TRANSPORTADORA', label: 'Transportadora' },
  { col: 'DATA_SAIDA', label: 'Data Saída' },
  { col: 'FRETE', label: 'Frete' },
  { col: 'SEGURO', label: 'Seguro' },
  { col: 'FATURA', label: 'Fatura' },
  { col: 'NF_FATURA', label: 'Nf Fatura' },
  { col: 'CONFERIDO', label: 'Conferido' },
  { col: 'NOTA_CANCELADA', label: 'Nota Cancelada' },
  { col: 'IRRF', label: 'Irrf' },
  { col: 'ICMS', label: 'Icms' },
  { col: 'IPI_VALOR', label: 'Ipi Valor' },
];

/** Totais do rodapé da aba Faturamentos (coluna da view → rótulo). */
export const FATURAMENTOS_TOTAIS: Col[] = [
  { col: 'QTDE_TOTAL', label: 'Qtde Total' },
  { col: 'VALOR_TOTAL', label: 'Valor Total' },
  { col: 'DESCONTO', label: 'Desc Total' },
  { col: 'ENCARGO', label: 'Enc Total' },
];

/** Sub-grid "Pedidos da Nota". */
export const PEDIDOS_GRID: Col[] = [
  { col: 'PEDIDO', label: 'Pedido' },
  { col: 'entrega', label: 'Entrega' },
  { col: 'emissao_pedido', label: 'Emissão Pedido' },
  { col: 'pedido_cliente', label: 'Pedido Cliente' },
];

/** Aba Financeiro — lista de títulos (duplicatas) do cliente. */
export const FINANCEIRO_TITULOS: Col[] = [
  { col: 'FATURA', label: 'Fatura' },
  { col: 'EMISSAO', label: 'Emissão' },
  { col: 'VENCIMENTO_REAL', label: 'Vencimento' },
  { col: 'VALOR_ORIGINAL', label: 'Valor Original' },
  { col: 'VALOR_A_RECEBER', label: 'Valor a Receber' },
  { col: 'POSICAO', label: 'Posição' },
  { col: 'FILIAL', label: 'Filial' },
  { col: 'DESC_CONTA_PORTADOR', label: 'Conta Portador' },
];
