import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

/**
 * Filtro global que traduz exceções pra um payload uniforme com mensagem
 * legível pro usuário final.
 *
 * Antes:
 *   - Erro do Linx vazava cru: `Conversion failed when converting the
 *     varchar value '%   ' to data type int.` → o usuário só via "erro
 *     interno" no toast.
 *   - Erro do Prisma vazava cru: `Invalid `prisma.foo.findUnique()`
 *     invocation: ...`.
 *   - 500 genérico sem `message` legível.
 *
 * Depois:
 *   - Erros mapeados pra mensagens em PT-BR específicas do contexto.
 *   - Stack/Detalhe técnico sempre vai pro Logger (não pro response).
 *   - Response sempre tem `{ statusCode, message, code?, action? }`.
 *
 * Mapeamentos cobertos:
 *   - HttpException (BadRequest/Forbidden/NotFound/etc.) → passa direto
 *   - PrismaClientKnownRequestError → traduz códigos P2002/P2003/P2025/etc.
 *   - PrismaClientValidationError → "Requisição mal formada"
 *   - mssql/EREQUEST com "trigger" ou "Conversion failed" → mensagem do Linx
 *   - Erros desconhecidos → 500 genérico (loga stack)
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ url?: string; method?: string }>();
    const route = `${req.method ?? '?'} ${req.url ?? '?'}`;

    const translated = this.translate(exception);

    // Loga o original em level apropriado pra debug. Erros 5xx sempre
    // viram WARN/ERROR com stack; 4xx só DEBUG (são esperados — validação,
    // permissão, etc.).
    if (translated.statusCode >= 500) {
      this.logger.error(
        `${route} → ${translated.statusCode} ${translated.code ?? '???'}: ${translated.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.debug(`${route} → ${translated.statusCode}: ${translated.message}`);
    }

    res.status(translated.statusCode).json({
      statusCode: translated.statusCode,
      message: translated.message,
      ...(translated.code ? { code: translated.code } : {}),
      ...(translated.action ? { action: translated.action } : {}),
    });
  }

  private translate(exception: unknown): {
    statusCode: number;
    message: string;
    code?: string;
    action?: string;
  } {
    // 1) HttpException explícita do controller/service — passa direto,
    //    só normaliza o formato do `message` (NestJS aninha como string ou
    //    objeto dependendo de como foi lançado).
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const status = exception.getStatus();
      if (typeof response === 'string') {
        return { statusCode: status, message: response };
      }
      const obj = response as {
        message?: string | string[];
        error?: string;
        code?: string;
        action?: string;
      };
      const message = Array.isArray(obj.message)
        ? obj.message.join(' · ')
        : (obj.message ?? obj.error ?? 'Erro.');
      return {
        statusCode: status,
        message,
        code: obj.code,
        action: obj.action,
      };
    }

    // 2) Prisma — códigos conhecidos com mensagem útil.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.translatePrisma(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'Os dados enviados não passaram na validação do banco. Confira os campos preenchidos.',
        code: 'PRISMA_VALIDATION',
      };
    }

    // 3) Erros do MSSQL (cross-DB pro Linx). O driver `mssql` propaga
    //    `originalCode` e `originalMessage`. Pegamos pelos textos típicos.
    const raw = exception instanceof Error ? exception.message : String(exception);
    const linx = this.translateLinx(raw);
    if (linx) return linx;

    // 4) Fallback — não conhece. Loga e devolve 500 genérico.
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        'Erro inesperado no servidor. Tente novamente em alguns instantes. Se persistir, acione o suporte.',
      code: 'UNEXPECTED',
    };
  }

  /**
   * Mapeamento dos códigos do Prisma:
   *   P2002 unique violation (já existe um registro com esse valor)
   *   P2003 FK violation
   *   P2025 record not found pra update/delete
   *   P2022 coluna não existe (schema desatualizado)
   *   P2010 raw query failure
   * https://www.prisma.io/docs/reference/api-reference/error-reference
   */
  private translatePrisma(err: Prisma.PrismaClientKnownRequestError): {
    statusCode: number;
    message: string;
    code: string;
  } {
    const meta = err.meta as Record<string, unknown> | undefined;
    switch (err.code) {
      case 'P2002': {
        const target = Array.isArray(meta?.target)
          ? (meta?.target as string[]).join(', ')
          : String(meta?.target ?? 'campo único');
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Já existe um registro com este valor em "${target}".`,
          code: 'UNIQUE_VIOLATION',
        };
      }
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Há referência a um registro que não existe — verifique se os campos relacionados estão preenchidos corretamente.',
          code: 'FK_VIOLATION',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Registro não encontrado.',
          code: 'NOT_FOUND',
        };
      case 'P2022':
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message:
            'O banco está com schema desatualizado em relação ao código. Acione o suporte para rodar as migrations pendentes.',
          code: 'SCHEMA_DRIFT',
        };
      case 'P2010': {
        // Raw query — extrai mensagem do Linx se houver.
        const driver = (meta?.driverAdapterError as { cause?: unknown })?.cause;
        const inner =
          driver instanceof Error ? driver.message : String(driver ?? '');
        const linx = this.translateLinx(inner || (meta?.originalMessage as string) || err.message);
        if (linx) return { ...linx, code: linx.code ?? 'LINX_QUERY' };
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message:
            'Falha ao consultar o banco do ERP. O time técnico foi avisado.',
          code: 'RAW_QUERY_FAILED',
        };
      }
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: `Erro no banco (${err.code}). Acione o suporte.`,
          code: `PRISMA_${err.code}`,
        };
    }
  }

  /**
   * Tradução de erros do Linx — padrões observados em PROD/HML.
   * Retorna null se não conseguir identificar (cai pro fallback genérico).
   */
  private translateLinx(raw: string): {
    statusCode: number;
    message: string;
    code: string;
    action?: string;
  } | null {
    // Triggers que dão rollback explícito.
    if (raw.includes('transaction ended in the trigger') ||
        raw.includes('batch has been aborted')) {
      // Tenta achar a tabela mencionada em "porque #TABELA".
      const m = raw.match(
        /porque\s*#?(FORNECEDORES|FILIAIS|MOEDAS|COND_ENT_PGTOS|COND_ATAC_PGTOS|TRANSPORTADORAS|PRODUCAO_PROGRAMA|COMPRAS_TIPOS|COMPRAS_STATUS|CTB_CENTRO_CUSTO_RATEIO|CTB_FILIAL_RATEIO|SS_ITEM_FISCAL_FORNECEDOR|CTB_LANC_PADRAO)\b/i,
      );
      const friendly: Record<string, string> = {
        FORNECEDORES: 'Fornecedor não cadastrado no Linx.',
        FILIAIS: 'Filial não cadastrada no Linx.',
        MOEDAS: 'Moeda não cadastrada no Linx.',
        COND_ENT_PGTOS: 'Condição de pagamento não cadastrada no Linx.',
        COND_ATAC_PGTOS: 'Condição de pagamento não cadastrada no Linx.',
        TRANSPORTADORAS:
          'Transportadora não cadastrada no Linx — verifique a escolha no diálogo ou a padrão em Administração → Integração ERP.',
        PRODUCAO_PROGRAMA: 'Programa de produção não encontrado.',
        COMPRAS_TIPOS: 'Tipo de compra não cadastrado no Linx.',
        COMPRAS_STATUS: 'Status de compra inválido.',
        CTB_CENTRO_CUSTO_RATEIO: 'Rateio de centro de custo inválido.',
        CTB_FILIAL_RATEIO: 'Rateio de filial inválido.',
        SS_ITEM_FISCAL_FORNECEDOR:
          'Item não está vinculado a este fornecedor no Linx. O time fiscal precisa aprovar o vínculo antes.',
        CTB_LANC_PADRAO:
          'Não há lançamento padrão configurado para esta natureza de operação no Linx.',
      };
      if (m) {
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            friendly[m[1].toUpperCase()] ??
            `Linx rejeitou: validação contra a tabela ${m[1]}.`,
          code: `LINX_FK_${m[1].toUpperCase()}`,
        };
      }
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'O Linx rejeitou a operação (uma trigger interna abortou). Verifique os dados ou acione o suporte com o número do PC/SV/REQ envolvido.',
        code: 'LINX_TRIGGER_ABORT',
      };
    }

    // Conversion failed → tipicamente número com whitespace ou char inválido.
    if (raw.includes('Conversion failed') || raw.includes('Invalid column name')) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          'O Linx recebeu um valor em formato incompatível. Acione o suporte — o time técnico precisa olhar o payload enviado.',
        code: 'LINX_FORMAT',
      };
    }

    // Timeout (mssql RequestError).
    if (raw.includes('Timeout') || raw.includes('ETIMEOUT')) {
      return {
        statusCode: HttpStatus.GATEWAY_TIMEOUT,
        message:
          'A consulta ao Linx demorou demais e foi interrompida. Tente novamente em alguns instantes.',
        code: 'LINX_TIMEOUT',
      };
    }

    // Login/permissão no Linx (deveria ser raro — credencial inválida).
    if (raw.includes('Login failed') || raw.includes('permission was denied')) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message:
          'Não foi possível autenticar no Linx. O time técnico precisa verificar as credenciais de integração.',
        code: 'LINX_AUTH',
      };
    }

    return null;
  }
}
