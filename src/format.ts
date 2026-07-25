const shekel = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

const plain = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

export function money(value: number): string {
  return shekel.format(Math.round(value));
}

export function number(value: number): string {
  return plain.format(Math.round(value));
}

const dayMonth = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' });
const monthName = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' });

export function shortDate(iso: string): string {
  return dayMonth.format(new Date(iso));
}

export function monthLabel(iso: string): string {
  return monthName.format(new Date(iso));
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function isSameMonth(iso: string, reference: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === reference.getFullYear() && d.getMonth() === reference.getMonth();
}

export function todayIso(): string {
  return new Date().toISOString();
}
