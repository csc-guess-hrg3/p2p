import { ExternalCategory } from '../common/enums';

/**
 * Catálogo de ÁREAS do portal externo (as "telas" que o usuário externo
 * acessa). Cada categoria tem suas áreas; hoje o REPRESENTANTE tem a
 * "Consulta de Clientes" — outras entram aqui depois (plug-and-play).
 */
export interface PortalArea {
  key: string;
  category: string;
  title: string;
  description: string;
}

export const PORTAL_AREAS: PortalArea[] = [
  {
    key: 'consulta-clientes',
    category: ExternalCategory.REPRESENTANTE,
    title: 'Consulta de Clientes',
    description:
      'Seus clientes: cadastro, faturamentos e financeiro — cada um com os dados dele.',
  },
];

export function areasForCategory(category: string | null): PortalArea[] {
  return PORTAL_AREAS.filter((a) => a.category === category);
}

/** Categorias externas que têm alguma área (usado no @ExternalOnly). */
export function areaCategories(): string[] {
  return [...new Set(PORTAL_AREAS.map((a) => a.category))];
}
