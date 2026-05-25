/**
 * Handlers admin-ish do modo demo:
 * auth, companies, settings, users, teams, delegations, notifications,
 * admin-ad-sync. Cada função recebe `(method, segments[, query], data?)`
 * e devolve `DemoResponse | null` (null = não trata; cai no dispatcher).
 */
import { findDemoUser } from '../catalog';
import {
  getDemoSessionUserId,
  getDemoState,
  mutateDemoState,
  setDemoSessionUserId,
} from '../state';
import {
  badRequest,
  notFound,
  ok,
  paginate,
  todayIso,
  uid,
  unauthorized,
  type DemoResponse,
} from './_shared';

export function handleAuth(method: string, segments: string[], data?: any): DemoResponse | null {
  const sub = segments[1]; // 'auth' + sub
  if (sub === 'me' && method === 'GET') {
    const userId = getDemoSessionUserId();
    if (!userId) return unauthorized();
    const state = getDemoState();
    const user = state.users.find((u) => u.id === userId);
    if (!user) return unauthorized();
    // Demo: Admin sempre pode trocar de ambiente. extraModules vem da
    // equipe do usuário via state.teamModuleAccess (toggle em /admin/equipes).
    const access = (state as any).teamModuleAccess ?? [];
    const extraModules = access
      .filter((m: any) => m.teamId === user.teamId)
      .map((m: any) => m.module);
    return ok({
      id: user.id,
      adUsername: user.adUsername,
      email: user.email,
      name: user.name,
      profile: user.profile,
      status: user.status,
      teamId: user.teamId,
      companyIds: user.companyIds,
      canSwitchEnv: user.profile === 'ADMIN',
      extraModules,
    });
  }
  if (sub === 'logout' && method === 'POST') {
    setDemoSessionUserId(null);
    return ok({ ok: true });
  }
  if (sub === 'demo-login' && method === 'POST') {
    const username = (data?.username ?? '').toLowerCase();
    const demo = findDemoUser(username);
    if (!demo) return badRequest(`Usuário demo "${username}" não existe.`);
    const state = getDemoState();
    const user = state.users.find((u) => u.adUsername === username);
    if (!user) return notFound('Usuário demo não inicializado.');
    setDemoSessionUserId(user.id);
    return ok({ accessToken: `demo.${user.id}`, refreshToken: `demo-refresh.${user.id}` });
  }
  if (sub === 'demo-users' && method === 'GET') {
    // Lista vinda do catálogo — usada se o front quiser ler do servidor.
    const state = getDemoState();
    return ok({
      enabled: true,
      users: state.users.map((u) => ({
        username: u.adUsername,
        name: u.name,
        profile: u.profile,
        description: '',
      })),
    });
  }

  // ── Store auth (vendedor de loja por CPF) ─────────────────────
  // Lookup: confere se o CPF está cadastrado e devolve se precisa
  // definir senha ainda.
  if (sub === 'store-lookup' && method === 'POST') {
    const cpf = normalizeCpf(data?.cpf ?? '');
    if (cpf.length !== 11) {
      return ok({ found: false, needsSetup: false, name: null, branches: [] });
    }
    const state = getDemoState();
    const vendors = (state as { lojaVendedores?: DemoVendorRow[] })
      .lojaVendedores ?? [];
    const rows = vendors.filter((v) => v.cpf === cpf);
    if (rows.length === 0) {
      return ok({ found: false, needsSetup: false, name: null, branches: [] });
    }
    const user = state.users.find((u) => u.cpf === cpf);
    const needsSetup = !user || !user.passwordHash;
    return ok({
      found: true,
      needsSetup,
      name: rows[0].nome,
      branches: rows.map((r) => ({
        companyCode: r.empresa,
        branchErpCode: r.branchErpCode,
        branchName: r.branchName,
      })),
    });
  }

  // Setup: 1º acesso do vendedor — cria User + grava sessão.
  if (sub === 'store-setup-password' && method === 'POST') {
    const cpf = normalizeCpf(data?.cpf ?? '');
    const password = String(data?.password ?? '');
    if (cpf.length !== 11) return badRequest('CPF inválido.');
    if (password.length < 8) {
      return badRequest('A senha precisa ter pelo menos 8 caracteres.');
    }
    return mutateDemoState((s) => {
      const vendors =
        (s as { lojaVendedores?: DemoVendorRow[] }).lojaVendedores ?? [];
      const rows = vendors.filter((v) => v.cpf === cpf);
      if (rows.length === 0) {
        return unauthorized(
          'CPF não encontrado no cadastro de vendedores. Procure o RH.',
        );
      }
      const companyByCode = new Map(
        (s.companies ?? []).map((c) => [c.code, c.id]),
      );
      const existing = s.users.find((u) => u.cpf === cpf);
      let user = existing;
      if (user) {
        user.passwordHash = `hash:${password}`;
        user.status = 'ACTIVE';
      } else {
        user = {
          id: uid('user'),
          cpf,
          adUsername: null,
          username: null,
          email: `cpf-${cpf}@p2p.local`,
          name: rows[0].nome,
          profile: 'OPERATOR',
          loginType: 'LOCAL',
          status: 'ACTIVE',
          teamId: null,
          companyIds: Array.from(
            new Set(
              rows
                .map((r) => companyByCode.get(r.empresa))
                .filter((x): x is string => !!x),
            ),
          ),
          passwordHash: `hash:${password}`,
        };
        s.users.push(user);
      }
      setDemoSessionUserId(user.id);
      return ok({
        accessToken: `demo.${user.id}`,
        refreshToken: `demo-refresh.${user.id}`,
      });
    });
  }

  // Login subsequente do vendedor.
  if (sub === 'store-login' && method === 'POST') {
    const cpf = normalizeCpf(data?.cpf ?? '');
    const password = String(data?.password ?? '');
    const state = getDemoState();
    const user = state.users.find((u) => u.cpf === cpf);
    if (!user || user.passwordHash !== `hash:${password}`) {
      return unauthorized('CPF ou senha inválidos.');
    }
    const vendors =
      (state as { lojaVendedores?: DemoVendorRow[] }).lojaVendedores ?? [];
    if (!vendors.some((v) => v.cpf === cpf)) {
      return unauthorized(
        'Vendedor não está mais ativo no cadastro do varejo.',
      );
    }
    setDemoSessionUserId(user.id);
    return ok({
      accessToken: `demo.${user.id}`,
      refreshToken: `demo-refresh.${user.id}`,
    });
  }

  return null;
}

interface DemoVendorRow {
  empresa: string;
  cpf: string;
  nome: string;
  branchErpCode: string;
  branchName: string;
}
function normalizeCpf(raw: string): string {
  return (raw ?? '').replace(/\D/g, '');
}

export function handleCompanies(
  method: string,
  segments: string[],
  data?: any,
): DemoResponse | null {
  // /companies (lista)
  if (method === 'GET' && segments.length === 1) {
    return ok(getDemoState().companies);
  }
  // /companies/:id/erp-config
  const id = segments[1];
  if (segments[2] === 'erp-config') {
    const state = getDemoState();
    const company = state.companies.find((c: any) => c.id === id);
    if (!company) return notFound();
    if (method === 'GET') {
      const cfg = company.erpConfig ?? null;
      return ok({
        companyId: company.id,
        companyCode: company.code,
        companyName: company.name,
        config: cfg
          ? { ...cfg, hasSmtpPassword: !!cfg.smtpPassword, smtpPassword: undefined }
          : null,
      });
    }
    if (method === 'PUT') {
      return mutateDemoState((s) => {
        const c = s.companies.find((x: any) => x.id === id);
        if (!c) return notFound();
        const cur = c.erpConfig ?? {};
        const next = { ...cur, ...data };
        // Senha em branco/undefined preserva atual
        if (data?.smtpPassword === undefined) next.smtpPassword = cur.smtpPassword;
        c.erpConfig = next;
        return ok({ ...next, hasSmtpPassword: !!next.smtpPassword, smtpPassword: undefined });
      });
    }
  }
  return null;
}
export function handleSettings(
  method: string,
  segments: string[],
  query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const companyId = query.get('companyId') ?? data?.companyId;
  if (method === 'GET') {
    const defs: any[] = [
      {
        key: 'requisitions.min_quotations_threshold_amount',
        label: 'Valor mínimo para exigir cotações',
        description: 'A partir deste total, a requisição exige número mínimo de cotações.',
        type: 'number',
        value: '10000',
        isDefault: true,
        updatedAt: null,
      },
      {
        key: 'requisitions.min_quotations_required',
        label: 'Cotações mínimas obrigatórias',
        description: 'Quantidade mínima de cotações exigida quando o valor atinge o limite.',
        type: 'number',
        value: '3',
        isDefault: true,
        updatedAt: null,
      },
      {
        key: 'receiving.divergence_tolerance_pct',
        label: 'Tolerância de divergência no recebimento',
        description: 'Percentual aceito antes de marcar o recebimento como divergente.',
        type: 'number',
        value: '2',
        isDefault: true,
        updatedAt: null,
      },
    ];
    const state = getDemoState();
    const overrides = (state as any).systemSettings?.[companyId ?? ''] ?? {};
    const merged = defs.map((d) =>
      overrides[d.key] != null
        ? { ...d, value: overrides[d.key], isDefault: false, updatedAt: new Date().toISOString() }
        : d,
    );
    return ok(merged);
  }
  if (method === 'PUT') {
    const key = segments[1];
    return mutateDemoState((s: any) => {
      s.systemSettings = s.systemSettings ?? {};
      s.systemSettings[companyId] = s.systemSettings[companyId] ?? {};
      s.systemSettings[companyId][key] = String(data?.value ?? '');
      return ok({ key, value: s.systemSettings[companyId][key] });
    });
  }
  return null;
}
export function handleUsers(
  method: string,
  segments: string[],
  query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const state = getDemoState() as any;
  const id = segments[1];
  const action = segments[2];
  // GET /users — lista com filtros
  if (method === 'GET' && !id) {
    const statusFilter = query.get('status');
    const search = query.get('search')?.toLowerCase();
    let rows = state.users as any[];
    if (statusFilter) rows = rows.filter((u) => u.status === statusFilter);
    if (search) {
      rows = rows.filter(
        (u) =>
          u.name.toLowerCase().includes(search) ||
          u.adUsername.toLowerCase().includes(search),
      );
    }
    return ok(paginate(rows, query));
  }
  if (method === 'GET' && id && !action) {
    const u = state.users.find((x: any) => x.id === id);
    return u ? ok(u) : notFound();
  }
  if (method === 'PATCH' && id && !action) {
    return mutateDemoState((s: any) => {
      const u = s.users.find((x: any) => x.id === id);
      if (!u) return notFound();
      if (data?.name !== undefined) u.name = data.name;
      if (data?.profile !== undefined) u.profile = data.profile;
      if (data?.status !== undefined) u.status = data.status;
      if (data?.teamId !== undefined) u.teamId = data.teamId;
      if (data?.canSwitchEnv !== undefined) u.canSwitchEnv = data.canSwitchEnv;
      u.updatedAt = todayIso();
      return ok(u);
    });
  }
  if (method === 'PUT' && id && action === 'companies') {
    return mutateDemoState((s: any) => {
      const u = s.users.find((x: any) => x.id === id);
      if (!u) return notFound();
      u.companyIds = data?.companyIds ?? [];
      u.companies = (data?.companyIds ?? []).map((cid: string) => ({
        companyId: cid,
      }));
      u.updatedAt = todayIso();
      return ok(u);
    });
  }
  if (method === 'DELETE' && id && !action) {
    return mutateDemoState((s: any) => {
      const u = s.users.find((x: any) => x.id === id);
      if (!u) return notFound();
      u.status = 'INACTIVE';
      u.deletedAt = todayIso();
      return ok(u);
    });
  }
  return null;
}
export function handleTeams(
  method: string,
  segments: string[],
  data?: any,
): DemoResponse | null {
  const state = getDemoState() as any;
  const id = segments[1];
  const action = segments[2];
  // Inicializa array de teams se ainda só existir o objeto único `team`.
  state.teamsList = state.teamsList ?? (state.team ? [state.team] : []);

  // moduleAccess vive em state.teamModuleAccess (criado on-the-fly).
  state.teamModuleAccess = state.teamModuleAccess ?? [];
  const modulesOf = (teamId: string) =>
    state.teamModuleAccess
      .filter((m: any) => m.teamId === teamId)
      .map((m: any) => ({ module: m.module }));

  if (method === 'GET' && !id) {
    return ok(
      state.teamsList.map((t: any) => ({
        ...t,
        approvalLevels: (state.approvalLevels ?? []).filter(
          (l: any) => l.teamId === t.id,
        ),
        moduleAccess: modulesOf(t.id),
      })),
    );
  }
  if (method === 'GET' && id && !action) {
    const t = state.teamsList.find((x: any) => x.id === id);
    if (!t) return notFound();
    return ok({
      ...t,
      approvalLevels: (state.approvalLevels ?? [])
        .filter((l: any) => l.teamId === id)
        .map((l: any) => {
          const approver = state.users.find((u: any) => u.id === l.approverId);
          return { ...l, approver: approver ? { id: approver.id, name: approver.name } : null };
        }),
      moduleAccess: modulesOf(id),
      branchRateios: (state.teamBranchRateios ?? []).filter(
        (r: any) => r.teamId === id,
      ),
      costCenterRateios: (state.teamCcRateios ?? []).filter(
        (r: any) => r.teamId === id,
      ),
    });
  }
  if (method === 'POST' && !id) {
    return mutateDemoState((s: any) => {
      const t = {
        id: uid('team'),
        name: String(data?.name ?? '').trim(),
        managerId: null,
        isFiscal: false,
        active: true,
        createdAt: todayIso(),
        updatedAt: todayIso(),
      };
      s.teamsList = s.teamsList ?? (s.team ? [s.team] : []);
      s.teamsList.push(t);
      return ok(t);
    });
  }
  if (method === 'PATCH' && id && !action) {
    return mutateDemoState((s: any) => {
      s.teamsList = s.teamsList ?? (s.team ? [s.team] : []);
      const t = s.teamsList.find((x: any) => x.id === id);
      if (!t) return notFound();
      if (data?.name !== undefined) t.name = data.name;
      if (data?.active !== undefined) t.active = data.active;
      t.updatedAt = todayIso();
      return ok(t);
    });
  }
  if (method === 'DELETE' && id && !action) {
    return mutateDemoState((s: any) => {
      s.teamsList = s.teamsList ?? (s.team ? [s.team] : []);
      const t = s.teamsList.find((x: any) => x.id === id);
      if (!t) return notFound();
      t.active = false;
      t.updatedAt = todayIso();
      return ok(t);
    });
  }
  if (method === 'PUT' && id && action === 'branch-rateios') {
    return mutateDemoState((s: any) => {
      s.teamBranchRateios = (s.teamBranchRateios ?? []).filter(
        (r: any) => r.teamId !== id,
      );
      for (const r of data?.rateios ?? []) {
        s.teamBranchRateios.push({
          teamId: id,
          companyId: r.companyId,
          branchRateioCode: r.code,
        });
      }
      const t = (s.teamsList ?? []).find((x: any) => x.id === id) ?? s.team;
      return ok(t ?? { id });
    });
  }
  if (method === 'PUT' && id && action === 'cc-rateios') {
    return mutateDemoState((s: any) => {
      s.teamCcRateios = (s.teamCcRateios ?? []).filter(
        (r: any) => r.teamId !== id,
      );
      for (const r of data?.rateios ?? []) {
        s.teamCcRateios.push({
          teamId: id,
          companyId: r.companyId,
          costCenterRateioCode: r.code,
        });
      }
      const t = (s.teamsList ?? []).find((x: any) => x.id === id) ?? s.team;
      return ok(t ?? { id });
    });
  }
  if (method === 'PUT' && id && action === 'modules') {
    return mutateDemoState((s: any) => {
      s.teamModuleAccess = (s.teamModuleAccess ?? []).filter(
        (m: any) => m.teamId !== id,
      );
      const unique = Array.from(new Set<string>(data?.modules ?? []));
      for (const m of unique) {
        s.teamModuleAccess.push({ teamId: id, module: m, createdAt: todayIso() });
      }
      const t = (s.teamsList ?? []).find((x: any) => x.id === id) ?? s.team;
      return ok(t ?? { id });
    });
  }
  if (method === 'PUT' && id && action === 'approval-levels') {
    return mutateDemoState((s: any) => {
      s.approvalLevels = (s.approvalLevels ?? []).filter(
        (l: any) => l.teamId !== id,
      );
      for (const l of data?.levels ?? []) {
        s.approvalLevels.push({
          id: uid('lvl'),
          teamId: id,
          level: l.level,
          name: l.name,
          approverId: l.approverId,
          maxAmount: l.maxAmount != null ? String(l.maxAmount) : null,
        });
      }
      const t = (s.teamsList ?? []).find((x: any) => x.id === id) ?? s.team;
      return ok(t ?? { id });
    });
  }
  return null;
}
export function handleDelegations(
  method: string,
  segments: string[],
  query: URLSearchParams,
  data?: any,
): DemoResponse | null {
  const state = getDemoState() as any;
  state.delegations = state.delegations ?? [];
  const id = segments[1];
  const userId = getDemoSessionUserId();
  if (method === 'GET' && !id) {
    const type = query.get('type') === 'received' ? 'received' : 'given';
    const rows = (state.delegations as any[]).filter((d) =>
      type === 'given' ? d.delegatorId === userId : d.delegateId === userId,
    );
    // Enrichment com nomes
    const enriched = rows.map((d) => ({
      ...d,
      delegator: {
        id: d.delegatorId,
        name: state.users.find((u: any) => u.id === d.delegatorId)?.name,
      },
      delegate: {
        id: d.delegateId,
        name: state.users.find((u: any) => u.id === d.delegateId)?.name,
      },
    }));
    return ok(enriched);
  }
  if (method === 'POST' && !id) {
    return mutateDemoState((s: any) => {
      s.delegations = s.delegations ?? [];
      if (data?.delegateId === userId) {
        return badRequest('Você não pode delegar para si mesmo.');
      }
      if (new Date(data?.endsAt) <= new Date(data?.startsAt)) {
        return badRequest('Fim deve ser após o início.');
      }
      const d = {
        id: uid('del'),
        delegatorId: userId,
        delegateId: data.delegateId,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        reason: data.reason ?? null,
        cancelledAt: null,
        createdAt: todayIso(),
      };
      s.delegations.push(d);
      return ok(d);
    });
  }
  if (method === 'DELETE' && id) {
    return mutateDemoState((s: any) => {
      s.delegations = s.delegations ?? [];
      const d = s.delegations.find((x: any) => x.id === id);
      if (!d) return notFound();
      if (d.delegatorId !== userId) {
        return badRequest('Só o autor da delegação pode cancelar.');
      }
      d.cancelledAt = todayIso();
      return ok(d);
    });
  }
  return null;
}
export function handleNotifications(
  method: string,
  segments: string[],
  query: URLSearchParams,
): DemoResponse | null {
  const sub = segments[1];
  const userId = getDemoSessionUserId();
  if (!userId) return unauthorized();
  const state = getDemoState();
  const all = (state.notifications ?? []).filter(
    (n: any) => n.userId === userId,
  );

  if (sub === 'mine' && method === 'GET') {
    const onlyUnread = query.get('onlyUnread') === 'true';
    return ok(
      [...all]
        .filter((n: any) => (onlyUnread ? !n.readAt : true))
        .sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 100),
    );
  }
  if (sub === 'unread-count' && method === 'GET') {
    return ok({ count: all.filter((n: any) => !n.readAt).length });
  }
  if (sub === 'read-all' && method === 'POST') {
    mutateDemoState((s: any) => {
      const now = todayIso();
      for (const n of s.notifications ?? []) {
        if (n.userId === userId && !n.readAt) n.readAt = now;
      }
    });
    return ok({ ok: true });
  }
  // POST /notifications/:id/read
  if (segments[2] === 'read' && method === 'POST') {
    const id = segments[1];
    mutateDemoState((s: any) => {
      const n = (s.notifications ?? []).find((x: any) => x.id === id);
      if (n && n.userId === userId && !n.readAt) n.readAt = todayIso();
    });
    return ok({ ok: true });
  }
  return null;
}
export function handleAdminAdSync(method: string, segments: string[]): DemoResponse | null {
  const sub = segments[1];
  if (sub === 'ad' && segments[2] === 'preview' && method === 'GET') {
    // Devolve uma sugestão fixa pra a tela renderizar com algo crível.
    return ok([
      {
        ouName: 'Marketing',
        companyCode: 'GUESS',
        users: [
          {
            login: 'aila.siqueira',
            name: 'Aila Siqueira',
            email: 'aila.siqueira@guess.local',
            dn: 'CN=Aila Siqueira,OU=Marketing,OU=Guess,DC=corp,DC=local',
          },
          {
            login: 'bruno.lopes',
            name: 'Bruno Lopes',
            email: 'bruno.lopes@guess.local',
            dn: 'CN=Bruno Lopes,OU=Marketing,OU=Guess,DC=corp,DC=local',
          },
        ],
      },
      {
        ouName: 'Compras',
        companyCode: 'HRG3',
        users: [
          {
            login: 'carla.dias',
            name: 'Carla Dias',
            email: 'carla.dias@hrg3.local',
            dn: 'CN=Carla Dias,OU=Compras,OU=Hrg3,DC=corp,DC=local',
          },
        ],
      },
    ]);
  }
  if (sub === 'ad' && segments[2] === 'apply' && method === 'POST') {
    return ok({ teamsCreated: 2, usersCreated: 3, usersLinked: 3 });
  }
  return null;
}
