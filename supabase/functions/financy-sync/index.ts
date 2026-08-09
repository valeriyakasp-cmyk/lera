/**
 * financy-sync — מושך יתרות ותנועות מ-Financy ושומר אותן בסופהבייס.
 *
 * הפונקציה רצה על השרת של סופהבייס, ולא בדפדפן. זו הנקודה החשובה:
 * ה-clientSecret נשאר כאן ולעולם לא מגיע לאתר. התיעוד של Financy אומר
 * את זה במפורש — "Keep it server-side — never expose it to the browser."
 *
 * הפונקציה קוראת בלבד. אין בה שום קריאה ל-/v2/payments.
 *
 * משתני סביבה שצריך להגדיר ב-Supabase → Edge Functions → Secrets:
 *   FINANCY_CLIENT_ID
 *   FINANCY_CLIENT_SECRET
 *   FINANCY_USER_ID
 */

const OAUTH = 'https://api.open-finance.ai/oauth/token';
const API   = 'https://api.open-finance.ai/v2';

type Json = Record<string, unknown>;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** טוקן חי ל-24 שעות. שומרים אותו בזיכרון כדי לא לבקש חדש בכל קריאה. */
let cached: { token: string; until: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;

  const clientId     = Deno.env.get('FINANCY_CLIENT_ID');
  const clientSecret = Deno.env.get('FINANCY_CLIENT_SECRET');
  const userId       = Deno.env.get('FINANCY_USER_ID');
  if (!clientId || !clientSecret || !userId) {
    throw new Error('חסרים משתני סביבה: FINANCY_CLIENT_ID / FINANCY_CLIENT_SECRET / FINANCY_USER_ID');
  }

  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret, userId }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`אימות מול Financy נכשל (${res.status}): ${body.slice(0, 300)}`);

  const data = JSON.parse(body) as { accessToken: string; expiresIn?: number };
  if (!data.accessToken) throw new Error('התשובה מ-Financy לא הכילה accessToken');

  cached = { token: data.accessToken, until: Date.now() + (data.expiresIn ?? 86400) * 1000 };
  return cached.token;
}

async function api(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => { if (v) url.searchParams.set(k, v); });

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} החזיר ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

/** שולף את כל העמודים, עם תקרה כדי שלא ניתקע בלולאה. */
async function all(path: string, token: string, params: Record<string, string> = {}) {
  const items: Json[] = [];
  let nextPage = '';
  for (let page = 0; page < 20; page++) {
    const res = await api(path, token, { ...params, limit: '200', ...(nextPage ? { nextPage } : {}) });
    items.push(...(res.items ?? []));
    nextPage = res.nextPage ?? '';
    if (!nextPage) break;
  }
  return items;
}

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const token = await getToken();

    const since = new URL(req.url).searchParams.get('since')
      ?? new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);

    const connections = await all('/connections', token);
    const accounts    = await all('/data/accounts', token);
    const txns        = await all('/data/transactions', token, { dateFrom: since, dateTo: today, sort: '-1' });

    /* ---- מנקים לצורה שהאתר מבין ---- */
    const cleanAccounts = accounts.map((a: any) => ({
      id: a.id,
      connection_id: a.connectionId ?? null,
      name: a.name ?? a.accountName ?? a.description ?? 'חשבון',
      type: a.accountType ?? a.type ?? null,
      mask: a.accountNumber ?? a.mask ?? null,
      balance:  num(a.balance?.amount ?? a.balance ?? a.currentBalance?.amount),
      currency: a.balance?.currency ?? a.currency ?? 'ILS',
    }));

    const cleanTxns = txns.map((t: any) => ({
      id: t.id ?? t.SK,
      account_id: t.accountId ?? null,
      kind: t.type ?? null,                      // BANK או CARD
      happened_on: t.date?.transactionDate ?? t.date?.bookingDate ?? t.date?.valueDate ?? null,
      booked_on:   t.date?.bookingDate ?? null,
      amount:   num(t.amount?.chargedAmount?.amount ?? t.amount?.originalAmount?.amount ?? t.amount),
      currency: t.amount?.chargedAmount?.currency ?? 'ILS',
      description: t.description?.description ?? t.description ?? '',
      note: t.description?.additionalInfo ?? null,
      merchant: t.merchantName ?? null,
      // הקטגוריה שהמשתמש קבע גוברת על זו שהמערכת זיהתה
      category: t.changedCategory?.main ?? t.category?.main ?? null,
      subcategory: t.changedCategory?.sub ?? t.category?.sub ?? null,
      installment: t.installments?.number ?? null,
      installments: t.installments?.total ?? null,
    })).filter((t: any) => t.id && t.happened_on);

    const checking = cleanAccounts.filter((a) => !a.type || a.type === 'CHECKING');
    const cards    = cleanAccounts.filter((a) => a.type === 'CARD');

    /* ---- חיובים קרובים של כרטיסי אשראי ----
       הבנק לא מחזיר תאריך חיוב מפורש, אז מרכיבים אותו משני מקורות:
       היתרה שנצברה בכל כרטיס, והתשלומים שנותרו בעסקאות בתשלומים. */
    const upcoming: Json[] = [];

    cards.forEach((c) => {
      if (!c.balance) return;
      upcoming.push({
        source: 'card', card_id: c.id, label: c.name,
        amount: Math.abs(c.balance), currency: c.currency,
        on: null, note: 'צבירה נוכחית בכרטיס',
      });
    });

    const byMonth = new Map<string, { amount: number; count: number }>();
    cleanTxns.forEach((t: any) => {
      if (!t.installments || !t.installment || t.installments <= t.installment) return;
      const left = t.installments - t.installment;
      const base = new Date(t.happened_on);
      for (let k = 1; k <= Math.min(left, 12); k++) {
        const d = new Date(base.getFullYear(), base.getMonth() + k, base.getDate());
        const key = d.toISOString().slice(0, 10);
        const cur = byMonth.get(key) ?? { amount: 0, count: 0 };
        cur.amount += Math.abs(t.amount);
        cur.count += 1;
        byMonth.set(key, cur);
      }
    });
    [...byMonth.entries()].sort().forEach(([on, v]) => upcoming.push({
      source: 'installments', label: `${v.count} תשלומים`, amount: v.amount,
      currency: 'ILS', on, note: 'עסקאות בתשלומים',
    }));

    return json({
      ok: true,
      fetched_at: new Date().toISOString(),
      connections: connections.map((c: any) => ({
        id: c.id, provider: c.providerId, status: c.status,
        accounts: c.accounts, cards: c.cards, expires: c.expiryDate,
      })),
      accounts: cleanAccounts,
      cards,
      transactions: cleanTxns,
      upcoming,
      // היתרה בעו״ש היא העוגן שהקופות מתחלקות עליו
      checking_total: checking.reduce((n, a) => n + a.balance, 0),
      cards_total: cards.reduce((n, a) => n + Math.abs(a.balance), 0),
    });
  } catch (err) {
    return json({ ok: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});
