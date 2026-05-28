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
