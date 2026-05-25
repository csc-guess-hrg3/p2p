/**
 * Re-export do dispatcher do modo demo. Os handlers concretos vivem em
 * `./handlers/<domain>.ts` — este arquivo serve apenas como ponto de
 * entrada compatível com a importação histórica.
 */
export { routeDemoRequest } from './handlers/index';
export type { DemoResponse } from './handlers/_shared';
