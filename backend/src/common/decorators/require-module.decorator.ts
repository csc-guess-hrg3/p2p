import { SetMetadata } from '@nestjs/common';

/** Chave de metadata lida pelo ModuleGuard. */
export const MODULE_KEY = 'requiredModule';

/**
 * Exige que o usuário tenha o MÓDULO (liberado à equipe dele em
 * TeamModuleAccess) para acessar o endpoint — ADMIN passa sempre.
 * Espelha, no backend, a liberação por módulo do frontend (extraModules).
 * Ex.: `@RequireModule('FINANCE')` no controller do Financeiro.
 */
export const RequireModule = (module: string) =>
  SetMetadata(MODULE_KEY, module);
