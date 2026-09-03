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

function isValidEmailDomain(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Escapa texto que entra no HTML do e-mail (nome vem do ERP). */
function escapeHtml(s: string): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Identidade visual do e-mail: a marca é GUESS (vermelho/branco); HRG3 é só
// infra e não aparece pro usuário. [[marca_e_guess_nao_hrg3]]
const GUESS_RED = '#E4002B';

/** Monta o e-mail (assunto + HTML Guess + texto puro) de definição de senha. */
export function buildPasswordEmail(
  name: string,
  link: string,
  purpose: 'SETUP' | 'RESET',
  login?: string | null,
): { subject: string; html: string; text: string } {
  const isSetup = purpose === 'SETUP';
  const subject = isSetup
    ? 'Guess · Defina sua senha de acesso'
    : 'Guess · Redefina sua senha';
  const cta = isSetup ? 'Definir minha senha' : 'Redefinir minha senha';
  const intro = isSetup
    ? 'Seu acesso ao portal da Guess foi criado. Para começar, defina a sua senha clicando no botão abaixo.'
    : 'Recebemos uma solicitação para redefinir a sua senha. Clique no botão abaixo para criar uma nova.';
  const safeName = escapeHtml(name);
  const hours = TOKEN_LIFETIME_HOURS;
  // Caixinha com o login (código do rep / usuário) — pra ele não precisar
  // procurar o login separado; vem no mesmo e-mail.
  const loginRow = login
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;"><tr><td style="background:#f7f7f7;border-left:3px solid ${GUESS_RED};padding:11px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#4a4a4a;">Seu login de acesso: <strong style="color:#141414;">${escapeHtml(login)}</strong></td></tr></table>`
    : '';

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f2f2f2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e8e8e8;">
        <tr><td align="center" style="background:${GUESS_RED};padding:34px 24px;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:32px;font-weight:bold;letter-spacing:10px;color:#ffffff;">GUESS</div>
        </td></tr>
        <tr><td style="padding:38px 44px 6px 44px;font-family:Arial,Helvetica,sans-serif;">
          <h1 style="margin:0 0 16px 0;font-size:20px;font-weight:bold;color:#141414;">Olá ${safeName},</h1>
          <p style="margin:0 0 22px 0;font-size:15px;line-height:1.65;color:#4a4a4a;">${intro}</p>
          ${loginRow}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px auto;">
            <tr><td align="center" bgcolor="${GUESS_RED}" style="border-radius:4px;">
              <a href="${link}" target="_blank" style="display:inline-block;padding:15px 40px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:4px;">${cta}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 22px 0;font-size:13px;line-height:1.5;color:#808080;">Este link é válido por <strong style="color:#141414;">${hours} horas</strong>. Se expirar, peça um novo ao administrador.</p>
          <hr style="border:none;border-top:1px solid #eeeeee;margin:6px 0 18px 0;">
          <p style="margin:0;font-size:12px;line-height:1.55;color:#9a9a9a;">Se o botão não funcionar, copie e cole este endereço no seu navegador:<br>
            <a href="${link}" style="color:${GUESS_RED};word-break:break-all;">${link}</a></p>
        </td></tr>
        <tr><td align="center" style="background:#fafafa;padding:22px 24px;border-top:1px solid #eeeeee;">
          <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9a9a9a;">E-mail automático — por favor, não responda.</p>
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#bfbfbf;">Se você não solicitou este acesso, ignore esta mensagem. &middot; Guess Brasil</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `Olá ${name},\n\n${intro.replace(/ clicando no botão abaixo| Clique no botão abaixo para criar uma nova\.?/g, '')}\n\n` +
    (login ? `Seu login de acesso: ${login}\n\n` : '') +
    `Acesse o link abaixo (válido por ${hours} horas):\n${link}\n\n` +
    `Se você não solicitou este acesso, ignore esta mensagem.\n\nGuess Brasil`;

  return { subject, html, text };
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
   * Login LOCAL (supervisor, representante e demais usuários cadastrados
   * pelo Admin): `username + password`. O representante usa o próprio código
   * como username. (Não há mais login por CPF.)
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
      throw new BadRequestException(
        'Link expirado — solicite um novo ao Admin.',
      );
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
    await this.sendSetupEmail(user.email, user.name, token, 'SETUP', username);
    return { id: user.id };
  }

  /** Reenvia o link de definição/recuperação de senha. */
  async resendSetupLink(userId: string, purpose: 'SETUP' | 'RESET') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.loginType !== 'LOCAL') {
      throw new NotFoundException('Usuário local não encontrado.');
    }
    const token = await this.issuePasswordToken(userId, purpose);
    await this.sendSetupEmail(
      user.email,
      user.name,
      token,
      purpose,
      user.username,
    );
    return { ok: true };
  }

  /**
   * Self-service ("primeiro acesso / esqueci minha senha"): o usuário informa
   * o E-MAIL; se casar com um usuário LOCAL ativo, enviamos o link (com o login
   * e a definição de senha). SEMPRE responde neutro — nunca revela se o e-mail
   * existe nem o tipo da conta (anti-enumeração). Usuário AD não recebe: a
   * senha dele vive no AD, não no P2P.
   */
  async requestPasswordByEmail(rawEmail: string): Promise<void> {
    const email = (rawEmail ?? '').trim().toLowerCase();
    if (!email) return;
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    // Só usuários LOCAL (rep/supervisor). AD, inexistente ou inativo → silêncio.
    if (!user || user.loginType !== 'LOCAL' || user.status === UserStatus.INACTIVE) {
      this.logger.log(`Recuperação solicitada p/ e-mail sem match LOCAL ativo.`);
      return;
    }
    // Sem senha ainda = primeiro acesso (SETUP); com senha = redefinição (RESET).
    const purpose = user.passwordHash ? 'RESET' : 'SETUP';
    const token = await this.issuePasswordToken(user.id, purpose);
    await this.sendSetupEmail(
      user.email,
      user.name,
      token,
      purpose,
      user.username,
    );
    this.logger.log(`Recuperação (${purpose}) enviada para user ${user.id}.`);
  }

  /**
   * Monta e envia o e-mail com o link de definição de senha.
   *
   * Transporte: **Database Mail do SQL Server** por padrão (as credenciais de
   * SMTP ficam no SQL, não no app; o remetente já é o perfil corporativo
   * `nao-responder@…`). `MAIL_TRANSPORT=smtp` cai no nodemailer/env (fallback).
   */
  private async sendSetupEmail(
    to: string,
    name: string,
    rawToken: string,
    purpose: 'SETUP' | 'RESET' = 'SETUP',
    login?: string | null,
  ): Promise<void> {
    // O link precisa apontar pro domínio público real. Default já é o de
    // produção (não depende de env); PUBLIC_URL sobrescreve se um dia mudar.
    const baseUrl =
      this.config.get<string>('PUBLIC_URL') ?? 'https://p2p.corpbr.com.br';
    const link = `${baseUrl}/definir-senha?token=${rawToken}`;
    const { subject, html, text } = buildPasswordEmail(
      name,
      link,
      purpose,
      login,
    );

    const transport = (
      this.config.get<string>('MAIL_TRANSPORT') ?? 'dbmail'
    ).toLowerCase();
    if (transport === 'smtp') {
      await this.sendViaSmtp(to, subject, html, text, purpose);
    } else {
      await this.sendViaDbMail(to, subject, html, purpose);
    }
    // NUNCA logar o rawToken: é credencial de uso único (account takeover).
  }

  /**
   * Envia pelo **Database Mail** (msdb.sp_send_dbmail). Sem credencial no app;
   * usa o perfil configurado (MAIL_DBMAIL_PROFILE) ou o DEFAULT do servidor. O
   * login do app precisa estar no papel msdb `DatabaseMailUserRole` (grant
   * mínimo) — assim o envio NÃO depende de sysadmin e sobrevive à redução de
   * privilégio do login. Parâmetros ligados pelo Prisma ($executeRaw): o
   * destinatário/assunto/corpo entram como parâmetros, sem risco de injection.
   */
  private async sendViaDbMail(
    to: string,
    subject: string,
    html: string,
    purpose: string,
  ): Promise<void> {
    const profile = this.config.get<string>('MAIL_DBMAIL_PROFILE')?.trim();
    try {
      if (profile) {
        await this.prisma
          .$executeRaw`EXEC msdb.dbo.sp_send_dbmail @profile_name = ${profile}, @recipients = ${to}, @subject = ${subject}, @body = ${html}, @body_format = 'HTML'`;
      } else {
        // Sem perfil configurado: usa o perfil DEFAULT do Database Mail.
        await this.prisma
          .$executeRaw`EXEC msdb.dbo.sp_send_dbmail @recipients = ${to}, @subject = ${subject}, @body = ${html}, @body_format = 'HTML'`;
      }
      this.logger.log(
        `E-mail de ${purpose} enfileirado (Database Mail) para ${to}.`,
      );
    } catch (err) {
      this.logger.error(
        `Falha ao enfileirar e-mail (Database Mail) para ${to}: ${(err as Error).message}`,
      );
    }
  }

  /** Fallback: SMTP externo via nodemailer — só quando MAIL_TRANSPORT=smtp. */
  private async sendViaSmtp(
    to: string,
    subject: string,
    html: string,
    text: string,
    purpose: string,
  ): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 0);
    const from = this.config.get<string>('SMTP_FROM');
    if (!host || !port || !from) {
      this.logger.warn(
        `SMTP não configurado — link de ${purpose} NÃO foi entregue para ${to}. ` +
          `Configure SMTP_* ou use MAIL_TRANSPORT=dbmail (Database Mail).`,
      );
      return;
    }
    const fromName = this.config.get<string>('SMTP_FROM_NAME') ?? 'P2P';
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
        html,
        text,
      });
      this.logger.log(`E-mail de ${purpose} enviado (SMTP) para ${to}.`);
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail (SMTP) para ${to}: ${(err as Error).message}`,
      );
    }
  }
}
