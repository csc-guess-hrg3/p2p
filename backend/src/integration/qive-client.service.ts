import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente HTTP da Qive (ex-Arquivei) — wrapper das chamadas REST que
 * precisamos no fluxo P2P. Doc oficial: docs/qive-integration.md.
 *
 * Headers obrigatórios em TODA requisição:
 *   - x-api-id
 *   - x-api-key
 *
 * Ambientes:
 *   - PROD:    https://api.arquivei.com.br
 *   - Sandbox: https://sandbox-api.arquivei.com.br
 *
 * Paginação:
 *   - `cursor` numérico (`0` = início) com `limit` máx 50.
 *   - Resposta retorna `page.next` com a URL completa do próximo cursor.
 *
 * Rate limit oficial não é publicado; aplicamos uma proteção conservadora
 * (sleep de 200ms entre páginas no service que consome este cliente).
 */
@Injectable()
export class QiveClientService {
  private readonly logger = new Logger(QiveClientService.name);

  private get baseUrl(): string {
    // Sandbox quando QIVE_SANDBOX=true (CI/dev). Default = PROD.
    return process.env.QIVE_SANDBOX === 'true'
      ? 'https://sandbox-api.arquivei.com.br'
      : 'https://api.arquivei.com.br';
  }

  private headers(): HeadersInit {
    const apiId = process.env.QIVE_API_ID;
    const apiKey = process.env.QIVE_API_KEY;
    if (!apiId || !apiKey) {
      throw new Error(
        'QIVE_API_ID / QIVE_API_KEY não estão definidos em .env.',
      );
    }
    return {
      'x-api-id': apiId,
      'x-api-key': apiKey,
      Accept: 'application/json',
    };
  }

  /** Lista CNPJs cadastrados na conta Qive autenticada. */
  async listCompanies(): Promise<string[]> {
    const url = `${this.baseUrl}/v1/company`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Qive listCompanies HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as QiveListCompaniesResponse;
    return json.data ?? [];
  }

  /**
   * Lista NFes da role escolhida — "received" pra NFs que CHEGARAM pros
   * CNPJs da conta (compra recebida do fornecedor). Outras roles:
   * "emitted" (a empresa emitiu), "transporter", "authorized".
   *
   * Cada item carrega:
   *  - access_key: 44 chars (chave SEFAZ)
   *  - xml: NFe completa em base64
   *
   * Pra paginar, vai chamando com o cursor devolvido em page.next até
   * a resposta vir vazia.
   */
  async listNfes(opts: {
    role?: 'received' | 'emitted' | 'transporter' | 'authorized';
    cursor?: number;
    limit?: number;
    cnpj?: string[];
  } = {}): Promise<QiveListNfesResponse> {
    const role = opts.role ?? 'received';
    const params = new URLSearchParams();
    params.set('limit', String(Math.min(opts.limit ?? 50, 50)));
    if (opts.cursor != null) params.set('cursor', String(opts.cursor));
    if (opts.cnpj) opts.cnpj.forEach((c) => params.append('cnpj[]', c));
    const url = `${this.baseUrl}/v1/nfe/${role}?${params.toString()}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Qive listNfes(${role}, cursor=${opts.cursor}) HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as QiveListNfesResponse;
  }

  /**
   * Lista NFes via `POST /v2/dfe/nfe` (endpoint atual da Qive).
   * Diferenças vs `listNfes` (v1):
   *  - Paginação por `Paginator` (string opaca) em vez de cursor numérico.
   *  - Suporta filtros mais ricos (CreatedAt range, AccessKey list).
   *  - Retorna `Total` global (útil pra progresso).
   *  - Vê *todas* as NFes da conta (a v1 só listava as do walk linear
   *    do cursor — em contas grandes a v1 ficava paradoxalmente lenta).
   *
   * Retorna `{ data, paginator, total }`. Quando `paginator` é null,
   * o walk terminou.
   */
  async listNfesV2(opts: {
    paginator?: string | null;
    limit?: number;
    createdAtFrom?: string; // formato YYYY-MM-DD aceito
    createdAtTo?: string;
    accessKeys?: string[];
    /** CNPJs do "owner" — filtra só NFes destinadas a esses CNPJs. */
    cnpjs?: string[];
  } = {}): Promise<{
    data: QiveNfeListItem[];
    paginator: string | null;
    total: number;
  }> {
    const body: Record<string, unknown> = {
      Pagination: {
        Limit: Math.min(opts.limit ?? 50, 50),
        ...(opts.paginator ? { Paginator: opts.paginator } : {}),
      },
    };
    const filters: Record<string, unknown> = {};
    if (opts.createdAtFrom || opts.createdAtTo) {
      filters.CreatedAt = {
        From: opts.createdAtFrom ?? '2010-01-01',
        To: opts.createdAtTo ?? '2099-12-31',
      };
    }
    if (opts.accessKeys?.length) {
      filters.AccessKey = opts.accessKeys.map((k) => k.replace(/\D/g, ''));
    }
    if (opts.cnpjs?.length) {
      // O nome do campo na v2 da Qive é "Cnpj" (lista de CNPJs do owner).
      filters.Cnpj = opts.cnpjs.map((c) => c.replace(/\D/g, ''));
    }
    if (Object.keys(filters).length > 0) body.Filters = filters;

    const url = `${this.baseUrl}/v2/dfe/nfe`;

    // A v2 devolve até 500 NFs por página (ignorando Limit menor) com
    // ~9MB de payload — em rede ruim o response chega truncado e o
    // JSON.parse explode no meio. Faz retry no fetch+parse.
    const MAX_TRIES = 3;
    let json: {
      Nfes?: Array<{ AccessKey: string; Xml: string }>;
      Paginator?: string | null;
      Total?: number;
    } | null = null;
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            ...this.headers(),
            'content-type': 'application/json',
            'x-use-apigateway': 'always',
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(
            `HTTP ${res.status}: ${txt.slice(0, 300)}`,
          );
        }
        // Lê o body como texto antes de parsear pra capturar truncamento.
        const raw = await res.text();
        json = JSON.parse(raw);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err as Error;
        this.logger.warn(
          `Qive listNfesV2 attempt ${attempt}/${MAX_TRIES} falhou: ${lastErr.message}`,
        );
        if (attempt < MAX_TRIES) {
          // Backoff progressivo: 1s, 3s.
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
    }
    if (!json) {
      throw new Error(
        `Qive listNfesV2 falhou após ${MAX_TRIES} tentativas: ${lastErr?.message}`,
      );
    }
    return {
      data: (json.Nfes ?? []).map((n) => ({
        access_key: n.AccessKey,
        xml: n.Xml,
      })),
      paginator: json.Paginator ?? null,
      total: Number(json.Total ?? 0),
    };
  }

  /**
   * Busca UMA NFe específica pela chave de acesso (44 chars).
   * A Qive aceita `access_key[]=` como filtro em /v1/nfe/{role} —
   * usamos isso pra puxar a NF sob demanda quando aparece num pedido
   * legado (sem precisar esperar o cron walk-through completo).
   *
   * Retorna `null` se a chave não estiver no acervo da Qive.
   */
  async findNfeByAccessKey(
    accessKey: string,
    role: 'received' | 'emitted' | 'transporter' | 'authorized' = 'received',
  ): Promise<QiveNfeListItem | null> {
    const k = accessKey.replace(/\D/g, '');
    if (k.length !== 44) {
      throw new Error('Chave NFe inválida (44 dígitos)');
    }
    const params = new URLSearchParams();
    params.append('access_key[]', k);
    params.set('limit', '1');
    const url = `${this.baseUrl}/v1/nfe/${role}?${params.toString()}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Qive findNfeByAccessKey(${k}) HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as QiveListNfesResponse;
    const item = (json.data ?? [])[0];
    return item ?? null;
  }

  /**
   * Busca DANFe (PDF) em base64 — mostra/baixa pelo P2P.
   * Endpoint: GET /v1/nfe/danfe?access_key=<chave>
   */
  async getDanfeBase64(accessKey: string): Promise<string> {
    const url = `${this.baseUrl}/v1/nfe/danfe?access_key=${accessKey}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `Qive getDanfe(${accessKey}) HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as { data?: { pdf?: string } };
    const pdf = json.data?.pdf;
    if (!pdf) {
      throw new Error(`Qive getDanfe: resposta sem PDF (chave ${accessKey})`);
    }
    return pdf;
  }
}

interface QiveListCompaniesResponse {
  status: { code: number; message: string };
  data: string[];
}

export interface QiveNfeListItem {
  access_key: string;
  xml: string; // base64
}

export interface QiveListNfesResponse {
  status: { code: number; message: string };
  data: QiveNfeListItem[];
  page?: {
    next?: string;
    previous?: string;
  };
}
