import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { emptyState, seedState } from './seed';
import type {
  AppState,
  Client,
  Expense,
  Invoice,
  PaymentTerms,
  ShoppingItem,
  Split,
  Video,
} from './types';

const STORAGE_KEY = 'bizflow.state.v1';
const LEARNED_KEY = 'bizflow.categories.v1';

type Store = {
  state: AppState;
  ready: boolean;
  addClient: (name: string, terms: PaymentTerms) => Client;
  addInvoice: (clientId: string, amount: number, issuedAt?: string) => void;
  togglePaid: (invoiceId: string) => void;
  addExpense: (input: {
    vendor: string;
    amount: number;
    category?: string;
    scope?: Expense['scope'];
    hasReceipt?: boolean;
  }) => void;
  setExpenseCategory: (expenseId: string, category: string) => void;
  toggleExpenseScope: (expenseId: string) => void;
  markSentToAccountant: () => number;
  addVideo: (input: { url: string; title: string; note: string; potential: number }) => void;
  toggleVideoDone: (videoId: string) => void;
  setVideoPotential: (videoId: string, potential: number) => void;
  addShoppingItem: (name: string, estimate: number) => void;
  markBought: (itemId: string) => void;
  removeShoppingItem: (itemId: string) => void;
  deposit: (target: 'business' | 'savings', amount: number) => void;
  setSplit: (split: Split) => void;
  allocate: (net: number, monthKey: string) => void;
  guessCategory: (vendor: string) => string;
  resetToSeed: () => void;
};

const StoreContext = createContext<Store | null>(null);

function id(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** מפת ספק→קטגוריה שנלמדת מכל תיקון ידני. */
type Learned = Record<string, string>;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const [ready, setReady] = useState(false);
  const learned = useRef<Learned>({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [raw, rawLearned] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(LEARNED_KEY),
        ]);
        if (cancelled) return;
        if (rawLearned) learned.current = JSON.parse(rawLearned) as Learned;
        setState(raw ? (JSON.parse(raw) as AppState) : seedState);
      } catch {
        if (!cancelled) setState(seedState);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const persistLearned = useCallback(() => {
    AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(learned.current)).catch(() => {});
  }, []);

  const guessCategory = useCallback((vendor: string): string => {
    const key = vendor.trim().toLowerCase();
    if (learned.current[key]) return learned.current[key];

    const rules: Array<[RegExp, string]> = [
      [/adobe|figma|canva|notion|google|apple|dropbox/i, 'תוכנות'],
      [/פז|דלק|סונול|delek|יילו|חניון/i, 'רכב'],
      [/ארומה|קפה|קופי|לנדוור|מסעדה/i, 'פגישות'],
      [/ksp|ivory|אולסייל|מחסני חשמל/i, 'ציוד'],
      [/facebook|meta|tiktok|קמפיין/i, 'שיווק'],
      [/דואר|אופיס|סטימצקי/i, 'משרד'],
    ];
    for (const [pattern, category] of rules) {
      if (pattern.test(vendor)) return category;
    }
    return 'אחר';
  }, []);

  const value = useMemo<Store>(() => {
    const update = (fn: (prev: AppState) => AppState) => setState(fn);

    return {
      state,
      ready,
      guessCategory,

      addClient(name, terms) {
        const client: Client = { id: id('c'), name: name.trim(), terms };
        update((prev) => ({ ...prev, clients: [client, ...prev.clients] }));
        return client;
      },

      addInvoice(clientId, amount, issuedAt) {
        const invoice: Invoice = {
          id: id('i'),
          clientId,
          amount,
          issuedAt: issuedAt ?? new Date().toISOString(),
          status: 'open',
        };
        update((prev) => ({ ...prev, invoices: [invoice, ...prev.invoices] }));
      },

      togglePaid(invoiceId) {
        update((prev) => ({
          ...prev,
          invoices: prev.invoices.map((i) =>
            i.id !== invoiceId
              ? i
              : i.status === 'paid'
                ? { ...i, status: 'open', paidAt: undefined }
                : { ...i, status: 'paid', paidAt: new Date().toISOString() },
          ),
        }));
      },

      addExpense({ vendor, amount, category, scope = 'business', hasReceipt = false }) {
        const expense: Expense = {
          id: id('e'),
          vendor: vendor.trim(),
          amount,
          category: category ?? guessCategory(vendor),
          at: new Date().toISOString(),
          scope,
          hasReceipt,
          sentToAccountant: false,
        };
        update((prev) => ({ ...prev, expenses: [expense, ...prev.expenses] }));
      },

      setExpenseCategory(expenseId, category) {
        update((prev) => {
          const expense = prev.expenses.find((e) => e.id === expenseId);
          if (expense) {
            learned.current[expense.vendor.trim().toLowerCase()] = category;
            persistLearned();
          }
          return {
            ...prev,
            expenses: prev.expenses.map((e) => (e.id === expenseId ? { ...e, category } : e)),
          };
        });
      },

      toggleExpenseScope(expenseId) {
        update((prev) => ({
          ...prev,
          expenses: prev.expenses.map((e) =>
            e.id === expenseId
              ? { ...e, scope: e.scope === 'business' ? 'personal' : 'business' }
              : e,
          ),
        }));
      },

      markSentToAccountant() {
        let count = 0;
        update((prev) => {
          const expenses = prev.expenses.map((e) => {
            if (e.hasReceipt && !e.sentToAccountant) {
              count += 1;
              return { ...e, sentToAccountant: true };
            }
            return e;
          });
          return { ...prev, expenses };
        });
        return count;
      },

      addVideo({ url, title, note, potential }) {
        const video: Video = {
          id: id('v'),
          url: url.trim(),
          title: title.trim(),
          note: note.trim(),
          potential,
          done: false,
          savedAt: new Date().toISOString(),
        };
        update((prev) => ({ ...prev, videos: [video, ...prev.videos] }));
      },

      toggleVideoDone(videoId) {
        update((prev) => ({
          ...prev,
          videos: prev.videos.map((v) => (v.id === videoId ? { ...v, done: !v.done } : v)),
        }));
      },

      setVideoPotential(videoId, potential) {
        update((prev) => ({
          ...prev,
          videos: prev.videos.map((v) => (v.id === videoId ? { ...v, potential } : v)),
        }));
      },

      addShoppingItem(name, estimate) {
        const item: ShoppingItem = { id: id('s'), name: name.trim(), estimate, bought: false };
        update((prev) => ({ ...prev, shopping: [item, ...prev.shopping] }));
      },

      /** סימון "נקנה" הופך את הפריט להוצאה עסקית. */
      markBought(itemId) {
        update((prev) => {
          const item = prev.shopping.find((s) => s.id === itemId);
          if (!item || item.bought) return prev;

          const expense: Expense = {
            id: id('e'),
            vendor: item.name,
            amount: item.estimate,
            category: guessCategory(item.name),
            at: new Date().toISOString(),
            scope: 'business',
            hasReceipt: false,
            sentToAccountant: false,
          };

          return {
            ...prev,
            shopping: prev.shopping.map((s) => (s.id === itemId ? { ...s, bought: true } : s)),
            expenses: [expense, ...prev.expenses],
          };
        });
      },

      removeShoppingItem(itemId) {
        update((prev) => ({
          ...prev,
          shopping: prev.shopping.filter((s) => s.id !== itemId),
        }));
      },

      deposit(target, amount) {
        update((prev) => ({
          ...prev,
          vaults: { ...prev.vaults, [target]: prev.vaults[target] + amount },
        }));
      },

      setSplit(split) {
        update((prev) => ({ ...prev, split }));
      },

      allocate(net, key) {
        update((prev) => {
          if (prev.allocatedMonths.includes(key)) return prev;
          const savings = Math.round((net * prev.split.savings) / 100);
          const business = Math.round((net * prev.split.business) / 100);
          return {
            ...prev,
            vaults: {
              ...prev.vaults,
              savings: prev.vaults.savings + savings,
              business: prev.vaults.business + business,
            },
            allocatedMonths: [...prev.allocatedMonths, key],
          };
        });
      },

      resetToSeed() {
        learned.current = {};
        persistLearned();
        setState(seedState);
      },
    };
  }, [state, ready, guessCategory, persistLearned]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
