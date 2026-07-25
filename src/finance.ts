import type {
  AppState,
  Client,
  ExpectedPayment,
  Invoice,
  PaymentTerms,
} from './types';
import { isSameMonth } from './format';

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** שוטף+N — סוף החודש שבו הוצאה החשבונית, ועוד N ימים. */
function endOfMonthPlus(issued: Date, days: number): Date {
  const endOfMonth = new Date(issued.getFullYear(), issued.getMonth() + 1, 0);
  return addDays(endOfMonth, days);
}

/**
 * תאריכי הצפי של חשבונית, נגזרים מתנאי התשלום של הלקוח.
 * זו כל האוטומציה שהמשתמשת אף פעם לא נשאלת עליה שוב.
 */
export function scheduleFor(
  invoice: Invoice,
  terms: PaymentTerms,
): Array<{ amount: number; dueAt: Date }> {
  const issued = new Date(invoice.issuedAt);

  if (terms.kind === 'half') {
    return [
      { amount: invoice.amount / 2, dueAt: issued },
      { amount: invoice.amount / 2, dueAt: endOfMonthPlus(issued, terms.days) },
    ];
  }

  if (terms.kind === 'custom') {
    return [{ amount: invoice.amount, dueAt: addDays(issued, terms.days) }];
  }

  return [{ amount: invoice.amount, dueAt: endOfMonthPlus(issued, terms.days) }];
}

export function expectedPayments(state: AppState, now = new Date()): ExpectedPayment[] {
  const byId = new Map<string, Client>(state.clients.map((c) => [c.id, c]));
  const rows: ExpectedPayment[] = [];

  for (const invoice of state.invoices) {
    if (invoice.status === 'paid') continue;
    const client = byId.get(invoice.clientId);
    if (!client) continue;

    for (const part of scheduleFor(invoice, client.terms)) {
      rows.push({
        invoiceId: invoice.id,
        clientName: client.name,
        amount: part.amount,
        dueAt: part.dueAt.toISOString(),
        late: part.dueAt.getTime() < now.getTime(),
      });
    }
  }

  return rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

export function expectedTotal(state: AppState, now = new Date()): number {
  return expectedPayments(state, now).reduce((sum, row) => sum + row.amount, 0);
}

export function lateCount(state: AppState, now = new Date()): number {
  return expectedPayments(state, now).filter((row) => row.late).length;
}

/** נכנס בפועל החודש — חשבוניות שסומנו כשולמו. */
export function incomeThisMonth(state: AppState, now = new Date()): number {
  return state.invoices
    .filter((i) => i.status === 'paid' && i.paidAt && isSameMonth(i.paidAt, now))
    .reduce((sum, i) => sum + i.amount, 0);
}

export function spentThisMonth(state: AppState, now = new Date()): number {
  return state.expenses
    .filter((e) => e.scope === 'business' && isSameMonth(e.at, now))
    .reduce((sum, e) => sum + e.amount, 0);
}

export function netThisMonth(state: AppState, now = new Date()): number {
  return incomeThisMonth(state, now) - spentThisMonth(state, now);
}

export function byCategory(
  state: AppState,
  now = new Date(),
): Array<{ category: string; amount: number }> {
  const totals = new Map<string, number>();
  for (const expense of state.expenses) {
    if (expense.scope !== 'business' || !isSameMonth(expense.at, now)) continue;
    totals.set(expense.category, (totals.get(expense.category) ?? 0) + expense.amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function openAmountFor(state: AppState, clientId: string, now = new Date()): number {
  return expectedPayments(state, now)
    .filter((row) => {
      const invoice = state.invoices.find((i) => i.id === row.invoiceId);
      return invoice?.clientId === clientId;
    })
    .reduce((sum, row) => sum + row.amount, 0);
}

export function termsLabel(terms: PaymentTerms): string {
  if (terms.kind === 'half') return `50/50 · שוטף+${terms.days}`;
  if (terms.kind === 'custom') return `${terms.days} ימים`;
  return `שוטף+${terms.days}`;
}
