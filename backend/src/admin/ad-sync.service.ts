import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ldap from 'ldapjs';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile, UserStatus } from '../common/enums';

/**
 * Entrada vinda do AD pra cada usuário ativo.
 */
interface AdUser {
  dn: string;
  /** sAMAccountName — login curto (usado no P2P). */
  login: string;
  name: string;
  email: string | null;
  /** Pai imediato (OU sugerida como nome da equipe). */
  ouName: string;
  /** OU top-level (Guess / Hrg3). */
  topLevelOu: string;
  /** Empresa sugerida (GUESS/HRG3) derivada da topLevelOu. */
  companyCode: string | null;
}

/** Estrutura agrupada que vai pro preview. */
export interface AdTeamSuggestion {
  ouName: string;
  companyCode: string | null;
  users: Array<{ login: string; name: string; email: string | null; dn: string }>;
}

/**
 * Mapeamento OU top-level → código da empresa no P2P.
 * Hoje fica hardcoded; quando suportarmos mais empresas, vira config.
 */
const TOP_LEVEL_TO_COMPANY: Record<string, string> = {
  guess: 'GUESS',
  hrg3: 'HRG3',
};

/**
 * OUs ignoradas em qualquer nível (containers do AD, não equipes reais).
 */
const IGNORED_OU_NAMES = new Set([
  'bloqueados',
  'computadores',
  'users',
  'builtin',
  'domain controllers',
  'foreignsecurityprincipals',
  'managed service accounts',
  'consultas salvas',
  'publico',
]);

@Injectable()
export class AdSyncService {
  private readonly logger = new Logger(AdSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Faz uma busca paginada no AD por todos os usuários ATIVOS e os agrupa
   * por OU pai. Equipes vazias (após filtros) somem.
   */
  async fetchSuggestions(): Promise<AdTeamSuggestion[]> {
    const users = await this.searchActiveUsers();
    const byOu = new Map<string, AdTeamSuggestion>();
    for (const u of users) {
      const key = `${u.companyCode ?? '?'}::${u.ouName}`;
      const existing = byOu.get(key);
      if (existing) {
        existing.users.push({
          login: u.login,
          name: u.name,
          email: u.email,
          dn: u.dn,
        });
      } else {
        byOu.set(key, {
          ouName: u.ouName,
          companyCode: u.companyCode,
          users: [
            { login: u.login, name: u.name, email: u.email, dn: u.dn },
          ],
        });
      }
    }
    // Ordena por (empresa, equipe) pra UI ficar previsível.
    return Array.from(byOu.values()).sort((a, b) => {
      const c = (a.companyCode ?? '').localeCompare(b.companyCode ?? '');
      return c !== 0 ? c : a.ouName.localeCompare(b.ouName);
    });
  }

  /**
   * Aplica a seleção: cria/atualiza Teams e Users + bind UserCompany.
   * Não desativa usuários que sumiram do AD — só sincroniza presença.
   */
  async apply(
    selections: Array<{
      ouName: string;
      companyCode: string;
      teamName: string;
      userLogins: string[];
    }>,
  ): Promise<{ teamsCreated: number; usersCreated: number; usersLinked: number }> {
    const adUsers = await this.searchActiveUsers();
    const byLogin = new Map(adUsers.map((u) => [u.login.toLowerCase(), u]));
    let teamsCreated = 0;
    let usersCreated = 0;
    let usersLinked = 0;

    for (const sel of selections) {
      const company = await this.prisma.company.findFirst({
        where: { code: sel.companyCode, deletedAt: null },
      });
      if (!company) {
        this.logger.warn(
          `Empresa ${sel.companyCode} não cadastrada — pulando equipe ${sel.teamName}.`,
        );
        continue;
      }
      // Cria/atualiza time (busca por nome — não há código).
      let team = await this.prisma.team.findFirst({
        where: { name: sel.teamName, deletedAt: null },
      });
      if (!team) {
        team = await this.prisma.team.create({
          data: { name: sel.teamName, active: true },
        });
        teamsCreated++;
      }
      for (const login of sel.userLogins) {
        const ad = byLogin.get(login.toLowerCase());
        if (!ad) continue;
        let user = await this.prisma.user.findFirst({
          where: { adUsername: login },
        });
        if (!user) {
          user = await this.prisma.user.create({
            data: {
              adUsername: login,
              email: ad.email!,  // filtrado em searchActiveUsers (nunca null aqui)
              name: ad.name,
              profile: UserProfile.OPERATOR,
              status: UserStatus.ACTIVE,
              teamId: team.id,
            },
          });
          usersCreated++;
        } else if (user.teamId !== team.id) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { teamId: team.id },
          });
        }
        // Vincula à empresa.
        const link = await this.prisma.userCompany.findUnique({
          where: {
            userId_companyId: { userId: user.id, companyId: company.id },
          },
        });
        if (!link) {
          await this.prisma.userCompany.create({
            data: { userId: user.id, companyId: company.id },
          });
          usersLinked++;
        }
      }
    }
    return { teamsCreated, usersCreated, usersLinked };
  }

  /* -------------------------------------------------------------- */
  /* LDAP                                                           */
  /* -------------------------------------------------------------- */

  private async searchActiveUsers(): Promise<AdUser[]> {
    const url = this.config.getOrThrow<string>('LDAP_URL');
    const baseDn = this.config.getOrThrow<string>('LDAP_BASE_DN');
    const bindDn = this.config.getOrThrow<string>('LDAP_BIND_DN');
    const bindPw = this.config.getOrThrow<string>('LDAP_BIND_PASSWORD');

    const client = ldap.createClient({ url });
    try {
      await this.bind(client, bindDn, bindPw);
      // userAccountControl bit 2 = ACCOUNTDISABLE. Filtro AD para "ativo":
      const filter =
        '(&(objectCategory=person)(objectClass=user)' +
        '(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';
      const entries = await this.search(client, baseDn, filter);
      const out: AdUser[] = [];
      for (const e of entries) {
        const sam = stringAttr(e, 'sAMAccountName');
        if (!sam) continue;
        const dn = e.objectName ?? '';
        const { ouName, topLevelOu } = parseOu(dn);
        if (!ouName) continue;
        if (IGNORED_OU_NAMES.has(ouName.toLowerCase())) continue;
        // E-mail é obrigatório no cadastro do P2P, então pulamos usuários
        // do AD sem `mail` preenchido — não há como criar o User aqui.
        const email = stringAttr(e, 'mail');
        if (!email) continue;
        out.push({
          dn,
          login: sam,
          name:
            stringAttr(e, 'displayName') ?? stringAttr(e, 'cn') ?? sam,
          email,
          ouName,
          topLevelOu,
          companyCode:
            TOP_LEVEL_TO_COMPANY[topLevelOu.toLowerCase()] ?? null,
        });
      }
      return out;
    } finally {
      try {
        client.unbind();
      } catch (err) {
        // unbind falha quando a conexão já caiu — não é problema; só logamos
        // pra diagnosticar problemas reais de rede/auth.
        this.logger.debug(
          `ldap.unbind ignorado: ${(err as Error).message}`,
        );
      }
    }
  }

  private bind(
    client: ldap.Client,
    dn: string,
    pw: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      client.bind(dn, pw, (err) => (err ? reject(err) : resolve()));
    });
  }

  private search(
    client: ldap.Client,
    base: string,
    filter: string,
  ): Promise<Array<ldap.SearchEntry>> {
    return new Promise((resolve, reject) => {
      const entries: ldap.SearchEntry[] = [];
      client.search(
        base,
        {
          scope: 'sub',
          filter,
          attributes: [
            'displayName',
            'cn',
            'mail',
            'userPrincipalName',
            'sAMAccountName',
            'userAccountControl',
          ],
          paged: { pageSize: 500, pagePause: false },
        },
        (err, res) => {
          if (err) return reject(err);
          res.on('searchEntry', (entry) => entries.push(entry));
          res.on('error', (e) =>
            reject(
              e.name === 'SizeLimitExceededError'
                ? new BadRequestException(
                    'AD devolveu mais de 1000 entradas — aumente o limit no AD ou pagine.',
                  )
                : e,
            ),
          );
          res.on('end', () => resolve(entries));
        },
      );
    });
  }
}

/* -------------------------------------------------------------- */
/* Helpers (puros)                                                */
/* -------------------------------------------------------------- */

/** Lê um atributo string da entry, lidando com formatos do ldapjs. */
function stringAttr(
  entry: ldap.SearchEntry,
  name: string,
): string | null {
  const a = entry.attributes.find(
    (x) => x.type.toLowerCase() === name.toLowerCase(),
  );
  if (!a) return null;
  // ldapjs expõe valores em `.values` ou `.vals` dependendo da versão
  // e do tipo do atributo — tentamos ambos.
  const bag = a as unknown as {
    values?: string[];
    vals?: Array<string | Buffer>;
  };
  const v = bag.values?.[0] ?? bag.vals?.[0];
  return v != null ? String(v) : null;
}

/**
 * Extrai do DN o nome da OU pai (equipe sugerida) e a OU de topo
 * (empresa sugerida).
 *
 * Ex.: "CN=Aila Siqueira,OU=Marketing,OU=Guess,DC=corp,DC=local"
 * → ouName: "Marketing", topLevelOu: "Guess"
 *
 * "Bloqueados" como pai imediato → sobe pra OU pai (a real).
 */
export function parseOu(dn: string): {
  ouName: string | null;
  topLevelOu: string;
} {
  const parts = dn.split(',').map((p) => p.trim());
  const ous = parts
    .filter((p) => p.toLowerCase().startsWith('ou='))
    .map((p) => p.slice(3));
  if (ous.length === 0) return { ouName: null, topLevelOu: '' };
  let ouName: string | null = null;
  for (const ou of ous) {
    if (!IGNORED_OU_NAMES.has(ou.toLowerCase())) {
      ouName = ou;
      break;
    }
  }
  const topLevelOu = ous[ous.length - 1];
  return { ouName, topLevelOu };
}
