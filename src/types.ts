export type PaymentTerms =
  | { kind: 'net'; days: number }
  | { kind: 'half'; days: number }
  | { kind: 'custom'; days: number };

export type Client = {
  id: string;
  name: string;
  terms: PaymentTerms;
};

export type InvoiceStatus = 'open' | 'paid';

export type Invoice = {
  id: string;
  clientId: string;
  amount: number;
  /** ISO date — היום שבו הוצאה החשבונית */
  issuedAt: string;
  status: InvoiceStatus;
  paidAt?: string;
};

export type ExpenseScope = 'business' | 'personal';

export type Expense = {
  id: string;
  vendor: string;
  amount: number;
  category: string;
  at: string;
  scope: ExpenseScope;
  /** נשמר גם במדף הרו"ח */
  hasReceipt: boolean;
  sentToAccountant: boolean;
};

export type Video = {
  id: string;
  url: string;
  title: string;
  note: string;
  /** פוטנציאל 1–5 */
  potential: number;
  done: boolean;
  savedAt: string;
};

export type ShoppingItem = {
  id: string;
  name: string;
  estimate: number;
  bought: boolean;
};

export type Split = {
  savings: number;
  business: number;
  fun: number;
};

export type Vaults = {
  business: number;
  savings: number;
  savingsGoal: number;
};

export type AppState = {
  clients: Client[];
  invoices: Invoice[];
  expenses: Expense[];
  videos: Video[];
  shopping: ShoppingItem[];
  vaults: Vaults;
  split: Split;
  /** חודשים שכבר חולקו, בפורמט YYYY-MM */
  allocatedMonths: string[];
};

/** תשלום צפוי בודד על ציר הזמן. */
export type ExpectedPayment = {
  invoiceId: string;
  clientName: string;
  amount: number;
  dueAt: string;
  late: boolean;
};
