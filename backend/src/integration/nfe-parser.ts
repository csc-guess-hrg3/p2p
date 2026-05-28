/**
 * Parser leve de NFe XML (versão 4.00) — extrai só os campos que o P2P
 * precisa pra listar/vincular. Usa regex em vez de DOM parser de
 * verdade pra não adicionar dependência (~10KB de XML por NF, regex
 * roda em microssegundos).
 *
 * Se a estrutura da NFe mudar (SEFAZ libera versões novas), o pior
 * que acontece é alguns campos virem null — o XML cru fica salvo
 * em rawXmlBase64 e a gente pode reparsear quando quiser.
 *
 * NÃO usa namespaces — o regex casa por tag name, ignorando prefixos.
 * Funciona pra NFe 4.00 que é o que a SEFAZ usa em 2024.
 */

export interface ParsedNfe {
  /** Chave de acesso (extraída do atributo Id="NFe<chave>"). */
  accessKey: string;
  numero: string;
  serie: string | null;
  natOp: string | null;
  emissao: Date | null;
  /** Total da NF (vNF). */
  valorTotal: number;
  emit: {
    cnpj: string;
    nome: string;
  };
  dest: {
    cnpj: string;
    nome: string | null;
  };
  items: ParsedNfeItem[];
}

export interface ParsedNfeItem {
  /** nItem (sequencial). */
  num: number;
  /** Código do produto no FORNECEDOR. */
  cProd: string;
  xProd: string;
  ncm: string | null;
  cfop: string | null;
  qCom: number;
  uCom: string | null;
  vUnCom: number;
  vProd: number;
}

/** Extrai o conteúdo de UMA tag (primeira ocorrência). */
function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Extrai TODOS os blocos de uma tag (retorna array). */
function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** Atributo de uma tag (ex.: <det nItem="1">). */
function attr(xml: string, tagName: string, attrName: string): string | null {
  const re = new RegExp(`<${tagName}\\s+[^>]*${attrName}="([^"]+)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}

function num(s: string | null): number {
  if (!s) return 0;
  return Number(s.replace(',', '.'));
}

/**
 * Parse de NFe completa.
 * Retorna null se não conseguir identificar a estrutura mínima (chave,
 * emit, dest, vNF).
 */
export function parseNfeXml(xml: string): ParsedNfe | null {
  // infNFe Id="NFe<chave>" — chave de acesso (44 chars).
  const idAttr = attr(xml, 'infNFe', 'Id');
  if (!idAttr) return null;
  const accessKey = idAttr.replace(/^NFe/, '');
  if (accessKey.length !== 44) return null;

  // <ide> — identificação
  const ideBlock = tag(xml, 'ide') ?? '';
  const numero = tag(ideBlock, 'nNF') ?? '';
  const serie = tag(ideBlock, 'serie');
  const natOp = tag(ideBlock, 'natOp');
  const dhEmi = tag(ideBlock, 'dhEmi');
  const emissao = dhEmi ? new Date(dhEmi) : null;

  // <emit> — fornecedor (CNPJ)
  const emitBlock = tag(xml, 'emit') ?? '';
  const emitCnpj = (tag(emitBlock, 'CNPJ') ?? tag(emitBlock, 'CPF') ?? '')
    .replace(/\D/g, '');
  const emitNome = tag(emitBlock, 'xNome') ?? '';
  if (!emitCnpj) return null;

  // <dest> — destinatário (a nossa filial)
  const destBlock = tag(xml, 'dest') ?? '';
  const destCnpj = (tag(destBlock, 'CNPJ') ?? tag(destBlock, 'CPF') ?? '')
    .replace(/\D/g, '');
  const destNome = tag(destBlock, 'xNome');

  // <total>/<ICMSTot>/<vNF> — valor total da NF
  const totalBlock = tag(xml, 'total') ?? '';
  const icmsTotBlock = tag(totalBlock, 'ICMSTot') ?? '';
  const valorTotal = num(tag(icmsTotBlock, 'vNF'));

  // <det> — itens (vários)
  const detBlocks = tags(xml, 'det');
  const items: ParsedNfeItem[] = detBlocks.map((block, idx) => {
    const prodBlock = tag(block, 'prod') ?? '';
    const nItem = attr(block, 'det', 'nItem');
    return {
      num: nItem ? Number(nItem) : idx + 1,
      cProd: tag(prodBlock, 'cProd') ?? '',
      xProd: tag(prodBlock, 'xProd') ?? '',
      ncm: tag(prodBlock, 'NCM'),
      cfop: tag(prodBlock, 'CFOP'),
      qCom: num(tag(prodBlock, 'qCom')),
      uCom: tag(prodBlock, 'uCom'),
      vUnCom: num(tag(prodBlock, 'vUnCom')),
      vProd: num(tag(prodBlock, 'vProd')),
    };
  });

  return {
    accessKey,
    numero,
    serie,
    natOp,
    emissao,
    valorTotal,
    emit: { cnpj: emitCnpj, nome: emitNome },
    dest: { cnpj: destCnpj, nome: destNome },
    items,
  };
}

/** Conveniência: decodifica base64 e parseia. Retorna null em qualquer falha. */
export function parseNfeBase64(base64: string): ParsedNfe | null {
  try {
    const xml = Buffer.from(base64, 'base64').toString('utf8');
    return parseNfeXml(xml);
  } catch {
    return null;
  }
}
