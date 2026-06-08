import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { AccountLockoutService } from './account-lockout.service';
import { UserStatus } from '../common/enums';

const TOKEN_LIFETIME_HOURS = 24;
const BCRYPT_ROUNDS = 10;

// Allowlist de domínios de e-mail corporativo para usuários LOCAL.
// Bloqueia o Admin de cadastrar com gmail/hotmail por engano.
const ALLOWED_EMAIL_DOMAINS = [
  'hrg3.com.br',
  'guessbrasil.com.br',
  'guess-br.com.br',
];

/**
 * Política de complexidade da senha local:
 *   ≥ 8 caracteres + 1 maiúscula + 1 minúscula + 1 número + 1 especial
 * (PRD RN-USR-04 — alinhada à Política de TI HRG3).
 */
export const PASSWORD_POLICY = {
  minLength: 8,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSpecial: true,
  description:
    'Mínimo 8 caracteres, incluindo 1 maiúscula, 1 minúscula, 1 número e 1 especial.',
};

function validatePassword(password: string): void {
  if (password.length < PASSWORD_POLICY.minLength) {
    throw new BadRequestException(
      `A senha deve ter pelo menos ${PASSWORD_POLICY.minLength} caracteres.`,
    );
  }
  if (PASSWORD_POLICY.requireUpper && !/[A-Z]/.test(password))
    throw new BadRequestException('A senha precisa de 1 letra maiúscula.');
  if (PASSWORD_POLICY.requireLower && !/[a-z]/.test(password))
    throw new BadRequestException('A senha precisa de 1 letra minúscula.');
  if (PASSWORD_POLICY.requireDigit && !/\d/.test(password))
    throw new BadRequestException('A senha precisa de 1 número.');
  if (PASSWORD_POLICY.requireSpecial && !/[^A-Za-z0-9]/.test(password))
    throw new BadRequestException('A senha precisa de 1 caractere especial.');
}

function normalizeCpf(raw: string): string {
  return raw.replace(/\D/g, '');
}

function isValidEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

@Injectable()
export class LocalAuthService {
  private readonly logger = new Logger(LocalAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly lockout: AccountLockoutService,
  ) {}

  /**
   * Login LOCAL (supervisor e demais usuários cadastrados pelo Admin):
   *   `username + password`.
   * Para vendedores de loja, ver `StoreAuthService.login` — fluxo
   * separado porque resolve o User a partir do CPF + LOJA_VENDEDORES.
   */
  async login(username: string, password: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { username: username.trim() },
    });
    // Mensagens genéricas em todos os 401 — sem revelar se foi user/senha/status.
    // Evita enumeração de usernames válidos.
    if (!user || user.deletedAt || user.loginType !== 'LOCAL') {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    // Bloqueio temporário em vigor? Rejeita antes mesmo de checar a senha
    // (e antes de incrementar tentativa — não acumula durante o lockout).
    await this.lockout.assertNotLocked(user.id);
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Senha ainda não definida. Use o link recebido por e-mail.',
      );
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.lockout.recordFailure(user.id);
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Usuário inativo.');
    }
    await this.lockout.clearOnSuccess(user.id);
    return user.id;
  }

  /**
   * Cria um token único para o usuário definir/redefinir a senha. O token
   * bruto é retornado uma única vez (compõe a URL do e-mail); só o hash
   * sha256 vai pro banco. Tokens anteriores não-usados do mesmo propósito
   * são invalidados (marcamos usedAt no momento da criação do novo).
   */
  async issuePasswordToken(
    userId: string,
    purpose: 'SETUP' | 'RESET',
  ): Promise<string> {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_HOURS * 3600 * 1000);

    await this.prisma.$transaction([
      // Invalida tokens anteriores do mesmo propósito (best-effort).
      this.prisma.passwordSetupToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordSetupToken.create({
        data: { userId, tokenHash, purpose, expiresAt },
      }),
    ]);
    return rawToken;
  }

  /**
   * Define/redefine a senha a partir de um token válido. Marca o token
   * como usado. Devolve o userId pra quem chamar emitir tokens.
   */
  async setPassword(rawToken: string, newPassword: string): Promise<string> {
    validatePassword(newPassword);
    const tokenHash = sha256(rawToken);
    const tk = await this.prisma.passwordSetupToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!tk) throw new NotFoundException('Link inválido ou já utilizado.');
    if (tk.usedAt) throw new BadRequestException('Link já foi utilizado.');
    if (tk.expiresAt < new Date())
      throw new BadRequestException('Link expirado — solicite um novo ao Admin.');
    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: tk.userId },
        data: {
          passwordHash: hash,
          passwordSetAt: now,
          status: UserStatus.ACTIVE,
        },
      }),
      this.prisma.passwordSetupToken.update({
        where: { id: tk.id },
        data: { usedAt: now },
      }),
    ]);
    this.logger.log(`Senha definida para user ${tk.userId} (${tk.purpose}).`);
    return tk.userId;
  }

  /**
   * Cria um supervisor (ou outro usuário LOCAL) — Admin chama isso pelo
   * /admin/usuarios. Envia o e-mail de "Defina sua senha" automaticamente.
   * Domínio do e-mail é validado contra a allowlist.
   */
  async createLocalUser(input: {
    name: string;
    email: string;
    username: string;
    profile: string;
    positionId?: string | null;
    companyIds: string[];
  }): Promise<{ id: string }> {
    const email = input.email.trim().toLowerCase();
    const username = input.username.trim().toLowerCase();
    if (!isValidEmailDomain(email)) {
      throw new BadRequestException(
        `Domínio de e-mail não permitido. Aceitos: ${ALLOWED_EMAIL_DOMAINS.join(
          ', ',
        )}.`,
      );
    }
    if (!/^[a-z0-9._-]{3,60}$/i.test(username)) {
      throw new BadRequestException(
        'Username inválido. Use 3 a 60 caracteres alfanuméricos, ponto, hífen ou underscore.',
      );
    }
    const conflicts = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
      select: { email: true, username: true },
    });
    if (conflicts) {
      if (conflicts.email === email) {
        throw new BadRequestException('Já existe um usuário com este e-mail.');
      }
      throw new BadRequestException('Já existe um usuário com este username.');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        name: input.name.trim(),
        profile: input.profile,
        loginType: 'LOCAL',
        status: UserStatus.PENDING_SETUP,
        positionId: input.positionId ?? null,
        companies: {
          create: input.companyIds.map((companyId) => ({ companyId })),
        },
      },
    });
    const token = await this.issuePasswordToken(user.id, 'SETUP');
    await this.sendSetupEmail(user.email, user.name, token);
    return { id: user.id };
  }

  /** Reenvia o link de definição/recuperação de senha. */
  async resendSetupLink(userId: string, purpose: 'SETUP' | 'RESET') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.loginType !== 'LOCAL') {
      throw new NotFoundException('Usuário local não encontrado.');
    }
    const token = await this.issuePasswordToken(userId, purpose);
    await this.sendSetupEmail(user.email, user.name, token, purpose);
    return { ok: true };
  }

  /** Envia o e-mail com o link de definição de senha. */
  private async sendSetupEmail(
    to: string,
    name: string,
    rawToken: string,
    purpose: 'SETUP' | 'RESET' = 'SETUP',
  ): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 0);
    const from = this.config.get<string>('SMTP_FROM');
    if (!host || !port || !from) {
      // NUNCA logar o rawToken: ele é uma credencial de uso único que
      // permite definir a senha da conta (account takeover). Sem SMTP o
      // link não é entregue — registramos só o destinatário/propósito e o
      // admin precisa configurar o SMTP (ou reenviar via /auth/resend
      // depois de configurado). Audit M10.
      this.logger.warn(
        `SMTP não configurado — link de ${purpose} NÃO foi entregue para ${to}. ` +
          `Configure SMTP_HOST/SMTP_PORT/SMTP_FROM e reenvie o link.`,
      );
      return;
    }
    const fromName = this.config.get<string>('SMTP_FROM_NAME') ?? 'P2P';
    const baseUrl =
      this.config.get<string>('PUBLIC_URL') ?? 'https://p2p.hrg3.com.br';
    const link = `${baseUrl}/definir-senha?token=${rawToken}`;
    const subject =
      purpose === 'SETUP'
        ? 'P2P: defina sua senha'
        : 'P2P: redefina sua senha';
    const body =
      purpose === 'SETUP'
        ? `Olá ${name},\n\nVocê foi cadastrado no sistema P2P da HRG3. Para definir sua senha, clique no link abaixo (válido por ${TOKEN_LIFETIME_HOURS} horas):\n\n${link}\n\nSe não foi você quem solicitou, ignore esta mensagem.`
        : `Olá ${name},\n\nRecebemos uma solicitação para redefinir sua senha. Use o link abaixo (válido por ${TOKEN_LIFETIME_HOURS} horas):\n\n${link}\n\nSe não foi você quem solicitou, ignore esta mensagem.`;
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: this.config.get<string>('SMTP_USER')
        ? {
            user: this.config.get<string>('SMTP_USER') as string,
            pass: this.config.get<string>('SMTP_PASSWORD') ?? '',
          }
        : undefined,
    });
    try {
      await transporter.sendMail({
        from: `"${fromName}" <${from}>`,
        to,
        subject,
        text: body,
      });
      this.logger.log(`E-mail de ${purpose} enviado para ${to}.`);
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail para ${to}: ${(err as Error).message}`,
      );
    }
  }
}

