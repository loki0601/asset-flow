'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Account, Holding } from '@/lib/schema';
import { accountsRepo, holdingsRepo } from '@/lib/repos';
import { useCurrentUserId } from '@/components/AuthProvider';

/**
 * Single source of truth for holdings + accounts arrays.  Without this
 * provider, every `useHoldingsView()` call re-runs `repos.list()` (each is
 * a JSON parse from sql.js) — multiplied by the 3+ instances per page
 * (Dashboard's HeroBalance / FlowChart / HoldingsList, Portfolio's page +
 * donut, etc.) that was a measurable tax on every tab change.
 *
 * The provider does one read per `refresh()` and pushes the same arrays to
 * every subscriber.  `useHoldingsView()` consumes from here instead of the
 * repos directly.
 */
interface HoldingsData {
  holdings: Holding[];
  accounts: Account[];
  loaded: boolean;
  refresh: () => void;
}

const Ctx = createContext<HoldingsData>({
  holdings: [],
  accounts: [],
  loaded: false,
  refresh: () => {},
});

export function HoldingsDataProvider({ children }: { children: React.ReactNode }) {
  const userId = useCurrentUserId();
  const [holdings, setHoldings] = useState<Holding[]>(() =>
    userId ? holdingsRepo.list(userId) : [],
  );
  const [accounts, setAccounts] = useState<Account[]>(() =>
    userId ? accountsRepo.list(userId) : [],
  );
  const [loaded, setLoaded] = useState<boolean>(() => Boolean(userId));

  // Re-seed whenever the signed-in user changes (login, signup, logout).
  useEffect(() => {
    if (!userId) {
      setHoldings([]);
      setAccounts([]);
      setLoaded(false);
      return;
    }
    setHoldings(holdingsRepo.list(userId));
    setAccounts(accountsRepo.list(userId));
    setLoaded(true);
  }, [userId]);

  const refresh = useCallback(() => {
    if (!userId) return;
    setHoldings(holdingsRepo.list(userId));
    setAccounts(accountsRepo.list(userId));
  }, [userId]);

  const value = useMemo<HoldingsData>(
    () => ({ holdings, accounts, loaded, refresh }),
    [holdings, accounts, loaded, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHoldingsData(): HoldingsData {
  return useContext(Ctx);
}
