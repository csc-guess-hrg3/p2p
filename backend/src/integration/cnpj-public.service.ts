import { Injectable, Logger } from '@nestjs/common';

/**
 * Resultado da consulta pública de CNPJ. Estrutura achatada e estável —
 * não expomos diretamente o shape do BrasilAPI pro frontend.
 */
export interface PublicCnpjLookup {
  found: true;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  email: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  cnaePrincipal: string | null;
  dataAbertura: string | null;
}

export interface PublicCnpjMiss {
  found: false;
  reason: string;
}

/**
 * Consulta dados públicos de CNPJ via BrasilAPI (https://brasilapi.com.br).
 *
 * - Sem autenticação, sem rate limit estrito por IP
 * - Dados oficiais da Receita Federal (público)
 * - Em caso de erro/timeout devolve `{ found: false, reason }` — a UI
 *   cai no fluxo manual (solicitante digita o nome)
 *
 * Cache em memória de 1 hora — o solicitante costuma editar o CNPJ
 * várias vezes ao digitar e não queremos martelar a API externa.
 */
@Injectable()
export class CnpjPublicService {
  private readonly logger = new Logger(CnpjPublicService.name);
  private readonly cache = new Map<
    string,
    { at: number; value: PublicCnpjLookup | null }
  >();
  private readonly TTL_MS = 60 * 60 * 1000;

  async lookup(rawCnpj: string): Promise<PublicCnpjLookup | PublicCnpjMiss> {
    const cnpj = (rawCnpj ?? '').replace(/\D/g, '');
    if (cnpj.length !== 14) {
      return { found: false, reason: 'CNPJ deve ter 14 dígitos.' };
    }

    const cached = this.cache.get(cnpj);
    if (cached && Date.now() - cached.at < this.TTL_MS) {
      return cached.value ?? { found: false, reason: 'Não encontrado.' };
    }

    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: {
          // BrasilAPI rejeita (403) requests sem User-Agent — o fetch
          // do Node não manda UA por padrão. Identificamos a app
          // claramente pra evitar bloqueio anti-bot e pra ficar fácil
          // de rastrear nos logs deles se algo der errado.
          'User-Agent': 'P2P-HRG3/1.0 (procurement; backend integration)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 404) {
        this.cache.set(cnpj, { at: Date.now(), value: null });
        return {
          found: false,
          reason: 'CNPJ não encontrado na Receita Federal.',
        };
      }
      if (!res.ok) {
        this.logger.warn(`BrasilAPI retornou ${res.status} para CNPJ ${cnpj}`);
        // Não cacheamos erros transientes — só 404 (CNPJ inexistente)
        // vira cache negativo. 403/500/etc. são tentados de novo na
        // próxima chamada.
        return {
          found: false,
          reason: `Serviço externo indisponível (HTTP ${res.status}).`,
        };
      }
      const data = (await res.json()) as Record<string, unknown>;
      const normalized: PublicCnpjLookup = {
        found: true,
        cnpj,
        razaoSocial: String((data.razao_social as string | null) ?? '').trim(),
        nomeFantasia: (data.nome_fantasia as string | null) || null,
        situacao: (data.descricao_situacao_cadastral as string | null) || null,
        email: (data.email as string | null) || null,
        telefone:
          [data.ddd_telefone_1, data.ddd_telefone_2]
            .filter(Boolean)
            .join(' / ') || null,
        logradouro: (data.logradouro as string | null) || null,
        numero: data.numero ? String(data.numero as string) : null,
        complemento: (data.complemento as string | null) || null,
        bairro: (data.bairro as string | null) || null,
        cidade: (data.municipio as string | null) || null,
        uf: (data.uf as string | null) || null,
        cep: data.cep ? String(data.cep as string) : null,
        cnaePrincipal: (data.cnae_fiscal_descricao as string | null) || null,
        dataAbertura: (data.data_inicio_atividade as string | null) || null,
      };
      this.cache.set(cnpj, { at: Date.now(), value: normalized });
      return normalized;
    } catch (err) {
      this.logger.warn(
        `Falha na consulta BrasilAPI para CNPJ ${cnpj}: ${String(err)}`,
      );
      return {
        found: false,
        reason: 'Serviço externo indisponível.',
      };
    }
  }
}
