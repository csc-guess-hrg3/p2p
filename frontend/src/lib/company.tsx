import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';
import type { Company } from './types';

const ACTIVE_KEY = 'p2p_company';

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  setActiveCompany: (id: string) => void;
}

const CompanyContext = createContext<CompanyContextValue | undefined>(
  undefined,
);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => (await api.get<Company[]>('/companies')).data,
    enabled: !!user,
  });
  const [activeId, setActiveId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_KEY),
  );

  const activeCompany =
    companies.find((c) => c.id === activeId) ?? companies[0] ?? null;

  const setActiveCompany = (id: string) => {
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveId(id);
  };

  return (
    <CompanyContext.Provider
      value={{ companies, activeCompany, setActiveCompany }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx)
    throw new Error('useCompany deve ser usado dentro de CompanyProvider');
  return ctx;
}
