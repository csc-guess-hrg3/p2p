import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Criptografia simétrica para segredos persistidos no banco (ex.: smtpPassword).
 *
 * Formato do payload (armazenado como string):
 *   "enc:v1:<iv-hex>:<tag-hex>:<ciphertext-hex>"
 *
 * - Algoritmo: AES-256-GCM (autenticado).
 * - Chave: SECRET_ENCRYPTION_KEY (env). Derivada por SHA-256 para garantir 32 bytes.
 * - Compatibilidade: se um valor não vier com o prefixo "enc:v1:", consideramos
 *   PLAIN-TEXT legado e devolvemos como veio (permite migração suave).
 * - encrypt() de string vazia/nula é no-op (preserva null).
 *
 * Importante: rotação de chave exige re-encrypt em massa — tratar em job dedicado.
 */
@Injectable()
export class SecretService {
  private readonly logger = new Logger(SecretService.name);
  private readonly key: Buffer;
  private static readonly PREFIX = 'enc:v1:';
  private static readonly ALGO = 'aes-256-gcm';

  constructor(config: ConfigService) {
    const raw = config.get<string>('SECRET_ENCRYPTION_KEY');
    if (!raw || raw.length < 16) {
      this.logger.warn(
        'SECRET_ENCRYPTION_KEY ausente ou curta — secrets serão armazenados em ' +
          'texto plano (modo legado). Configure uma chave de pelo menos 32 chars ' +
          'em produção.',
      );
      // Chave fixa de fallback: NÃO criptografa de fato (modo passthrough).
      this.key = Buffer.alloc(0);
    } else {
      this.key = createHash('sha256').update(raw).digest();
    }
  }

  /** Está em modo realmente criptografado? */
  private get enabled(): boolean {
    return this.key.length === 32;
  }

  /** Criptografa um segredo. null/undefined/'' retornam como vieram. */
  encrypt(plain: string | null | undefined): string | null {
    if (plain == null || plain === '') return plain ?? null;
    if (!this.enabled) return plain; // modo passthrough
    if (plain.startsWith(SecretService.PREFIX)) return plain; // já criptografado

    const iv = randomBytes(12);
    const cipher = createCipheriv(SecretService.ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${SecretService.PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
  }

  /** Descriptografa um segredo. Se vier "plain" legado, devolve como veio. */
  decrypt(stored: string | null | undefined): string | null {
    if (stored == null || stored === '') return stored ?? null;
    if (!stored.startsWith(SecretService.PREFIX)) return stored; // legado

    const parts = stored.slice(SecretService.PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException('Payload de segredo malformado.');
    }
    if (!this.enabled) {
      throw new InternalServerErrorException(
        'SECRET_ENCRYPTION_KEY não configurada — não é possível descriptografar.',
      );
    }
    const [ivHex, tagHex, dataHex] = parts;
    try {
      const decipher = createDecipheriv(
        SecretService.ALGO,
        this.key,
        Buffer.from(ivHex, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      const dec = Buffer.concat([
        decipher.update(Buffer.from(dataHex, 'hex')),
        decipher.final(),
      ]);
      return dec.toString('utf8');
    } catch (err) {
      this.logger.error(
        `Falha ao descriptografar segredo: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Falha ao descriptografar segredo (chave incorreta ou payload corrompido).',
      );
    }
  }
}
