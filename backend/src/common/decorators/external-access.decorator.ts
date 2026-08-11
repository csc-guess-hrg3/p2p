import { SetMetadata } from '@nestjs/common';

export const EXTERNAL_ACCESS_KEY = 'externalAccess';

/**
 * Como uma rota trata usuários da Área Externa (realm=EXTERNAL):
 *  - `ALLOW`: rota COMPARTILHADA — internos e externos acessam (ex.: /auth/me).
 *  - `ONLY`:  rota EXCLUSIVA do portal — internos são negados; externos só se
 *             a categoria bater (ex.: /portal/*).
 * `categories` vazio = qualquer categoria externa.
 */
export interface ExternalAccessMeta {
  mode: 'ALLOW' | 'ONLY';
  categories?: string[];
}

/**
 * Libera a rota TAMBÉM para usuários EXTERNOS (internos continuam liberados).
 * Use em endpoints compartilhados (ex.: /auth/me, /auth/logout).
 */
export const AllowExternal = (...categories: string[]) =>
  SetMetadata(EXTERNAL_ACCESS_KEY, {
    mode: 'ALLOW',
    categories: categories.length ? categories : undefined,
  });

/**
 * Restringe a rota ao portal EXTERNO (usuários INTERNOS negados),
 * opcionalmente a categorias específicas. Use nas rotas /portal/*.
 */
export const ExternalOnly = (...categories: string[]) =>
  SetMetadata(EXTERNAL_ACCESS_KEY, {
    mode: 'ONLY',
    categories: categories.length ? categories : undefined,
  });
