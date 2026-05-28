


CREATE view [dbo].[W_LGPD_TABELAS_DEPENDENTES]

-- 12/09/2022 - RODRIGO BARBOSA -				LINXERP-11846 - #02# - AJUSTE PARA ATENDER ERRO NO PROCESSO DE ANONIMIZAÇÃO
-- 02/08/2022 - VALMIR SOARES/RODRIGO BARBOSA - LINXERP-11225 - #01# - SPK 02.22 - ADICIONADO NOVAS TABELAS DEPENDENTES
-- 18/07/2021 - VALMIR SOARES				  - LINXERP-6337  - Projeto: LGPD Eliminação e anonimização (Criação da View)

as 

	with Tmp_Dependentes as
	(	

	-- Lista a processar (CADASTROS)
		SELECT Tabela='CADASTRO_CLI_FOR',								Coluna='NOME_CLIFOR'					,grupo=1	UNION ALL	
		SELECT Tabela='CLIENTES_ATACADO',								Coluna='CLIENTE_ATACADO'				,grupo=1	UNION ALL	
		SELECT Tabela='FORNECEDORES',									Coluna='FORNECEDOR'						,grupo=1	UNION ALL	
		SELECT Tabela='REPRESENTANTES',									Coluna='REPRESENTANTE'					,grupo=1	UNION ALL	
		SELECT Tabela='FILIAIS',										Coluna='FILIAL'							,grupo=1	UNION ALL	
		SELECT Tabela='TRANSPORTADORAS',								Coluna='TRANSPORTADORA' 				,grupo=1	UNION ALL
		SELECT Tabela='CLIENTES_VAREJO',								Coluna='CODIGO_CLIENTE'					,grupo=1	UNION ALL	

	-- Lista a processar (CLIENTES_VAREJO)
		SELECT Tabela='CLIENTES_VAREJO',								Coluna='CLIENTE_VAREJO'					,grupo=2	UNION ALL	
		Select Tabela='CLIENTES_VAREJO_DOCUMENTO',						Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='CLIENTES_VAREJO_EMPRESA',						Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='CLIENTES_VAREJO_LOG',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='CLIENTES_VAREJO_LOG',							Coluna='CLIENTE_VAREJO'					,grupo=2	UNION ALL 
		Select Tabela='CLIENTE_VAR_ENDERECOS',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='CLIENTE_VAR_FINALIDADE',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='CLIENTES_VAR_LOJA',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL  -- tabela de controle do LGPD 
		Select Tabela='LGPD_SOLICITACAO_LOJA',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL  -- tabela de controle do LGPD 
		Select Tabela='CLIENTE_VAR_RELACIONADO',						Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='CLIENTE_VAR_RELACIONADO',						Coluna='CODIGO_CLIENTE_RELACIONADO'		,grupo=2	UNION ALL 
		Select Tabela='CLIENTE_VAR_SAC',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='A_RECEBER_CHEQUES',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='B2C_CREDITO',									Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='B2C_OCORRENCIA',									Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='CRD_CONTRATOS',									Coluna='CODIGO_CLIENTE_VAREJO'			,grupo=2	UNION ALL 
		Select Tabela='CTB_MOVIMENTO_B2C',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='ENTIDADES_CREDITO_CONSULTAS',					Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 
		Select Tabela='ENTRADAS',										Coluna='CODIGO_CLIENTE_VAREJO'			,grupo=2	UNION ALL 
		Select Tabela='FATURAMENTO',									Coluna='CODIGO_CLIENTE_VAREJO'			,grupo=2	UNION ALL 
		Select Tabela='FATURAMENTO_IMAGEM',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL 		
		Select Tabela='VENDAS',											Coluna='CODIGO_CLIENTE_VAREJO'			,grupo=2	UNION ALL 	
		Select Tabela='FILIAIS',										Coluna='CLIENTE_VAREJO_PADRAO_FRANQUIA'	,grupo=2	UNION ALL 		
		Select Tabela='CLIENTES_ATACADO',								Coluna='COD_CLIENTE'					,grupo=2	UNION ALL 	
		Select Tabela='FX_LCF_IMPORTA_SPED_FISCAL_ENTRADA',				Coluna='COD_CLIENTE'					,grupo=2	UNION ALL 	
		Select Tabela='FX_LCF_IMPORTA_SPED_FISCAL_ENTRADA_CANCELADA',	Coluna='COD_CLIENTE'					,grupo=2	UNION ALL 	
		Select Tabela='FX_LCF_IMPORTA_SPED_FISCAL_ENTRADA_RELACIONADO',	Coluna='COD_CLIENTE'					,grupo=2	UNION ALL 	
		Select Tabela='LCF_ERRO_NOTA_ENTRADA',							Coluna='COD_CLIENTE'					,grupo=2	UNION ALL 	
		Select Tabela='LCF_ERRO_NOTA_ENTRADA_IMPOSTO',					Coluna='COD_CLIENTE'					,grupo=2	UNION ALL 	
		Select Tabela='LCF_ERRO_NOTA_ENTRADA_ITEM',						Coluna='COD_CLIENTE'					,grupo=2	UNION ALL 	
		Select Tabela='LCF_ERRO_NOTA_SAIDA',							Coluna='COD_CLIENTE'					,grupo=2	UNION ALL 	
	  --outros campos que podem ter sido cadastrados com o codigo_cliente
		SELECT Tabela='LCF_RESPONSAVEL',								Coluna='NOME'     						,grupo=2	UNION ALL
		SELECT Tabela='LCF_TERCEIRO',									Coluna='NOME_FANTASIA'     				,grupo=2	UNION ALL
		SELECT Tabela='CADASTRO_CLI_FOR_LOG',							Coluna='RAZAO_SOCIAL'     				,grupo=2	UNION ALL
		SELECT Tabela='LOJA_VENDEDORES',								Coluna='NOME_VENDEDOR'     				,grupo=2	UNION ALL --verificar necessidade
		SELECT Tabela='LOJA_VENDEDORES',								Coluna='VENDEDOR_APELIDO'     			,grupo=2	UNION ALL --verificar necessidade
		SELECT Tabela='CTB_BENEFICIARIOS',								Coluna='RAZAO_SOCIAL_BENEFICIARIO'		,grupo=2    UNION ALL --verificar necessidade
		SELECT Tabela='LJ_ECF_AC1704_E14',								Coluna='NOME_CLIENTE'     				,grupo=2	UNION ALL
		SELECT Tabela='LJ_ECF_AC1704_E14',								Coluna='CPF_CNPJ'	     				,grupo=2	UNION ALL  --#02#
		SELECT Tabela='LJ_LF_ECF_ITEM',									Coluna='NOME_CLIFOR'     				,grupo=2	UNION ALL
		Select Tabela='LJ_DOCUMENTO_ECF',								Coluna='NOME_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LJ_DOCUMENTO_ECF',								Coluna='CPF_CNPJ_CLIENTE'				,grupo=2	UNION ALL  --#02#
		Select Tabela='LOJA_CF_SAT',									Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_CF_SAT_LOG',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		--
		Select Tabela='LJ_FIDELIDADE_PONTO',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LJ_VALE_PRODUTO',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_A_RECEBER_CHEQUES',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_CONSERTO',									Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_EVENTOS_LOG',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_HISTORICO_VENDA',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_NOTA_FISCAL',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_PEDIDO',									Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_PEDIDO_VENDEDOR',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_PGTO_CLIENTE',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_RESERVA',									Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_VENDA',										Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_VENDA_VENDEDORES',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LOJA_SAIDAS',									Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='VALES_A_RECEBER',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='UNICO_VITRINE_PEDIDO',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LX_IMP_MFD_E14',									Coluna='NOME_CLIENTE'					,grupo=2	UNION ALL
		Select Tabela='LF_REGISTRO_ENTRADA',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL -- #01#
		Select Tabela='LF_REGISTRO_SAIDA',								Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL -- #01#
		Select Tabela ='LJ_CREDITO_CLIENTE',							Coluna='CODIGO_CLIENTE'					,grupo=2	UNION ALL -- #02#
	-- Lista a processar (GERAL)
		SELECT Tabela='A_PAGAR_FATURA_CENTROS',							Coluna='NOME_CLIFOR'     				,grupo=3	UNION ALL
		SELECT Tabela='A_PAGAR_PARCELA',								Coluna='NOME_CLIFOR'       				,grupo=3	UNION ALL
		SELECT Tabela='A_PAGAR_PARCELA_PG',								Coluna='NOME_CLIFOR'     				,grupo=3	UNION ALL
		SELECT Tabela='A_RECEBER_CHEQUES',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='A_RECEBER_FATURA',								Coluna='GERENTE'     					,grupo=3	UNION ALL
		SELECT Tabela='A_RECEBER_FATURA',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='A_RECEBER_PARCELAS',								Coluna='NOME_CLIFOR'  					,grupo=3	UNION ALL
		SELECT Tabela='A_RECEBER_PGTOS',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='BANCOS_A_PAGAR_PARCELAS',						Coluna='NOME_CLIFOR'     				,grupo=3	UNION ALL
		SELECT Tabela='BANCOS_PARCELAS',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='CADASTRO_BANCOS_AGENCIA',						Coluna='NOME_CLIFOR'     				,grupo=3	UNION ALL
		SELECT Tabela='CADASTRO_LOCAIS_ENTREGA',						Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='CLIENTE_REPRE',									Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='CLIENTE_REPRE',									Coluna='REPRESENTANTE'					,grupo=3	UNION ALL
		SELECT Tabela='CLIENTES_ATACADO',								Coluna='MATRIZ_CLIENTE'   				,grupo=3	UNION ALL
		SELECT Tabela='CLIENTES_GERADOR_FATURAS',						Coluna='CLIENTE_ATACADO'    			,grupo=3	UNION ALL
		SELECT Tabela='COLETOR_COLETA',									Coluna='CLIENTE_ATACADO'  				,grupo=3	UNION ALL
		SELECT Tabela='COMPRAS',										Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='COMPRAS_DESPESA',								Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='COMPRAS_DESPESA_TIPO',							Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='CONTATO',										Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='COTACOES_CONS_FORNECEDOR',						Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='COTACOES_MAT_FORNECEDOR',						Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='CTB_CARTA_CORRECAO',								Coluna='MATRIZ_FISCAL_ORIGEM'    		,grupo=3	UNION ALL
		SELECT Tabela='CTB_CARTA_CORRECAO',								Coluna='NOME_CLIFOR_ORIGEM'      		,grupo=3	UNION ALL 
		SELECT Tabela='CTB_EXCECAO_IMPOSTO',							Coluna='NOME_CLIFOR'      				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADA_DEVOLUCAO_ACERTO',						Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADA_ITEM_RELACIONADO',						Coluna='ENT_NOME_CLIFOR'    			,grupo=3	UNION ALL
		SELECT Tabela='ENTRADA_ITEM_RELACIONADO',						Coluna='NOME_CLIFOR'     				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADA_RETORNO_BENEFICIAMENTO',					Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS',										Coluna='FATURA_NOME_CLIFOR'  			,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS',										Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS',										Coluna='NOME_CLIFOR_TRIANGULAR '		,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_CENTROS_CUSTO',							Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_CONSUMO',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_DESPESA',								Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_DESPESA',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_DEVOL_COMISSAO',						Coluna='NOME_CLIFOR'     				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_DEVOL_COMISSAO',						Coluna='REPRESENTANTE'     				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_IMPOSTO',								Coluna='NOME_CLIFOR'       				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_ITEM',									Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_MAT_PECA',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_MATERIAL',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_PRO_DEVOL',								Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='ENTRADAS_PRODUTO',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_ENT',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_SAI',								Coluna='NOME_CLIFOR'       				,grupo=3	UNION ALL
		SELECT Tabela='ESTOQUE_RET_MAT',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='ESTOQUE_SAI_MAT',								Coluna='FORNECEDOR'       				,grupo=3	UNION ALL
		SELECT Tabela='ESTOQUE_SAI_MAT',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='EVENTOS_CLIFOR',									Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='EVENTOS_CLIFOR',									Coluna='NOME_CLIFOR_RELACIONA'     		,grupo=3	UNION ALL
		SELECT Tabela='FATURAM_DEV_MAT',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAM_DEV_MAT_PECA',							Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAM_DEV_PROD',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO',									Coluna='GERENTE'     					,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO',									Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO',									Coluna='NOME_CLIFOR_ENTREGA'  			,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO',									Coluna='REPRESENTANTE'					,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_CAIXAS',								Coluna='FORNECEDOR'       				,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_CAIXAS',								Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_CAIXAS',								Coluna='NOME_CLIFOR_ENTREGA'    		,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_DEVOLUCAO_ACERTO',					Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_ENTRADA_DEVOLUCAO',					Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_IMAGEM',								Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_ITEM_RELACIONADO',					Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_SERVICO',							Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_SERVICO_RETORNO',					Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FATURAMENTO_TERCEIROS',							Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='FILIAIS',										Coluna='MATRIZ'     					,grupo=3	UNION ALL
		SELECT Tabela='FORNECEDOR_CENTRO_CUSTO',						Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='LOG_BORDERO_COBRANCA',							Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='LOJA_A_RECEBER_CHEQUES',							Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='LOJA_ENTRADAS',									Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='LOJAS_VAREJO',									Coluna='NOME_GERENTE_LOJA'      		,grupo=3	UNION ALL
		SELECT Tabela='LOJAS_VAREJO',									Coluna='NOME_GERENTE_PERIODO'      		,grupo=3	UNION ALL
		SELECT Tabela='M_ORDEM_FABRICACAO',								Coluna='CLIENTE_ATACADO'  				,grupo=3	UNION ALL
		SELECT Tabela='MATERIAIS',										Coluna='FABRICANTE'    					,grupo=3	UNION ALL
		SELECT Tabela='MATERIAIS_BASE',									Coluna='FABRICANTE'   					,grupo=3	UNION ALL
		SELECT Tabela='MATERIAIS_FORNECEDOR',							Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='MATERIAIS_FORNECEDOR_CUSTOS',					Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='MODIFICACAO_FICHA_CLIENTE',						Coluna='CLIENTE_ATACADO'    			,grupo=3	UNION ALL
		SELECT Tabela='MODIFICACAO_FICHA_TECNICA',						Coluna='CLIENTE_ATACADO'    			,grupo=3	UNION ALL
		SELECT Tabela='ORCAMENTOS',										Coluna='CLIENTE_ATACADO'  				,grupo=3	UNION ALL
		SELECT Tabela='ORCAMENTOS',										Coluna='REPRESENTANTE'   				,grupo=3	UNION ALL
		SELECT Tabela='ORCAMENTOS_ITENS',								Coluna='FABRICANTE_COMPONENTE'    		,grupo=3	UNION ALL
		SELECT Tabela='PARAMETROS_REPRESENTANTE',						Coluna='REPRESENTANTE'    				,grupo=3	UNION ALL
		SELECT Tabela='PRODUCAO_ORDEM',									Coluna='CLIENTE_ATACADO'  				,grupo=3	UNION ALL
		SELECT Tabela='PRODUCAO_ORDEM',									Coluna='ESTOQUE_EM_PROCESSO_MATERIAL'	,grupo=3	UNION ALL
		SELECT Tabela='PRODUCAO_OS_ANTERIOR',							Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='PRODUCAO_PROGRAMA',								Coluna='CLIENTE_ATACADO'      			,grupo=3	UNION ALL
		SELECT Tabela='PRODUCAO_RECURSOS',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='PRODUTO_FICHA_VERSAO',							Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS',										Coluna='CLIENTE_DO_PRODUTO'  			,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS',										Coluna='FABRICANTE'    					,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS_BARRA',									Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS_CLIENTE',								Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS_CLIENTE_COR',							Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS_FORNECEDOR',							Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS_GRIFFES',								Coluna='LICENCIADO'    					,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS_GRIFFES',								Coluna='LICENCIADOR'    				,grupo=3	UNION ALL
		SELECT Tabela='PRODUTOS_MODELO',								Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='REPRESENTANTE_COTA',								Coluna='REPRESENTANTE'					,grupo=3	UNION ALL
		SELECT Tabela='REPRESENTANTE_LANCAMENTOS',						Coluna='REPRESENTANTE'    				,grupo=3	UNION ALL
		SELECT Tabela='REQUISICOES',									Coluna='NOME_CLIFOR'        			,grupo=3	UNION ALL
		SELECT Tabela='RETORNO_A_PAGAR_PARCELAS',						Coluna='NOME_CLIFOR'     				,grupo=3	UNION ALL
		SELECT Tabela='RETORNO_A_RECEBER_PARCELAS',						Coluna='NOME_CLIFOR'   					,grupo=3	UNION ALL
		SELECT Tabela='SUBSTITUICOES_MATERIAL_CLIENTE',					Coluna='CLIENTE_ATACADO'  				,grupo=3	UNION ALL
		SELECT Tabela='VALES_A_RECEBER',								Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='VENDA_PREVISAO',									Coluna='REPRESENTANTE'   				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS',											Coluna='CLIENTE_ATACADO'  				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS',											Coluna='GERENTE'    					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS',											Coluna='NOME_CLIFOR_ENTREGA '			,grupo=3	UNION ALL
		SELECT Tabela='VENDAS',											Coluna='REPRESENTANTE'					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_COTAS_TIPO_ITENS',						Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_COTAS_TIPO_ITENS',						Coluna='REPRESENTANTE'					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_HISTORICO',								Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_HISTORICO',								Coluna='GERENTE'     					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_HISTORICO',								Coluna='NOME_CLIFOR_ENTREGA'     		,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_HISTORICO',								Coluna='REPRESENTANTE'    				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_HISTORICO_PROD',							Coluna='CLIENTE_ATACADO'     			,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_LOTE',									Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_LOTE',									Coluna='GERENTE'     					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_LOTE',									Coluna='NOME_CLIFOR_ENTREGA'      		,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_LOTE',									Coluna='REPRESENTANTE'    				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_LOTE_PROD_RATEIO_CAIXA',					Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_PROD_EMBALADO',							Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_PROD_EMBALADO',							Coluna='REPRESENTANTE'					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_PRODUTO_RATEIO_CAIXA',					Coluna='CLIENTE_ATACADO'   				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_RATEIO',									Coluna='CLIENTE_ATACADO'       			,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_DEV_PROD',						Coluna='FORNECEDOR'     				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_DEVOLUCAO',						Coluna='FORNECEDOR'     				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_FATURAMENTO',					Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_NF_DEV_PROD',					Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_NF_DEV_PROD',					Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_NF_DEV_PROD',					Coluna='REPRESENTANTE'    				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_NF_DEVOLUCAO',					Coluna='FORNECEDOR'    					,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_NF_DEVOLUCAO',					Coluna='NOME_CLIFOR'    				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_PGTO',							Coluna='FORNECEDOR'      				,grupo=3	UNION ALL
		SELECT Tabela='VENDAS_TERCEIRO_PRODUTO',						Coluna='FORNECEDOR'     				,grupo=3	UNION ALL
																					
	-- Lista a processar (Filial) >> para proxima fase								
		SELECT Tabela='A_PAGAR_FATURA',									Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='A_RECEBER_CHEQUES',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='A_RECEBER_FATURA',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ADMINISTRADORAS_INCONSISTENCIAS',				Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='CLIENTE_VAR_SAC',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='CLIENTES_ATACADO',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='CLIENTES_VAREJO',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='CM_ESTOQUE_MP',									Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='CM_ESTOQUE_MP_COMPOSICAO',						Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='CM_ESTOQUE_PA',									Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='CM_ESTOQUE_PA_COMPOSICAO',						Coluna='FILIAL'      					,grupo=4	UNION ALL
		SELECT Tabela='COLETOR_COLETA',									Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='COMPRAS',										Coluna='FILIAL_A_ENTREGAR'   			,grupo=4	UNION ALL
		SELECT Tabela='COMPRAS',										Coluna='FILIAL_A_FATURAR'   			,grupo=4	UNION ALL
		SELECT Tabela='COMPRAS',										Coluna='FILIAL_COBRANCA'   				,grupo=4	UNION ALL
		SELECT Tabela='CONTAS_LANCAMENTOS',								Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='CONTRATO_FATURAR',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='DATAS_FILIAIS',									Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='DISTRIBUICAO_META_AGRUPAMENTO',					Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='DISTRIBUICAO_PORCENTAGEM',						Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ENTRADA_ITEM_RELACIONADO',						Coluna='FAT_FILIAL'     				,grupo=4	UNION ALL
		SELECT Tabela='ENTRADA_RETORNO_BENEFICIAMENTO',					Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='ENTRADAS',										Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ENTRADAS',										Coluna='FILIAL_COBRANCA'   				,grupo=4	UNION ALL
		SELECT Tabela='ENTRADAS',										Coluna='FILIAL_ENTRADA'   				,grupo=4	UNION ALL
		SELECT Tabela='ENTRADAS',										Coluna='FILIAL_SAIDA'    				,grupo=4	UNION ALL
		SELECT Tabela='ENTRADAS_CONSUMO',								Coluna='FILIAL_REQ_MATERIAL'  			,grupo=4	UNION ALL
		SELECT Tabela='ENTRADAS_PRO_DEVOL',								Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_MAT_CONTAGEM',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_MAT_PECA',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_MATERIAIS',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_MATERIAIS_HISTORICO',					Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_CONTAGEM',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_ENT',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_ENT',								Coluna='FILIAL_DESTINO'   				,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_ENT',								Coluna='FILIAL_ORIGEM'    				,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_SAI',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_SAI',								Coluna='FILIAL_DESTINO'   				,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD_SAI',								Coluna='NF_FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD1_ENT',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PROD1_SAI',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PRODUTOS',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_PRODUTOS_HISTORICO',						Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_RET_MAT',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_RET_MAT',								Coluna='FILIAL_ORIGEM'    				,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_RET_PECA',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_RET1_MAT',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_SAI_MAT',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_SAI_MAT',								Coluna='FILIAL_DESTINO'   				,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_SAI_MAT',								Coluna='FILIAL_FATURAMENTO'  			,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_SAI_PECA',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_SAI1_MAT',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_SAI1_MAT',								Coluna='FILIAL_FATURAMENTO'  			,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_SUGESTAO_PRODUTO',						Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ESTOQUE_SUGESTAO_PRODUTO',						Coluna='FILIAL_DESTINO'   				,grupo=4	UNION ALL
		SELECT Tabela='FATURAM_DEV_MAT',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAM_DEV_MAT_PECA',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAM_DEV_PROD',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO',									Coluna='FATURA_FILIAL'    				,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO',									Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_CONSUMO',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_DEVOLUCAO_ACERTO',					Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_ENTRADA_DEVOLUCAO',					Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_IMAGEM',								Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_IMAGEM_PROD',						Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_IMPOSTO',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_ITEM',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_ITEM_RELACIONADO',					Coluna='FAT_FILIAL'    					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_ITEM_RELACIONADO',					Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_PROD',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_PROD_PROFORMA',						Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_SEQUENCIAIS',						Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_SERVICO',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='FATURAMENTO_TERCEIROS',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='INVENTARIO',										Coluna='FILIAL'          				,grupo=4	UNION ALL
		SELECT Tabela='INVENTARIO_AJUSTE',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='INVENTARIO_PRODUTO',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='INVENTARIO_SALDO_ESTOQUE',						Coluna='FILIAL'      					,grupo=4	UNION ALL
		SELECT Tabela='INVENTARIO_SETOR',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='LOCALIZACOES_PRODUTO',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOG_INTEGRACAO_LOJA',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_A_RECEBER_CHEQUES',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_CONTROLE_FISCAL',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_DADOS',										Coluna='FILIAL_RETAGUARDA'       		,grupo=4	UNION ALL
		SELECT Tabela='LOJA_DADOS_FILIAIS',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_DADOS_LOG',									Coluna='FILIAL'         				,grupo=4	UNION ALL
		SELECT Tabela='LOJA_ENTRADAS',									Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_ENTRADAS',									Coluna='FILIAL_ORIGEM'    				,grupo=4	UNION ALL
		SELECT Tabela='LOJA_ENTRADAS',									Coluna='MOV_FILIAL'    					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_ENTRADAS_DIF',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_ENTRADAS_DIF',								Coluna='FILIAL_ORIGEM'      			,grupo=4	UNION ALL
		SELECT Tabela='LOJA_ENTRADAS_PRODUTO',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_ENTRADAS_PRODUTO_DIF',						Coluna='FILIAL'      					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_FRANQUIA_ESTOQUE',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_FRANQUIA_GIRO',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_FRANQUIA_VENDA',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_IMPRESSORA_FISCAL',							Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='LOJA_PEDIDO_ENTRADA',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_PEDIDO_SAIDA',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_RESERVA',									Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_RESERVA_PRODUTO',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_SAIDAS',									Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_SAIDAS',									Coluna='FILIAL_DESTINO'   				,grupo=4	UNION ALL
		SELECT Tabela='LOJA_SAIDAS',									Coluna='MOV_FILIAL'    					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_SAIDAS_PRODUTO',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='LOJA_TRANSF',									Coluna='FILIAL_ORIGEM'        			,grupo=4	UNION ALL
		SELECT Tabela='LOJA_TRANSF_TABELAS',							Coluna='FILIAL_DESTINO'     			,grupo=4	UNION ALL
		SELECT Tabela='LOJA_TRANSF_TABELAS',							Coluna='FILIAL_ORIGEM'      			,grupo=4	UNION ALL
		SELECT Tabela='LOJA_TRANSITO',									Coluna='FILIAL'         				,grupo=4	UNION ALL
		SELECT Tabela='LOJA_TRANSITO',									Coluna='FILIAL_ORIGEM'       			,grupo=4	UNION ALL
		SELECT Tabela='LOJA_TRANSITO_PRODUTO',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJAS_ENVIOS_FILIAIS',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJAS_ENVIOS_FILTROS',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJAS_ENVIOS_RETORNOS',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='LOJAS_ENVIOS_RETORNOS',							Coluna='FILIAL_ORIGEM_DESTINO'   		,grupo=4	UNION ALL
		SELECT Tabela='LOJAS_GIRO',										Coluna='FILIAL'          				,grupo=4	UNION ALL
		SELECT Tabela='LOJAS_PREVISAO_VENDAS',							Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='LOJAS_VAREJO',									Coluna='FILIAL'         				,grupo=4	UNION ALL
		SELECT Tabela='M_ORDEM_FABRICACAO',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='M_ORDEM_SERVICO',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='MATERIAIS_INDICADOR_CFOP',						Coluna='FILIAL'      					,grupo=4	UNION ALL
		SELECT Tabela='MATERIAIS_LOCALIZA',								Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='NATUREZAS_FILIAIS_BLOQ_ENT',						Coluna='FILIAL'      					,grupo=4	UNION ALL
		SELECT Tabela='NATUREZAS_FILIAIS_BLOQUEADAS',					Coluna=' FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='PRODUCAO_CORTE',									Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='PRODUCAO_CORTE_PECA',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='PRODUCAO_ENTRADA_BENEFICIAMENTO',				Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='PRODUCAO_ORDEM',									Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='PRODUCAO_ORDEM_SERVICO',							Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='PRODUTOS_INDICADOR_CFOP',						Coluna='FILIAL'      					,grupo=4	UNION ALL
		SELECT Tabela='PRODUTOS_SIMILARES_DATA_INIC',					Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='PRODUTOS_SIMILARES_MOV',							Coluna='FILIAL'       					,grupo=4	UNION ALL
		SELECT Tabela='ROMANEIOS',										Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ROMANEIOS_PRODUTO',								Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='ROMANEIOS_RESERVAS',								Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='TRANSPORTADORA_FRETE_FAIXA_PESO',				Coluna='FILIAL_ORIGEM'   				,grupo=4	UNION ALL
		SELECT Tabela='TRANSPORTADORA_FRETE_LOCALIDADE',				Coluna='FILIAL_ORIGEM'   				,grupo=4	UNION ALL
		SELECT Tabela='VENDA_PREVISAO',									Coluna='FILIAL'         				,grupo=4	UNION ALL
		SELECT Tabela='VENDAS',											Coluna='FILIAL'    						,grupo=4	UNION ALL
		SELECT Tabela='VENDAS',											Coluna='FILIAL_DIGITACAO'  				,grupo=4	UNION ALL
		SELECT Tabela='VENDAS_HISTORICO',								Coluna='FILIAL'        					,grupo=4	UNION ALL
		SELECT Tabela='VENDAS_LOTE',									Coluna='FILIAL'         				,grupo=4	UNION ALL
		SELECT Tabela='VENDAS_LOTE',									Coluna='FILIAL_DIGITACAO'       		,grupo=4	UNION ALL
		SELECT Tabela='VENDAS_PROD_EMBALADO',							Coluna='FILIAL'     					,grupo=4	UNION ALL	
		SELECT Tabela='LJ_LF_ECF_ITEM',									Coluna='FILIAL'     					,grupo=4	UNION ALL
		SELECT Tabela='LJ_LF_ECF_ITEM',									Coluna='MATRIZ_FISCAL'     				,grupo=4									 
		--
	) 

 --

select a.*
 from (select distinct tabela,		  coluna,grupo,1 as tipo from Tmp_Dependentes where grupo IN (1,2) union all -- (obs: Apenas 2a. fase LGPD)
	   select distinct 'PROP_'+tabela,coluna,grupo,2 as tipo from Tmp_Dependentes where grupo IN (1,2)) a
 join sys.tables     b on b.name=a.tabela
 join sys.columns    c on c.object_id=b.object_id and c.name=a.coluna
 join sys.types      d on d.user_type_id=c.system_type_id 

 --
