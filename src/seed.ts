import type { AppState } from './types';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * נתוני פתיחה כדי שהמסכים יהיו קריאים בהרצה ראשונה.
 * ניתן לאיפוס מתוך טאב "קופות".
 */
export const seedState: AppState = {
  clients: [
    { id: 'c1', name: 'סמסונג ישראל', terms: { kind: 'net', days: 60 } },
    { id: 'c2', name: 'סטודיו אורבן', terms: { kind: 'half', days: 30 } },
    { id: 'c3', name: 'מאפיית לחם ארז', terms: { kind: 'net', days: 30 } },
  ],
  invoices: [
    { id: 'i1', clientId: 'c1', amount: 18500, issuedAt: daysAgo(75), status: 'open' },
    { id: 'i2', clientId: 'c2', amount: 9400, issuedAt: daysAgo(20), status: 'open' },
    { id: 'i3', clientId: 'c3', amount: 4200, issuedAt: daysAgo(8), status: 'open' },
    {
      id: 'i4',
      clientId: 'c1',
      amount: 12000,
      issuedAt: daysAgo(95),
      status: 'paid',
      paidAt: daysAgo(6),
    },
  ],
  expenses: [
    {
      id: 'e1',
      vendor: 'Adobe',
      amount: 289,
      category: 'תוכנות',
      at: daysAgo(4),
      scope: 'business',
      hasReceipt: true,
      sentToAccountant: false,
    },
    {
      id: 'e2',
      vendor: 'פז יעל',
      amount: 410,
      category: 'רכב',
      at: daysAgo(6),
      scope: 'business',
      hasReceipt: true,
      sentToAccountant: false,
    },
    {
      id: 'e3',
      vendor: 'ארומה',
      amount: 62,
      category: 'פגישות',
      at: daysAgo(9),
      scope: 'business',
      hasReceipt: false,
      sentToAccountant: false,
    },
    {
      id: 'e4',
      vendor: 'שופרסל',
      amount: 520,
      category: 'אחר',
      at: daysAgo(3),
      scope: 'personal',
      hasReceipt: false,
      sentToAccountant: false,
    },
  ],
  videos: [
    {
      id: 'v1',
      url: 'https://www.instagram.com/reel/example-1/',
      title: 'מעבר עריכה בקאט מהיר',
      note: 'שלוש סצנות שנחתכות על הביט',
      potential: 5,
      done: false,
      savedAt: daysAgo(2),
    },
    {
      id: 'v2',
      url: 'https://www.instagram.com/reel/example-2/',
      title: 'יום בחיי פרילנסרית',
      note: 'טיימלאפס של שולחן העבודה',
      potential: 3,
      done: true,
      savedAt: daysAgo(12),
    },
  ],
  shopping: [
    { id: 's1', name: 'רקע לצילום', estimate: 320, bought: false },
    { id: 's2', name: 'כרטיס זיכרון', estimate: 180, bought: false },
  ],
  vaults: { business: 6200, savings: 0, savingsGoal: 10000 },
  split: { savings: 50, business: 25, fun: 25 },
  allocatedMonths: [],
};

export const emptyState: AppState = {
  clients: [],
  invoices: [],
  expenses: [],
  videos: [],
  shopping: [],
  vaults: { business: 0, savings: 0, savingsGoal: 10000 },
  split: { savings: 50, business: 25, fun: 25 },
  allocatedMonths: [],
};

export const categories = [
  'תוכנות',
  'רכב',
  'פגישות',
  'ציוד',
  'שיווק',
  'משרד',
  'אחר',
] as const;
