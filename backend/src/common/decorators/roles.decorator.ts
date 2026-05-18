import { SetMetadata } from '@nestjs/common';
import { UserProfile } from '../enums';

export const ROLES_KEY = 'roles';

/** Restringe o handler/controller aos perfis informados. */
export const Roles = (...roles: UserProfile[]) =>
  SetMetadata(ROLES_KEY, roles);
