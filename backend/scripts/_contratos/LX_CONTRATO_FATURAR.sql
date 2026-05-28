
/* VISUALLINX Execute(Alias:CriaProc)  */
CREATE PROCEDURE LX_CONTRATO_FATURAR 
				@Xreajustar tinyint=null,
				@filial varchar(25)=null,
				@filial_contabil varchar(25)=null,
				@empresa tinyint=null,
				@Data_Inicio datetime=null,
				@Data_Fim datetime=null,
				@retorna tinyint=null,
				@vencimento_real bit=null,
				@ultimo_reajuste_ini datetime=null,
				@ultimo_reajuste_fim datetime=null,
				@vigencia_ini datetime=null,
				@vigencia_fim datetime=null,
				@cod_clifor char(6)=null,
				@cod_filial char(6)=null,
			    @recorrencia smallint=null,
				@aberto bit=null,
				@item_descricao_fatura char(80)=null,
				@contrato_tipo char(4)=null
				
AS

-- 12/03/2007 - Estevam	  - Alterado para reajustar com base no preço unitário e não no valor do contrato
-- 13/12/2006 - Estevam	  - Alterado para incluir filtro por contrato_tipo
-- 15/03/2006 - Estevam   - Alterado para permitir faturar sem reajustar
-- 20/10/2005 - Felipe    - Alterado o tratamento de contratos com Recorrencia Anual
-- 25/08/2005 - Felipe    - Alterada Referencia para Recorrencia Quinzenal.
-- 12/08/2005 - Felipe    - Corrigido o tratamento do Reajuste
-- 07/01/2005 - Basilio   - Alteração para colocar o campo Recorrencia_item,Nf_saida,Serie_nf,Filial no retorno do cursor Aberto
-- 23/12/2004 - Basilio   - Alteração para adicionar o filtro de Contrato_item.item_descricao_fatura
-- 09/12/2004 - Basilio	  - Alteração para mandar o valor do contrato reajustado para a tabela contrato_faturar só estava atualizando a contrato_item
-- 07/12/2004 - Felipe    - Alteração no tratamento dos CONTRATO_FATURAR para o parametro @Retorna=1 e @Aberto=1
-- 12/11/2004 - Basilio   - Alteração na data do cambio para reajuste, estava com o faturamento relativo e deve ser date do dia.
-- 05/11/2004 - Basilio   - Alteração para colocar o parametro @aberto para devolver agrupado ou nao
-- 03/11/2004 - Basilio   - Alteração para tirar Execute e colocar os parametros (@ultimo_reajuste_ini,@ultimo_reajuste_fim,@vigencia_ini,@vigencia_fim,@cod_clifor,@cod_filial,@recorrencia)
-- 28/10/2004 - Basilio   - Alteração para colocar o parametro de @vencimento_real para escolher a data de vencimento_real ou vencimento
-- 26/10/2004 - Basilio   - Alteração para usar a função FX_CAMBIO_DECIMAIS
-- 26/10/2004 - Basilio   - Alteração no processo para devolver um cursor quando @retorna=1 para o fluxo de caixa
-- 20/10/2004 - Basilio   - Alteração no processo de geração do reajuste para atualizar a data ultimo_reajuste com a data faturamento relativo

set nocount on	

DECLARE	@cId_Contrato varchar(25) ,
		@cItem char(4) ,
		@dData_Faturamento_Relativo datetime,
		@nRecorrencia smallint,
		@nRecorrencia_Reajuste smallint,
		@nQtde numeric(9,3),
		@nValor_Contrato numeric(14,2),
		@nPreco_Unitario numeric(14,2),
		@nPreco_Base numeric(14,2),
		@nPreco_Unitario_reajuste numeric(14,2),
		@nDesconto numeric(8,5),
		@nEncargo numeric(8,5),
		@cConta_Contabil varchar(20) ,
		@cRateio_Centro_Custo varchar(15) ,
		@cRateio_Filial varchar(15) ,
		@cCondicao_Pgto char(3) ,
		@cFilial varchar(25) ,
		@dData_Inicio datetime,
		@dData_Fim datetime,
		@cMoeda char(6) ,
		@cMoeda_Reajuste char(6) ,
		@nRecorrencia_Item char(8),
		@nFator_Cambio tinyint,
		@nCambio numeric(15,6),
		@nCambio_Anterior numeric(15,6),
		@nValor_Base numeric(20,6),
		@dData_Cambio_Reajuste datetime,
		@nValor_Contrato_reajuste numeric(14,2),
		@dUltimo_Reajuste datetime,
		@cCod_Representante char(6),
		@cCod_Representante_Gerente char(6),
		@nComissao_Item numeric(8,5),
		@nComissao_Item_Gerente numeric(8,5),	
		@dData datetime	,
		@cWhere varchar(2000),
		@nWhile int,
		@dVencimento DATETIME,
		@dVencimento_Real DATETIME, 
		@nValor_Data NUMERIC(14,2),
		@dData_Reajuste DATETIME



CREATE TABLE #FLUXO_CAIXA (
					VENCIMENTO				DATETIME,
					VENCIMENTO_REAL			DATETIME,
					VALOR					NUMERIC(14,2),
					ID_CONTRATO				VARCHAR(25) COLLATE DATABASE_DEFAULT,
					ITEM					CHAR(4)		COLLATE DATABASE_DEFAULT,
					RECORRENCIA_ITEM		CHAR(8)		COLLATE DATABASE_DEFAULT
					 )

--criando tabela para auxiliar na pesquisa dos dados dos contratos
CREATE TABLE #CONTRATOS (
				ID_CONTRATO				VARCHAR(25)	COLLATE DATABASE_DEFAULT,
				ITEM					CHAR(4)		COLLATE DATABASE_DEFAULT,
				DATA_FATURAMENTO_RELATIVO		DATETIME,
				RECORRENCIA				SMALLINT,
				RECORRENCIA_REAJUSTE			SMALLINT,
				QTDE					NUMERIC(9,3),
				PRECO_UNITARIO				NUMERIC(14,2),
				DESCONTO					NUMERIC(8,5),
				ENCARGO						NUMERIC(8,5),
				VALOR_CONTRATO				NUMERIC(14,2),
				CONTA_CONTABIL				VARCHAR(20)	COLLATE DATABASE_DEFAULT,
				RATEIO_CENTRO_CUSTO			VARCHAR(15)	COLLATE DATABASE_DEFAULT,
				RATEIO_FILIAL				VARCHAR(15)	COLLATE DATABASE_DEFAULT,
				CONDICAO_PGTO				CHAR(3)		COLLATE DATABASE_DEFAULT,
				FILIAL					VARCHAR(25)	COLLATE DATABASE_DEFAULT,
				DATA_INICIO				DATETIME,
				DATA_FIM				DATETIME,
				MOEDA					CHAR(6)		COLLATE DATABASE_DEFAULT,
				MOEDA_REAJUSTE				CHAR(6)		COLLATE DATABASE_DEFAULT,
				ULTIMO_REAJUSTE				DATETIME,
				COD_REPRESENTANTE			CHAR(6)		COLLATE DATABASE_DEFAULT,
				COD_REPRESENTANTE_GERENTE		CHAR(6)		COLLATE DATABASE_DEFAULT,
				COMISSAO_ITEM				NUMERIC(8,5),
				COMISSAO_ITEM_GERENTE			NUMERIC(8,5),
				CAMBIO_REAJUSTE				NUMERIC(15,6))

SELECT @dData=CONVERT(CHAR(8), @Data_Inicio, 112)
WHILE @dData<=@Data_Fim
BEGIN

	INSERT INTO #CONTRATOS 
	SELECT	CONTRATO_ITEM.ID_CONTRATO,CONTRATO_ITEM.ITEM,@DDATA,
			CONTRATO_ITEM.RECORRENCIA,CONTRATO_ITEM.RECORRENCIA_REAJUSTE,
			CONTRATO_ITEM.QTDE,CONTRATO_ITEM.PRECO_UNITARIO,CONTRATO_ITEM.DESCONTO,CONTRATO_ITEM.ENCARGO,
			CONTRATO_ITEM.VALOR_CONTRATO,CONTRATO_ITEM.CONTA_CONTABIL,CONTRATO_ITEM.RATEIO_CENTRO_CUSTO,
			CONTRATO_ITEM.RATEIO_FILIAL,CONTRATO_ITEM.CONDICAO_PGTO,FILIAIS.FILIAL,
			CONTRATO_ITEM.DATA_INICIO,CONTRATO_ITEM.DATA_FIM,CONTRATO_ITEM.MOEDA,
			CONTRATO_ITEM.MOEDA_REAJUSTE,CONTRATO_ITEM.ULTIMO_REAJUSTE,CONTRATO.COD_REPRESENTANTE,
			CONTRATO.COD_REPRESENTANTE_GERENTE,ISNULL(CONTRATO_ITEM.COMISSAO_ITEM,0)AS COMISSAO_ITEM,
			ISNULL(CONTRATO_ITEM.COMISSAO_ITEM_GERENTE,0)AS COMISSAO_ITEM_GERENTE, CONTRATO_ITEM.CAMBIO_REAJUSTE
	FROM CONTRATO_ITEM 
			JOIN CONTRATO ON CONTRATO.ID_CONTRATO=CONTRATO_ITEM.ID_CONTRATO 
			JOIN CONTRATO_TIPO ON CONTRATO_TIPO.CONTRATO_TIPO=CONTRATO_ITEM.CONTRATO_TIPO 
			JOIN FILIAIS ON CONTRATO.COD_FILIAL=FILIAIS.COD_FILIAL 
	WHERE CONTRATO_TIPO.LX_TIPO_CONTRATO=1 AND 
			CONTRATO_ITEM.DATA_FIM>=@dData AND CONTRATO_ITEM.DATA_INICIO<=@dData AND
			(FILIAIS.FILIAL=@FILIAL OR @FILIAL IS NULL) AND
			(FILIAIS.MATRIZ=@FILIAL_CONTABIL OR @FILIAL_CONTABIL IS NULL) AND
			(FILIAIS.EMPRESA=@EMPRESA OR @EMPRESA IS NULL) AND
			((CONTRATO_ITEM.ULTIMO_REAJUSTE BETWEEN @ULTIMO_REAJUSTE_INI AND @ULTIMO_REAJUSTE_FIM) OR (@ULTIMO_REAJUSTE_INI IS NULL AND @ULTIMO_REAJUSTE_FIM IS NULL)) AND
			((CONTRATO_ITEM.DATA_INICIO>=@VIGENCIA_INI AND CONTRATO_ITEM.DATA_FIM<=@VIGENCIA_FIM) OR (@VIGENCIA_INI IS NULL AND @VIGENCIA_FIM IS NULL)) AND
			(CONTRATO.COD_CLIFOR=@COD_CLIFOR OR @COD_CLIFOR IS NULL) AND
			(CONTRATO.COD_FILIAL=@COD_FILIAL OR @COD_FILIAL IS NULL) AND
			(CONTRATO_ITEM.RECORRENCIA=@RECORRENCIA OR @RECORRENCIA IS NULL ) AND
			(CONTRATO_ITEM.ITEM_DESCRICAO_FATURA=@ITEM_DESCRICAO_FATURA OR @ITEM_DESCRICAO_FATURA IS NULL) AND 
			(CONTRATO_ITEM.CONTRATO_TIPO=@CONTRATO_TIPO OR @CONTRATO_TIPO IS NULL)
			AND (
				--recorrencia semanal/quinzenal/mensal
				CONTRATO_ITEM.RECORRENCIA IN (1,2,3,4)
				--recorrencia bimestral		Recorrencia=5 
				OR (CONTRATO_ITEM.RECORRENCIA = 5 AND DATEDIFF(Month, CONTRATO_ITEM.DATA_INICIO, @dDATA) % 2 = 0 )
				--recorrencia trimestral	Recorrencia=6
				OR (CONTRATO_ITEM.RECORRENCIA = 6 AND DATEDIFF(Month, CONTRATO_ITEM.DATA_INICIO, @dDATA) % 3 = 0 )
				--recorrencia quadrimestral	Recorrencia=7
				OR (CONTRATO_ITEM.RECORRENCIA = 7 AND DATEDIFF(Month, CONTRATO_ITEM.DATA_INICIO, @dDATA) % 4 = 0 )
				--recorrencia semestral		Recorrencia=8
				OR (CONTRATO_ITEM.RECORRENCIA = 8 AND DATEDIFF(Month, CONTRATO_ITEM.DATA_INICIO, @dDATA) % 6 = 0 )
				--recorrencia anual		Recorrencia=9
				OR (CONTRATO_ITEM.RECORRENCIA = 9 AND DATEDIFF(Month, CONTRATO_ITEM.DATA_INICIO, @dDATA) % 12 = 0 )
			)

	SELECT @dData=DATEADD(day, 1, @dData)
END

SELECT @dData=@Data_Inicio

IF @retorna=0
BEGIN	
	BEGIN TRANSACTION gera_contrato
END

DECLARE cur_contratos cursor for SELECT * FROM #contratos

OPEN cur_contratos

FETCH NEXT FROM cur_contratos INTO @cId_Contrato,@cItem,@dData,@nRecorrencia,
	@nRecorrencia_Reajuste, @nQtde, @nPreco_Unitario, @nDesconto, @nEncargo, 
	@nValor_Contrato,@cConta_Contabil,
	@cRateio_Centro_Custo,@cRateio_Filial,@cCondicao_Pgto,@cFilial,
	@dData_Inicio,@dData_Fim,@cMoeda,@cMoeda_Reajuste,@dUltimo_Reajuste,
	@cCod_Representante,@cCod_Representante_Gerente,@nComissao_Item,@nComissao_Item_Gerente, @nCambio_Anterior


WHILE @@fetch_status = 0
BEGIN	

	--sem recorrencia
	IF @nRecorrencia = 1 
	BEGIN
		SELECT @nRecorrencia_Item='R000000'
		SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(DAY,@dData),@dData)
	END

	IF @nRecorrencia_Reajuste = 1
	BEGIN
		SELECT @dData_Reajuste = '19000101'
	END
	--recorrencia semanal	
	IF @nRecorrencia = 2 
	BEGIN
		SELECT @nRecorrencia_Item='W'+dbo.FX_PADL(STR(DATEPART(WEEK,@dData)),2,'0')+'Y'+STR(DATEPART(YEAR,@dData),4)
		SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(WEEKDAY,@dData),@dData)
	END
	IF @nRecorrencia_Reajuste = 2
	BEGIN
		SELECT @dData_Reajuste = DATEADD(WEEK,1,@dUltimo_Reajuste)
	END
	--recorrencia quinzenal
	IF @nRecorrencia = 3
	BEGIN
		IF DATEPART(DAY,@dData)<15
		BEGIN
			SELECT @nRecorrencia_Item='H1'+'M'+dbo.FX_PADL(STR(DATEPART(MONTH,@dData)),2,'0')+'Y'+RIGHT(STR(DATEPART(YEAR,@dData),4),2)
			SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(DAY,@dData),@dData)
		END
		ELSE
	    IF @nRecorrencia = 3
		BEGIN
			SELECT @nRecorrencia_Item='H2'+'M'+dbo.FX_PADL(STR(DATEPART(MONTH,@dData)),2,'0')+'Y'+RIGHT(STR(DATEPART(YEAR,@dData),4),2)
			SELECT @dData_Faturamento_Relativo=DATEADD(DAY,15-DATEPART(DAY,@dData),@dData)
		END
	END
	IF @nRecorrencia_Reajuste = 3
	BEGIN
		IF DATEPART(DAY,@dData)<15
			SELECT @dData_Reajuste = DATEADD(DAY,15,@dUltimo_Reajuste)
		ELSE
			SELECT @dData_Reajuste = DATEADD(MONTH,1,DATEADD(DAY,-15,@dUltimo_Reajuste))
	END
	
	--recorrencia mensal
	IF @nRecorrencia = 4
	BEGIN
		SELECT @nRecorrencia_Item='M'+dbo.FX_PADL(STR(DATEPART(MONTH,@dData)),2,'0')+'Y'+STR(DATEPART(YEAR,@dData),4)
		SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(DAY,@dData),@dData)
	END
	IF @nRecorrencia_Reajuste = 4
	BEGIN
		SELECT @dData_Reajuste = DATEADD(MONTH,1,@dUltimo_Reajuste)
	END
	--recorrencia bimestral
	IF @nRecorrencia = 5 
	BEGIN
		SELECT @nRecorrencia_Item='B'+dbo.FX_PADL(STR(CEILING(DATEPART(MONTH,@dData)/2.)),2,'0')+'Y'+STR(DATEPART(YEAR,@dData),4)
		SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(DAY,@dData),@dData)
	END
	IF @nRecorrencia_Reajuste = 5
	BEGIN
		SELECT @dData_Reajuste = DATEADD(MONTH,2,@dUltimo_Reajuste)
	END

	--recorrencia trimestral
	IF @nRecorrencia = 6
	BEGIN
		SELECT @nRecorrencia_Item='T'+dbo.FX_PADL(STR(CEILING(DATEPART(MONTH,@dData)/3.)),2,'0')+'Y'+STR(DATEPART(YEAR,@dData),4)
		SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(DAY,@dData),@dData)
	END
	IF @nRecorrencia_Reajuste = 6
	BEGIN
		SELECT @dData_Reajuste = DATEADD(MONTH,3,@dUltimo_Reajuste)
	END

	--recorrencia quadrimestral
	IF @nRecorrencia = 7
	BEGIN
		SELECT @nRecorrencia_Item='Q'+dbo.FX_PADL(STR(CEILING(DATEPART(MONTH,@dData)/4.)),2,'0')+'Y'+STR(DATEPART(YEAR,@dData),4)
		SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(DAY,@dData),@dData)
	END
	IF @nRecorrencia_Reajuste = 7
	BEGIN
		SELECT @dData_Reajuste = DATEADD(MONTH,4,@dUltimo_Reajuste)
	END

	--recorrencia semestral
	IF @nRecorrencia = 8
	BEGIN
		SELECT @nRecorrencia_Item='S'+dbo.FX_PADL(STR(CEILING(DATEPART(MONTH,@dData)/6.)),2,'0')+'Y'+STR(DATEPART(YEAR,@dData),4)
		SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(DAY,@dData),@dData)
	END
	IF @nRecorrencia_Reajuste = 8
	BEGIN
		SELECT @dData_Reajuste = DATEADD(MONTH,6,@dUltimo_Reajuste)
	END

	--recorrencia anual
	IF @nRecorrencia = 9 
	BEGIN
		SELECT @nRecorrencia_Item='Y'+STR(DATEPART(YEAR,@dData),4)
		SELECT @dData_Faturamento_Relativo=DATEADD(DAY,1-DATEPART(DAY,@dData),@dData)
	END
	IF @nRecorrencia_Reajuste = 9
	BEGIN
		SELECT @dData_Reajuste = DATEADD(YEAR,1,@dUltimo_Reajuste)
	END


	-- Reajusta Contratos
	IF ( @dData_Faturamento_Relativo >= @dData_Reajuste or @Xreajustar=1 ) and @nRecorrencia_Reajuste > 1 and @Xreajustar < 3
	BEGIN
		SELECT @nFator_Cambio = CASE WHEN VALOR_ATUAL='.T.' THEN 1 ELSE -1 END
		FROM PARAMETROS 
		WHERE PARAMETRO='CAMBIO_NA_MOEDA_PADRAO'

		SELECT @nCambio = VALOR, @dData_Cambio_Reajuste=DATA
		FROM MOEDAS_CONVERSAO 
		WHERE MOEDA=@cMoeda_Reajuste AND 
			DATA=(SELECT MAX(DATA) FROM MOEDAS_CONVERSAO WHERE MOEDA=@cMoeda_Reajuste AND DATA<=@dData_Reajuste)			

		IF @nCambio_Anterior IS NULL
			SELECT @nCambio_Anterior = ISNULL(@nCambio,1)

		IF @nCambio_Anterior IS NULL
			SELECT @nCambio = ISNULL(@nCambio_Anterior,1)


		-- passou a reajustar com base no preço unitário

		SELECT @nPreco_Base = (1.*@nPreco_Unitario / CONVERT(NUMERIC(14,6),POWER(CONVERT(REAL,@nCambio_Anterior),ISNULL(@nFator_Cambio,1))))
		SELECT @nPreco_Unitario_reajuste = CONVERT(NUMERIC(14, 2), @nPreco_Base * CONVERT(NUMERIC(14,6),POWER(CONVERT(REAL,@nCambio),ISNULL(@nFator_Cambio,1))))

--		SELECT @nValor_Base = (1.*@nValor_Contrato / CONVERT(NUMERIC(14,6),POWER(CONVERT(REAL,@nCambio_Anterior),ISNULL(@nFator_Cambio,1))))
--		SELECT @nValor_Contrato_reajuste = CONVERT(NUMERIC(14, 2), @nValor_Base * CONVERT(NUMERIC(14,6),POWER(CONVERT(REAL,@nCambio),ISNULL(@nFator_Cambio,1))))

		SELECT @nQtde = case when @nQtde = 0 then 1 else @nQtde end
		SELECT @nValor_Contrato_reajuste = (@nQtde * @nPreco_Unitario_reajuste)
		SELECT @nValor_Contrato_reajuste = @nValor_Contrato_reajuste - (@nValor_Contrato_reajuste * isnull(@nDesconto,0)/100) + (@nValor_Contrato_reajuste * isnull(@nEncargo,0)/100)

		UPDATE CONTRATO_ITEM 
		SET VALOR_CONTRATO			= @nValor_Contrato_reajuste,
			ULTIMO_REAJUSTE			= @dData_Reajuste,
			--PRECO_UNITARIO			= CASE WHEN @nQtde = 0 THEN @nValor_Contrato_reajuste ELSE @nValor_Contrato_reajuste/@nQtde END,
			PRECO_UNITARIO			= @nPreco_Unitario_reajuste, 
			CAMBIO_REAJUSTE			= @nCambio,
			DATA_CAMBIO_REAJUSTE	= @dData_Cambio_Reajuste
		WHERE ID_CONTRATO=@CID_CONTRATO AND ITEM=@CITEM
		IF @@ERROR > 0 GOTO ERRO

		SELECT @nValor_Contrato=@nValor_Contrato_reajuste
	END


	IF @Xreajustar=1 or @Xreajustar=3
		IF @RETORNA=0
			IF not exists(SELECT * FROM contrato_faturar where id_contrato=@cId_Contrato and item=@cItem and recorrencia_item=@nRecorrencia_Item)
			BEGIN
				INSERT INTO CONTRATO_FATURAR (ID_CONTRATO,ITEM,RECORRENCIA_ITEM,DATA_FATURAMENTO_RELATIVO,
					QTDE,VALOR_CONTRATO,CONTA_CONTABIL,RATEIO_CENTRO_CUSTO,RATEIO_FILIAL,CONDICAO_PGTO,
					COD_REPRESENTANTE,COD_REPRESENTANTE_GERENTE,COMISSAO_ITEM,COMISSAO_ITEM_GERENTE)
				VALUES	
					(@CID_CONTRATO,@CITEM,@nRecorrencia_Item,@DDATA_FATURAMENTO_RELATIVO,
					@NQTDE,@NVALOR_CONTRATO,@cConta_Contabil,@cRateio_Centro_Custo,@cRateio_Filial,@cCondicao_Pgto,
					@cCod_Representante,@cCod_Representante_Gerente,@nComissao_Item,@nComissao_Item_Gerente)
				IF @@ERROR > 0 GOTO ERRO
			END
		ELSE -- INSERINDO NA TABELA TEMPORARIA PARA DEVOLVER O CURSOR
		BEGIN
			IF not exists(SELECT * FROM #fluxo_caixa where id_contrato=@cId_Contrato and item=@cItem and recorrencia_item=@nRecorrencia_Item)
			BEGIN
				SELECT @nWhile = 1
				WHILE @nWhile <= 12
				BEGIN

					SELECT 	@dVencimento		= CASE WHEN CASE @nWhile WHEN 1 THEN PORCENTAGEM_1 WHEN 2 THEN PORCENTAGEM_2 WHEN 3 THEN PORCENTAGEM_3 WHEN 4 THEN PORCENTAGEM_4 WHEN 5 THEN PORCENTAGEM_5 WHEN 6 THEN PORCENTAGEM_6 WHEN 7 THEN PORCENTAGEM_7 WHEN 8 THEN PORCENTAGEM_8 WHEN 9 THEN PORCENTAGEM_9 WHEN 10 THEN PORCENTAGEM_10 WHEN 11 THEN PORCENTAGEM_11 WHEN 12 THEN PORCENTAGEM_12 END > 0
										THEN 
											DATEADD(DAY, 
											CASE @nWhile WHEN 1 THEN PARCELA_1 WHEN 2 THEN PARCELA_2 WHEN 3 THEN PARCELA_3 WHEN 4 THEN PARCELA_4 WHEN 5 THEN PARCELA_5 WHEN 6 THEN PARCELA_6 WHEN 7 THEN PARCELA_7 WHEN 8 THEN PARCELA_8 WHEN 9 THEN PARCELA_9 WHEN 10 THEN PARCELA_10 WHEN 11 THEN PARCELA_11 WHEN 12 THEN PARCELA_12 END
											,@dData_Faturamento_Relativo)
										ELSE NULL END,
						@dVencimento_Real	=CASE WHEN CASE @nWhile WHEN 1 THEN PORCENTAGEM_1 WHEN 2 THEN PORCENTAGEM_2 WHEN 3 THEN PORCENTAGEM_3 WHEN 4 THEN PORCENTAGEM_4 WHEN 5 THEN PORCENTAGEM_5 WHEN 6 THEN PORCENTAGEM_6 WHEN 7 THEN PORCENTAGEM_7 WHEN 8 THEN PORCENTAGEM_8 WHEN 9 THEN PORCENTAGEM_9 WHEN 10 THEN PORCENTAGEM_10 WHEN 11 THEN PORCENTAGEM_11 WHEN 12 THEN PORCENTAGEM_12 END > 0
										THEN 
											(DBO.LX_DATA_REAL(NULL, 
											DATEADD(DAY, 
												CASE @nWhile WHEN 1 THEN PARCELA_1 WHEN 2 THEN PARCELA_2 WHEN 3 THEN PARCELA_3 WHEN 4 THEN PARCELA_4 WHEN 5 THEN PARCELA_5 WHEN 6 THEN PARCELA_6 WHEN 7 THEN PARCELA_7 WHEN 8 THEN PARCELA_8 WHEN 9 THEN PARCELA_9 WHEN 10 THEN PARCELA_10 WHEN 11 THEN PARCELA_11 WHEN 12 THEN PARCELA_12 END
												,@dData_Faturamento_Relativo))) 
										ELSE NULL END,
						@nValor_Data		=@nValor_Contrato*
										ISNULL(CASE @nWhile WHEN 1 THEN PORCENTAGEM_1 WHEN 2 THEN PORCENTAGEM_2 WHEN 3 THEN PORCENTAGEM_3 WHEN 4 THEN PORCENTAGEM_4 WHEN 5 THEN PORCENTAGEM_5 WHEN 6 THEN PORCENTAGEM_6 WHEN 7 THEN PORCENTAGEM_7 WHEN 8 THEN PORCENTAGEM_8 WHEN 9 THEN PORCENTAGEM_9 WHEN 10 THEN PORCENTAGEM_10 WHEN 11 THEN PORCENTAGEM_11 WHEN 12 THEN PORCENTAGEM_12 END,0)
										/100.
					FROM COND_ATAC_PGTOS
					WHERE CONDICAO_PGTO = @cCondicao_Pgto  	


					IF @nValor_Data > 0 AND @dVencimento_Real >= @Data_Inicio AND @dVencimento_Real<= @Data_Fim
					BEGIN
						INSERT #FLUXO_CAIXA (VENCIMENTO,VENCIMENTO_REAL, VALOR,ID_CONTRATO,ITEM,RECORRENCIA_ITEM)
						VALUES(@dVencimento,@dVencimento_Real,@nValor_Data,@cId_Contrato,@cItem,@nRecorrencia_Item)
					END

		
					SELECT @nWhile = @nWhile + 1
				END
			END

		END

	

	FETCH NEXT FROM cur_contratos INTO @cId_Contrato,@cItem,@dData,@nRecorrencia,
		@nRecorrencia_Reajuste,@nQtde,@nPreco_Unitario, @nDesconto, @nEncargo, 
		@nValor_Contrato,@cConta_Contabil,
		@cRateio_Centro_Custo,@cRateio_Filial,@cCondicao_Pgto,@cFilial,
		@dData_Inicio,@dData_Fim,@cMoeda,@cMoeda_Reajuste,@dUltimo_Reajuste,
		@cCod_Representante,@cCod_Representante_Gerente,@nComissao_Item,@nComissao_Item_Gerente, @nCambio_Anterior

END



close cur_contratos
deallocate cur_contratos

IF @retorna=0
BEGIN	
	commit TRANSACTION gera_contrato
END
else
BEGIN
	DECLARE cur_contratos cursor for 
		SELECT  A.ID_CONTRATO,
			A.ITEM,
			A.RECORRENCIA_ITEM,
			A.DATA_FATURAMENTO_RELATIVO,
			A.VALOR_CONTRATO,
			A.CONDICAO_PGTO
		FROM CONTRATO_FATURAR A
			JOIN CONTRATO B ON B.ID_CONTRATO=A.ID_CONTRATO 
			JOIN FILIAIS  C ON B.COD_FILIAL=C.COD_FILIAL 
		WHERE (C.FILIAL=@FILIAL OR @FILIAL IS NULL) AND
			(C.MATRIZ=@FILIAL_CONTABIL OR @FILIAL_CONTABIL IS NULL) AND
			(C.EMPRESA=@EMPRESA OR @EMPRESA IS NULL)


	OPEN cur_contratos
	FETCH NEXT FROM cur_contratos INTO @cId_Contrato,@cItem,@nRecorrencia_Item,@dData_Faturamento_Relativo,@nValor_Contrato,@cCondicao_Pgto

	WHILE @@fetch_status = 0
	BEGIN

			IF not exists(SELECT * FROM #fluxo_caixa where id_contrato=@cId_Contrato and item=@cItem and recorrencia_item=@nRecorrencia_Item)
			BEGIN
				SELECT @nWhile = 1
				WHILE @nWhile <= 12
				BEGIN

					SELECT 	@dVencimento		= CASE WHEN CASE @nWhile WHEN 1 THEN PORCENTAGEM_1 WHEN 2 THEN PORCENTAGEM_2 WHEN 3 THEN PORCENTAGEM_3 WHEN 4 THEN PORCENTAGEM_4 WHEN 5 THEN PORCENTAGEM_5 WHEN 6 THEN PORCENTAGEM_6 WHEN 7 THEN PORCENTAGEM_7 WHEN 8 THEN PORCENTAGEM_8 WHEN 9 THEN PORCENTAGEM_9 WHEN 10 THEN PORCENTAGEM_10 WHEN 11 THEN PORCENTAGEM_11 WHEN 12 THEN PORCENTAGEM_12 END > 0
										THEN 
											DATEADD(DAY, 
											CASE @nWhile WHEN 1 THEN PARCELA_1 WHEN 2 THEN PARCELA_2 WHEN 3 THEN PARCELA_3 WHEN 4 THEN PARCELA_4 WHEN 5 THEN PARCELA_5 WHEN 6 THEN PARCELA_6 WHEN 7 THEN PARCELA_7 WHEN 8 THEN PARCELA_8 WHEN 9 THEN PARCELA_9 WHEN 10 THEN PARCELA_10 WHEN 11 THEN PARCELA_11 WHEN 12 THEN PARCELA_12 END
											,@dData_Faturamento_Relativo)
										ELSE NULL END,
						@dVencimento_Real	=CASE WHEN CASE @nWhile WHEN 1 THEN PORCENTAGEM_1 WHEN 2 THEN PORCENTAGEM_2 WHEN 3 THEN PORCENTAGEM_3 WHEN 4 THEN PORCENTAGEM_4 WHEN 5 THEN PORCENTAGEM_5 WHEN 6 THEN PORCENTAGEM_6 WHEN 7 THEN PORCENTAGEM_7 WHEN 8 THEN PORCENTAGEM_8 WHEN 9 THEN PORCENTAGEM_9 WHEN 10 THEN PORCENTAGEM_10 WHEN 11 THEN PORCENTAGEM_11 WHEN 12 THEN PORCENTAGEM_12 END > 0
										THEN 
											(DBO.LX_DATA_REAL(NULL, 
											DATEADD(DAY, 
												CASE @nWhile WHEN 1 THEN PARCELA_1 WHEN 2 THEN PARCELA_2 WHEN 3 THEN PARCELA_3 WHEN 4 THEN PARCELA_4 WHEN 5 THEN PARCELA_5 WHEN 6 THEN PARCELA_6 WHEN 7 THEN PARCELA_7 WHEN 8 THEN PARCELA_8 WHEN 9 THEN PARCELA_9 WHEN 10 THEN PARCELA_10 WHEN 11 THEN PARCELA_11 WHEN 12 THEN PARCELA_12 END
												,@dData_Faturamento_Relativo))) 
										ELSE NULL END,
						@nValor_Data		=@nValor_Contrato*
										ISNULL(CASE @nWhile WHEN 1 THEN PORCENTAGEM_1 WHEN 2 THEN PORCENTAGEM_2 WHEN 3 THEN PORCENTAGEM_3 WHEN 4 THEN PORCENTAGEM_4 WHEN 5 THEN PORCENTAGEM_5 WHEN 6 THEN PORCENTAGEM_6 WHEN 7 THEN PORCENTAGEM_7 WHEN 8 THEN PORCENTAGEM_8 WHEN 9 THEN PORCENTAGEM_9 WHEN 10 THEN PORCENTAGEM_10 WHEN 11 THEN PORCENTAGEM_11 WHEN 12 THEN PORCENTAGEM_12 END,0)
										/100.
					FROM COND_ATAC_PGTOS
					WHERE CONDICAO_PGTO = @cCondicao_Pgto  	


					IF @nValor_Data > 0 AND @dVencimento_Real >= @Data_Inicio AND @dVencimento_Real<= @Data_Fim
					BEGIN
						INSERT #FLUXO_CAIXA (VENCIMENTO,VENCIMENTO_REAL, VALOR,ID_CONTRATO,ITEM,RECORRENCIA_ITEM)
						VALUES(@dVencimento,@dVencimento_Real,@nValor_Data,@cId_Contrato,@cItem,@nRecorrencia_Item)
					END

		
					SELECT @nWhile = @nWhile + 1
				END
			END
	
		FETCH NEXT FROM cur_contratos INTO @cId_Contrato,@cItem,@nRecorrencia_Item,@dData_Faturamento_Relativo,@nValor_Contrato,@cCondicao_Pgto
	END
	close cur_contratos
	deallocate cur_contratos

	IF isnull(@aberto,0)=0
	BEGIN
		SELECT 	case when @vencimento_real=1 then vencimento_real else vencimento END as vecimento,
			sum(valor)as valor 
		FROM #fluxo_caixa 
		group by case when @vencimento_real=1 then vencimento_real else vencimento END
	END
	else
	BEGIN
		SELECT 	A.id_contrato,
			A.item,
			case when @vencimento_real=1 then A.vencimento_real else A.vencimento END as vecimento,
			A.valor,
			CONTA_CONTABIL = ISNULL(B.CONTA_CONTABIL,C.CONTA_CONTABIL),
			C.MOEDA,
			RATEIO_CENTRO_CUSTO = ISNULL(B.RATEIO_CENTRO_CUSTO,C.RATEIO_CENTRO_CUSTO),
			RATEIO_FILIAL = ISNULL(B.RATEIO_FILIAL,C.RATEIO_FILIAL),
			C.NATUREZA_OPERACAO,
			CONDICAO_PGTO = ISNULL(B.CONDICAO_PGTO,C.CONDICAO_PGTO),
			COMISSAO_ITEM = ISNULL(B.COMISSAO_ITEM,C.COMISSAO_ITEM),
			COMISSAO_ITEM_GERENTE = ISNULL(B.COMISSAO_ITEM_GERENTE,C.COMISSAO_ITEM_GERENTE),
			C.CODIGO_ITEM,
			C.CONTRATO_TIPO,
			B.RECORRENCIA_ITEM,
			B.FILIAL,
			B.NF_SAIDA,
			B.SERIE_NF
		FROM #fluxo_caixa A
			LEFT JOIN CONTRATO_FATURAR B ON B.ID_CONTRATO=A.ID_CONTRATO AND B.ITEM=A.ITEM AND B.RECORRENCIA_ITEM=A.RECORRENCIA_ITEM
			LEFT JOIN CONTRATO_ITEM C ON C.ID_CONTRATO=A.ID_CONTRATO AND C.ITEM=A.ITEM
	END

END

set nocount off

return

ERRO:

IF (CURSOR_STATUS('global','cur_contratos'  )>-3 )
	BEGIN
		CLOSE 		cur_contratos
		DEALLOCATE 	cur_contratos
	END


WHILE @@TRANCOUNT > 0
	ROLLBACK TRANSACTION