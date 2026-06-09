import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AccountLockoutService } from './account-lockout.service';
import { UserStatus } from '../common/enums';

const BCRYPT_ROUNDS = 10;
const VENDOR_PROFILE = 'OPERATOR';

/** Linha bruta da view `v_p2p_loja_vendedores` (cross-DB Linx). */
interface LojaVendedorRow {
  empresa: string; // 'GUESS' | 'HRG3'
  cpf: string; // só dígitos
  nome: string;
  branch_erp_code: string; // FILIAIS.COD_FILIAL
  branch_name: string;
}

function normalizeCpf(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

/**
 * Autenticação de vendedor de loja — identificador é o CPF e a senha é
 * gerenciada pelo P2P (não vem do Linx; é definida no primeiro acesso).
 *
 * Fluxo:
 *   1. `lookup(cpf)` — confere se o CPF está em `v_p2p_loja_vendedores`
 *      e se existe User correspondente no P2P.
 *      Retorna `{ needsSetup, name, branches }`.
 *   2. `setupPassword(cpf, password)` — primeiro acesso: valida a
 *      view, cria o User com hash da senha, marca status ACTIVE e
 *      grava `user_branch_assignments` com todas as filiais que o
 *      vendedor atende (LOJA_VENDEDORES pode ter N linhas pra ele).
 *   3. `login(cpf, password)` — login subsequente: valida hash; se
 *      o User foi removido do LOJA_VENDEDORES, recusa.
 *
 * E-mail de recuperação fica em `branch_extensions.email` da primeira
 * filial do vendedor (Fase 2 — endpoint separado).
 */
@Injectable()
export class StoreAuthService {
  private readonly logger = new Logger(StoreAuthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly lockout: AccountLockoutService,
  ) {}

  /** Lê todas as linhas da view para um CPF. */
  private async findVendorRows(cpf: string): Promise<LojaVendedorRow[]> {
    const norm = normalizeCpf(cpf);
    if (norm.length !== 11) return [];
    const rows = await this.prisma.$queryRaw<LojaVendedorRow[]>`
      SELECT empresa, cpf, nome, branch_erp_code, branch_name
      FROM dbo.v_p2p_loja_vendedores
      WHERE cpf = ${norm}`;
    return rows;
  }

  /**
   * Pré-flight: o front chama isso quando o vendedor digita o CPF, antes
   * de pedir a senha. Devolve `needsSetup=true` quando o User ainda não
   * existe ou está sem senha — a UI mostra os 2 campos de senha-nova.
   */
  async lookup(cpf: string): Promise<{
    found: boolean;
    needsSetup: boolean;
    name: string | null;
    branches: Array<{
      companyCode: string;
      branchErpCode: string;
      branchName: string;
    }>;
  }> {
    const rows = await this.findVendorRows(cpf);
    if (rows.length === 0) {
      return { found: false, needsSetup: false, name: null, branches: [] };
    }
    const user = await this.prisma.user.findUnique({
      where: { cpf: normalizeCpf(cpf) },
      select: { passwordHash: true, status: true, deletedAt: true },
    });
    const needsSetup = !user || !user.passwordHash || user.deletedAt !== null;
    return {
      found: true,
      needsSetup,
      name: rows[0].nome,
      branches: rows.map((r) => ({
        companyCode: r.empresa,
        branchErpCode: r.branch_erp_code,
        branchName: r.branch_name,
      })),
    };
  }

  /** Primeiro acesso — cria o User com a senha definida pelo vendedor. */
  async setupPassword(cpf: string, password: string): Promise<string> {
    const norm = normalizeCpf(cpf);
    const rows = await this.findVendorRows(norm);
    if (rows.length === 0) {
      throw new UnauthorizedException(
        'CPF não encontrado no cadastro de vendedores. Procure o RH.',
      );
    }

    // Resolve as companies P2P pelas empresas (códigos) das filiais.
    const companyCodes = Array.from(new Set(rows.map((r) => r.empresa)));
    const companies = await this.prisma.company.findMany({
      where: { code: { in: companyCodes }, deletedAt: null },
      select: { id: true, code: true },
    });
    if (companies.length === 0) {
      throw new BadRequestException(
        'Empresa(s) do vendedor não cadastrada(s) no P2P.',
      );
    }

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const existing = await this.prisma.user.findUnique({
      where: { cpf: norm },
      select: { id: true },
    });

    const userId = await this.prisma.$transaction(async (tx) => {
      let id: string;
      if (existing) {
        await tx.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: hash,
            passwordSetAt: new Date(),
            status: UserStatus.ACTIVE,
            deletedAt: null,
          },
        });
        id = existing.id;
      } else {
        const u = await tx.user.create({
          data: {
            cpf: norm,
            name: rows[0].nome,
            // E-mail é unique e obrigatório no schema — sintético para
            // vendedores. Recuperação efetiva é via e-mail da filial.
            email: `cpf-${norm}@p2p.local`,
            profile: VENDOR_PROFILE,
            loginType: 'LOCAL',
            status: UserStatus.ACTIVE,
            passwordHash: hash,
            passwordSetAt: new Date(),
          },
        });
        id = u.id;
      }
      // Sincroniza UserCompany — substitui o conjunto.
      await tx.userCompany.deleteMany({ where: { userId: id } });
      await tx.userCompany.createMany({
        data: companies.map((c) => ({ userId: id, companyId: c.id })),
      });
      // Sincroniza UserBranchAssignment — substitui o conjunto.
      await tx.userBranchAssignment.deleteMany({ where: { userId: id } });
      const byCompany = new Map(companies.map((c) => [c.code, c.id]));
      await tx.userBranchAssignment.createMany({
        data: rows
          .filter((r) => byCompany.has(r.empresa))
          .map((r) => ({
            userId: id,
            companyId: byCompany.get(r.empresa) as string,
            branchErpCode: r.branch_erp_code,
          })),
      });
      return id;
    });

    this.logger.log(`Vendedor ${norm} (${rows[0].nome}) ativado.`);
    return userId;
  }

  /**
   * Login do vendedor com CPF + senha. Valida que o vendedor ainda
   * existe no LOJA_VENDEDORES (se foi removido, recusa o acesso).
   */
  async login(cpf: string, password: string): Promise<string> {
    const norm = normalizeCpf(cpf);
    const user = await this.prisma.user.findUnique({
      where: { cpf: norm },
    });
    if (!user || user.deletedAt || !user.passwordHash) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }
    // Lockout aplicado ANTES da verificação de senha. Conta bloqueada
    // recebe 401 imediato mesmo com senha correta — frustra atacante
    // testando senhas em rajada e protege a CPU/bcrypt do servidor.
    await this.lockout.assertNotLocked(user.id);
    if (user.status === UserStatus.INACTIVE) {
      throw new UnauthorizedException('Usuário inativo.');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.lockout.recordFailure(user.id);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // Confirma que ainda está no LOJA_VENDEDORES (vendedor demitido
    // perde o acesso ao P2P imediatamente, mesmo sem job de sync).
    const rows = await this.findVendorRows(norm);
    if (rows.length === 0) {
      throw new UnauthorizedException(
        'Vendedor não está mais ativo no cadastro do varejo.',
      );
    }
    await this.lockout.clearOnSuccess(user.id);
    return user.id;
  }
}
