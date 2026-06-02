import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca controller/handler que nao exige JWT no guard global. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
