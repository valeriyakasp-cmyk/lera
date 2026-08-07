/* ============================================================
   המשימות שלי — app logic
   Offline-first: every change writes to localStorage immediately
   and is queued for Supabase. Cloud is source of truth on load.
   ============================================================ */

const LS = {
  tasks:    'tasks.v1',
  queue:    'queue.v1',
  cfg:      'cfg.v1',
  ui:       'ui.v1',
  clients:  'clients.v1',
  subs:     'subs.v1',
  expenses: 'expenses.v1',
  income:   'income.v1',
  pots:     'pots.v1',
  txns:     'txns.v1',
  goals:    'goals.v1',
};

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const uid = () =>
  (crypto.randomUUID?.() ??
   'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
     const r = Math.random() * 16 | 0;
     return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
   }));

const read  = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* ---------- dates ---------- */
const isoDate = (d = new Date()) => {
  const t = new Date(d);
  t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
  return t.toISOString().slice(0, 10);
};
const shiftDate = (iso, days) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
};
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const heDate = iso => new Date(iso + 'T12:00:00')
  .toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
const heDayName = iso => 'יום ' + HE_DAYS[new Date(iso + 'T12:00:00').getDay()];

function relativeLabel(iso) {
  const today = isoDate();
  if (iso === today)                return 'היום';
  if (iso === shiftDate(today, -1)) return 'אתמול';
  if (iso === shiftDate(today,  1)) return 'מחר';
  return heDate(iso);
}

/** Whose app this is — used by the greeting. */
const OWNER = 'לרה';

function greeting() {
  const h = new Date().getHours();
  const part =
    h < 5  ? 'לילה טוב'    :
    h < 12 ? 'בוקר טוב'    :
    h < 17 ? 'צהריים טובים' :
    h < 21 ? 'ערב טוב'     : 'לילה טוב';
  return `${part} ${OWNER}`;
}

/* ---------- clock helpers ---------- */

/** 'HH:MM' in local time, from a Date or an ISO string. */
const hhmm = d => {
  const t = d instanceof Date ? d : new Date(d);
  return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
};

/** 'HH:MM' on a given calendar day → ISO timestamp. */
function isoAt(dateIso, time) {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  const d = new Date(dateIso + 'T00:00:00');
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/** Minutes between two ISO timestamps, or null when either is missing. */
function minutesBetween(a, b) {
  if (!a || !b) return null;
  const diff = Math.round((new Date(b) - new Date(a)) / 60000);
  return diff >= 0 ? diff : null;
}

/** 95 → "שעה ו־35 דק׳" */
function humanDuration(mins) {
  if (mins == null) return '';
  if (mins < 60) return `${mins} דק׳`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hp = h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
  return m ? `${hp} ו־${m} דק׳` : hp;
}

/** Stable pastel per client name, so a client always looks the same. */
function clientHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/* ============================================================
   STATE
   ============================================================ */
/** Fill in fields added after a task was first saved, so older rows behave. */
const normalize = t => ({
  client: null, planned_at: null, started_at: null, finished_at: null, moved_from: null,
  ...t,
  subtasks: (t.subtasks ?? []).map(s => ({ status: null, ...s })),
});

/** Postgres `numeric` can arrive as a string — coerce so maths stays maths. */
const normalizeSub = s => ({ ...s, amount: Number(s.amount) || 0, billing_day: Number(s.billing_day) || 1 });
const normalizeExp = e => ({ ...e, amount: Number(e.amount) || 0, pot_id: e.pot_id ?? null, settled_by: e.settled_by ?? null });
const normalizeInc = i => ({ ...i, amount: Number(i.amount) || 0 });
const normalizePot = p => ({ ...p, share: Number(p.share) || 0, position: Number(p.position) || 0 });
const normalizeTxn = t => ({ ...t, amount: Number(t.amount) || 0 });
const normalizeGoal = g => ({ ...g, target: Number(g.target) || 0, position: Number(g.position) || 0 });

const state = {
  date:     isoDate(),
  tasks:    read(LS.tasks, []).map(normalize),
  subs:     read(LS.subs, []),
  expenses: read(LS.expenses, []),
  income:   read(LS.income, []),
  pots:     read(LS.pots, []),
  txns:     read(LS.txns, []),
  goals:    read(LS.goals, []),
  queue:    read(LS.queue, []),
  cfg:      read(LS.cfg, { url: '', key: '' }),
  ui:       read(LS.ui, { doneOpen: true }),
  user:     null,
  sb:       null,
  status:   'local',   // local | syncing | synced | error
  earlier:  [],        // open tasks from previous dates
};

const persist = () => {
  write(LS.tasks, state.tasks);
  write(LS.subs, state.subs);
  write(LS.expenses, state.expenses);
  write(LS.income, state.income);
  write(LS.pots, state.pots);
  write(LS.txns, state.txns);
  write(LS.goals, state.goals);
  write(LS.queue, state.queue);
};

/* ---------- money ---------- */
/** מינוס נכתב לפני השקל, אחרת הוא נדחק לצד הלא נכון בעברית. */
const money = n => {
  const v = Number(n) || 0;
  const body = '₪' + Math.abs(v).toLocaleString('he-IL', {
    minimumFractionDigits: Number.isInteger(Math.abs(v)) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? '−' + body : body;
};

/** 'YYYY-MM' for an ISO date (or today). */
const monthOf = (iso = isoDate()) => iso.slice(0, 7);

const heMonth = ym => new Date(ym + '-15T12:00:00')
  .toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

/** Step a 'YYYY-MM' by n months. */
function shiftMonth(ym, n) {
  const d = new Date(ym + '-15T12:00:00');
  d.setMonth(d.getMonth() + n);
  return isoDate(d).slice(0, 7);
}

const sum = (rows, pick) => rows.reduce((n, r) => n + Number(pick(r) || 0), 0);

const byDate = d => state.tasks
  .filter(t => t.task_date === d)
  .sort((a, b) => a.position - b.position);

const nextPosition = d => {
  const rows = byDate(d);
  return rows.length ? Math.max(...rows.map(t => t.position)) + 1 : 0;
};

/* ============================================================
   MUTATIONS  (local write → queue → flush)
   ============================================================ */
function touch(task) { touchRow('tasks', task); }

/** Stamp a row and queue it for the cloud. Works for any of the three tables. */
function touchRow(table, row) {
  row.updated_at = new Date().toISOString();
  queueOp({ type: 'upsert', table, id: row.id });
  persist();
}

function queueOp(op) {
  op.table ??= 'tasks';
  state.queue = state.queue.filter(o => !(o.id === op.id && (o.table ?? 'tasks') === op.table));
  state.queue.push(op);
  write(LS.queue, state.queue);
  flush();
}

function addTask(title) {
  const task = {
    id: uid(),
    task_date: state.date,
    title: title.trim(),
    done: false,
    completed_at: null,
    status: null,        // null | 'doing' | 'waiting'
    collapsed: true,
    position: nextPosition(state.date),
    subtasks: [],
    client: null,        // free-text client tag
    planned_at: null,    // 'HH:MM' — when it is meant to happen
    started_at: null,    // ISO — filled from the completion sheet
    finished_at: null,   // ISO — stamped the moment it is checked off
    moved_from: null,    // the day it was pushed forward from
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.tasks.push(task);
  touch(task);
  return task;
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  queueOp({ type: 'delete', table: 'tasks', id });
  persist();
}

/* ============================================================
   SUBSCRIPTIONS & EXPENSES
   A subscription is the *definition* — what it costs and when it
   bills. Every month it is active it stamps a row into expenses,
   so cancelling later never erases what was already paid.
   ============================================================ */
function addSubscription({ name, amount, billing_day, active, started_on, payer }) {
  const sub = {
    id: uid(),
    name: name.trim(),
    amount: Number(amount) || 0,
    billing_day: Math.min(28, Math.max(1, Number(billing_day) || 1)),
    active: active !== false,
    started_on: started_on ?? isoDate().slice(0, 8) + '01',
    cancelled_on: null,
    note: null,
    payer: (payer ?? '').trim() || null,   // ריק = את משלמת
    position: state.subs.length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.subs.push(sub);
  touchRow('subscriptions', sub);
  return sub;
}

function updateSubscription(sub, patch) {
  const wasActive = sub.active;
  const wasPayer  = sub.payer ?? null;
  Object.assign(sub, patch);
  if (wasActive && sub.active === false && !sub.cancelled_on) sub.cancelled_on = isoDate();
  if (sub.active) sub.cancelled_on = null;
  touchRow('subscriptions', sub);

  // אם שינית מי משלם — גם החיובים שכבר נרשמו מתעדכנים,
  // אחרת ההיסטוריה תסתור את מה שכתוב במנוי
  if ((sub.payer ?? null) !== wasPayer) {
    state.expenses.forEach(e => {
      if (e.subscription_id !== sub.id) return;
      e.payer = sub.payer ?? null;
      touchRow('expenses', e);
    });
  }
}

/** Deleting the definition keeps the charges — they are the record. */
function deleteSubscription(id) {
  state.subs = state.subs.filter(s => s.id !== id);
  state.expenses.forEach(e => {
    if (e.subscription_id === id) { e.subscription_id = null; touchRow('expenses', e); }
  });
  queueOp({ type: 'delete', table: 'subscriptions', id });
  persist();
}

function addExpense({ title, amount, spend_date, client, kind, subscription_id, period, payer, pot_id }) {
  const exp = {
    id: uid(),
    spend_date: spend_date ?? state.date,
    title: (title ?? '').trim(),
    amount: Number(amount) || 0,
    kind: kind ?? 'oneoff',
    subscription_id: subscription_id ?? null,
    period: period ?? null,
    client: (client ?? '').trim() || null,
    note: null,
    payer: (payer ?? '').trim() || null,
    pot_id: pot_id ?? null,
    settled_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.expenses.push(exp);
  if (exp.client) rememberClient(exp.client);
  touchRow('expenses', exp);
  return exp;
}

function updateExpense(exp, patch) {
  Object.assign(exp, patch);
  if (exp.client) rememberClient(exp.client);
  touchRow('expenses', exp);
}

function deleteExpense(id) {
  clearTxnsOf(id);
  state.expenses = state.expenses.filter(e => e.id !== id);
  queueOp({ type: 'delete', table: 'expenses', id });
  persist();
}

/* ---------- income ---------- */

function addIncome({ client, title, amount, received_on }) {
  const inc = {
    id: uid(),
    received_on: received_on ?? state.date,
    client: (client ?? '').trim() || null,
    title: (title ?? '').trim() || null,
    amount: Number(amount) || 0,
    note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.income.push(inc);
  if (inc.client) rememberClient(inc.client);
  touchRow('income', inc);
  return inc;
}

function updateIncome(inc, patch) {
  Object.assign(inc, patch);
  if (inc.client) rememberClient(inc.client);
  touchRow('income', inc);
}

function deleteIncome(id) {
  clearTxnsOf(id);
  state.expenses.forEach(e => {
    if (e.settled_by === id) { e.settled_by = null; touchRow('expenses', e); }
  });
  state.income = state.income.filter(i => i.id !== id);
  queueOp({ type: 'delete', table: 'income', id });
  persist();
}

const incomeOn = date => state.income.filter(i => i.received_on === date)
                                     .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
const incomeIn = ym   => state.income.filter(i => (i.received_on ?? '').slice(0, 7) === ym);

/**
 * מה באמת יצא מהכיס שלך. חיוב שמישהו אחר משלם נשאר מתועד,
 * אבל לא נספר כאן — אחרת הרווח יֵצא נמוך ממה שהוא.
 */
const isMine   = e => !e.payer;
const myOutlay = list => sum(list.filter(isMine), e => e.amount);

/* ============================================================
   קופות — עובר ושב מחולק
   היתרה של קופה היא תמיד סכום התנועות שלה, אף פעם לא מספר שמור.
   ככה אי אפשר שהיתרה והתנועות יסתרו זו את זו.
   ============================================================ */

// שלושת הגוונים עברו את בדיקת עיוורון הצבעים, ולכל קופה גם שם כתוב לידה
const DEFAULT_POTS = [
  { name: 'חיסכון אישי', share: 50, colour: '#8B5CF6' },
  { name: 'קופה עסקית',  share: 25, colour: '#2E86C1' },
  { name: 'בזבוזים',     share: 25, colour: '#0F8A57' },
];

const potsByPos  = ()   => state.pots.slice().sort((a, b) => a.position - b.position);
const potById    = id   => state.pots.find(p => p.id === id) ?? null;
const txnsOfPot  = id   => state.txns.filter(t => t.pot_id === id);
const potBalance = id   => sum(txnsOfPot(id), t => t.amount);
const accountTotal = () => sum(state.txns, t => t.amount);
const businessPot  = () => state.pots.find(p => p.name === 'קופה עסקית') ?? potsByPos()[0] ?? null;
const funPot       = () => state.pots.find(p => p.name === 'בזבוזים')   ?? potsByPos()[0] ?? null;

function addPot({ name, share, colour, position }) {
  const pot = {
    id: uid(),
    name: (name ?? '').trim(),
    share: Number(share) || 0,
    colour: colour ?? null,
    position: position ?? state.pots.length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.pots.push(pot);
  touchRow('pots', pot);
  return pot;
}

function updatePot(pot, patch) { Object.assign(pot, patch); touchRow('pots', pot); }

/** מוחקים קופה — התנועות שלה עוברות לקופה אחרת, כדי שהסך הכולל לא ישתנה. */
function deletePot(id, moveTo = null) {
  const target = moveTo ?? potsByPos().find(p => p.id !== id)?.id ?? null;
  state.txns.forEach(t => {
    if (t.pot_id !== id) return;
    if (target) { t.pot_id = target; touchRow('pot_txns', t); }
  });
  if (!target) {
    state.txns = state.txns.filter(t => t.pot_id !== id);
  }
  state.goals.forEach(g => { if (g.pot_id === id) { g.pot_id = target; touchRow('goals', g); } });
  state.pots = state.pots.filter(p => p.id !== id);
  queueOp({ type: 'delete', table: 'pots', id });
  persist();
}

function addTxn({ pot_id, amount, happened_on, kind, title, source_id, note }) {
  const t = {
    id: uid(),
    pot_id,
    happened_on: happened_on ?? state.date,
    amount: Math.round((Number(amount) || 0) * 100) / 100,
    kind: kind ?? 'manual',
    title: (title ?? '').trim() || null,
    source_id: source_id ?? null,
    note: note ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.txns.push(t);
  touchRow('pot_txns', t);
  return t;
}

function deleteTxn(id) {
  state.txns = state.txns.filter(t => t.id !== id);
  queueOp({ type: 'delete', table: 'pot_txns', id });
  persist();
}

/** מוחק את כל התנועות שנוצרו אוטומטית ממקור מסוים (הכנסה או הוצאה). */
function clearTxnsOf(sourceId) {
  state.txns.filter(t => t.source_id === sourceId).forEach(t => deleteTxn(t.id));
}

/* ------------------------------------------------------------
   קיזוז הוצאות
   הוצאה נספרת בדיוק פעם אחת: או שירדה מקופה (תנועה שלילית),
   או שקוזזה מהכנסה לפני החלוקה. שתי הדרכים לעולם לא יחד.
   ------------------------------------------------------------ */

/** האם ההוצאה כבר ירדה מקופה? */
const paidFromPot = e => state.txns.some(t => t.source_id === e.id && t.kind === 'expense');

/** הוצאה שעדיין לא ירדה משום מקום — היא מחכה לקיזוז מההכנסה הבאה. */
const isUnsettled = e => isMine(e) && e.amount > 0 && !e.settled_by && !paidFromPot(e);

/** הוצאות החודש שעדיין לא קוזזו, מהישנה לחדשה. */
const unsettledIn = ym => state.expenses
  .filter(e => (e.spend_date ?? '').slice(0, 7) === ym && isUnsettled(e))
  .sort((a, b) => (a.spend_date ?? '').localeCompare(b.spend_date ?? ''));

/** ההוצאה יורדת עכשיו מקופה — תנועה שלילית אמיתית ביומן. */
function payFromPot(exp, potId) {
  clearTxnsOf(exp.id);
  if (exp.settled_by) { exp.settled_by = null; touchRow('expenses', exp); }
  exp.pot_id = potId;
  touchRow('expenses', exp);
  addTxn({
    pot_id: potId, amount: -exp.amount, happened_on: exp.spend_date,
    kind: 'expense', title: exp.title, source_id: exp.id,
  });
}

/** משחרר הוצאה מקיזוז, בין אם ירדה מקופה ובין אם קוזזה מהכנסה. */
function unsettleExpense(exp) {
  clearTxnsOf(exp.id);
  if (exp.settled_by || exp.pot_id) {
    exp.settled_by = null;
    exp.pot_id = null;
    touchRow('expenses', exp);
  }
}

/**
 * רושם את חלוקת ההכנסה: מסמן את ההוצאות שקוזזו ממנה,
 * ומכניס לקופות רק את מה שנשאר. בטוח להרצה חוזרת.
 */
function applyIncomeSplit(inc, { settledIds = [], parts = null } = {}) {
  clearTxnsOf(inc.id);
  state.expenses.forEach(e => {
    if (e.settled_by === inc.id && !settledIds.includes(e.id)) {
      e.settled_by = null;
      touchRow('expenses', e);
    }
  });

  const settled = settledIds.map(id => state.expenses.find(e => e.id === id)).filter(Boolean);
  settled.forEach(e => {
    if (e.settled_by === inc.id) return;
    clearTxnsOf(e.id);          // אם היא ירדה קודם מקופה — מבטלים, כדי לא לספור פעמיים
    e.settled_by = inc.id;
    e.pot_id = null;
    touchRow('expenses', e);
  });

  const deducted = sum(settled, e => e.amount);
  const net = Math.round((inc.amount - deducted) * 100) / 100;
  if (net <= 0) return { deducted, net: Math.max(0, net) };

  const list = parts ?? splitAmount(net);
  list.forEach(({ pot, amount }) => {
    if (!amount) return;
    addTxn({
      pot_id: pot.id, amount, happened_on: inc.received_on,
      kind: 'split', title: inc.client ?? inc.title ?? 'תקבול', source_id: inc.id,
    });
  });
  return { deducted, net };
}

/** כמה מהכנסה מסוימת באמת חולק, וכמה ירד ממנה בקיזוז. */
const splitOf = inc => {
  const deducted = sum(state.expenses.filter(e => e.settled_by === inc.id), e => e.amount);
  return { deducted, net: sum(state.txns.filter(t => t.source_id === inc.id), t => t.amount) };
};

/**
 * מחלק סכום בין הקופות לפי האחוזים.
 * השארית מהעיגול הולכת לקופה הגדולה ביותר, כדי שסכום החלקים
 * יהיה תמיד בדיוק הסכום המקורי ולא אגורה פחות.
 */
function splitAmount(total) {
  const pots = potsByPos().filter(p => p.share > 0);
  if (!pots.length) return [];
  const shareSum = sum(pots, p => p.share) || 100;
  const cents = Math.round((Number(total) || 0) * 100);

  const parts = pots.map(p => ({ pot: p, cents: Math.floor(cents * p.share / shareSum) }));
  const drift = cents - sum(parts, x => x.cents);
  if (drift) {
    const biggest = parts.reduce((a, b) => (b.pot.share > a.pot.share ? b : a), parts[0]);
    biggest.cents += drift;
  }
  return parts.map(x => ({ pot: x.pot, amount: x.cents / 100 })).filter(x => x.amount !== 0);
}

/**
 * יתרת פתיחה — מכניס לכל קופה את הסכום שנקבע לה, פעם אחת.
 * מזוהה לפי kind='opening', כך שהרצה חוזרת לא תכפיל אותה.
 */
function seedOpening(allocations, on = isoDate()) {
  state.txns.filter(t => t.kind === 'opening').forEach(t => deleteTxn(t.id));
  allocations.forEach(({ pot_id, amount }) => {
    if (!amount) return;
    addTxn({ pot_id, amount, happened_on: on, kind: 'opening', title: 'יתרת פתיחה' });
  });
}

/* ---------- יעדי חיסכון ---------- */
function addGoal({ pot_id, title, target }) {
  const g = {
    id: uid(),
    pot_id: pot_id ?? null,
    title: (title ?? '').trim(),
    target: Number(target) || 0,
    done: false,
    position: state.goals.length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.goals.push(g);
  touchRow('goals', g);
  return g;
}
function updateGoal(g, patch) { Object.assign(g, patch); touchRow('goals', g); }
function deleteGoal(id) {
  state.goals = state.goals.filter(g => g.id !== id);
  queueOp({ type: 'delete', table: 'goals', id });
  persist();
}
const goalsOfPot = id => state.goals.filter(g => g.pot_id === id)
                                    .sort((a, b) => a.position - b.position);

/**
 * Write the missing monthly charges for every subscription, from the
 * month it started up to the current month. Runs on load and after any
 * change — it only ever adds what is not already there.
 */
function ensureCharges() {
  const thisMonth = monthOf();
  const today = Number(isoDate().slice(8, 10));
  let added = 0;

  for (const sub of state.subs) {
    const from = monthOf(sub.started_on ?? sub.created_at?.slice(0, 10) ?? isoDate());
    const until = sub.active ? thisMonth : monthOf(sub.cancelled_on ?? thisMonth);

    let ym = from;
    for (let guard = 0; guard < 36 && ym <= until && ym <= thisMonth; guard++) {
      const already = state.expenses.some(e => e.subscription_id === sub.id && e.period === ym);
      // the current month only counts once the billing day has arrived
      const due = ym < thisMonth || sub.billing_day <= today;
      if (!already && due) {
        addExpense({
          title: sub.name,
          amount: sub.amount,
          spend_date: `${ym}-${String(sub.billing_day).padStart(2, '0')}`,
          kind: 'subscription',
          subscription_id: sub.id,
          period: ym,
          payer: sub.payer ?? null,
        });
        added++;
      }
      ym = shiftMonth(ym, 1);
    }
  }
  return added;
}

/* ---------- expense queries ---------- */
const expensesOn    = date => state.expenses.filter(e => e.spend_date === date)
                                            .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
const expensesIn    = ym   => state.expenses.filter(e => (e.spend_date ?? '').slice(0, 7) === ym);
const monthlyActive = ()   => sum(state.subs.filter(s => s.active && !s.payer), s => s.amount);

/** Toggling the parent cascades to every subtask — predictable both ways. */
function setTaskDone(task, done) {
  const now = new Date().toISOString();
  task.done = done;
  task.completed_at = done ? now : null;
  task.finished_at  = done ? now : null;
  if (!done) task.started_at = null;
  task.subtasks = task.subtasks.map(s => ({ ...s, done, status: done ? null : s.status ?? null }));
  if (done) { task.collapsed = true; task.status = null; }
  touch(task);
}

/** 'doing' | 'waiting' | null. Selecting the active status clears it. */
function setTaskStatus(task, status) {
  task.status = task.status === status ? null : status;
  touch(task);
}

/** A subtask's status bubbles up: the parent shows whatever the subtask says. */
function setSubStatus(task, subId, status) {
  const sub = task.subtasks.find(s => s.id === subId);
  if (!sub) return;
  sub.status = sub.status === status ? null : status;
  // the parent mirrors the most recent explicit signal from its subtasks
  task.status = sub.status ?? (task.subtasks.find(s => s.status)?.status ?? null);
  touch(task);
}

/** Free-text client tag. Empty string clears it. */
function setTaskClient(task, client) {
  const v = (client ?? '').trim();
  task.client = v || null;
  if (v) rememberClient(v);
  touch(task);
}

/** 'HH:MM' or null — the hour the task is meant to happen. */
function setTaskPlanned(task, time) {
  task.planned_at = time || null;
  touch(task);
}

/** Persist the finished/started pair captured by the completion sheet. */
function setTaskTimes(task, startedIso, finishedIso) {
  task.started_at  = startedIso  ?? null;
  task.finished_at = finishedIso ?? null;
  touch(task);
}

/** Rewrite `position` from the current visual order of the active list. */
function applyOrder(ids) {
  ids.forEach((id, i) => {
    const t = state.tasks.find(x => x.id === id);
    if (t && t.position !== i) { t.position = i; touch(t); }
  });
}

/**
 * Reschedule to another day — appended to the end of the target day.
 * Pushing a task forward leaves a trace on the day it came from, so that
 * day still shows what was planned for it and did not get done.
 */
function moveTask(task, date) {
  const from = task.task_date;
  task.moved_from = date > from ? (task.moved_from ?? from) : null;
  task.task_date = date;
  task.position = Date.now();
  touch(task);
}

/** Toggling a subtask rolls up: all done → parent done; any open → parent open. */
function setSubDone(task, subId, done) {
  const sub = task.subtasks.find(s => s.id === subId);
  if (!sub) return;
  sub.done = done;

  if (done) sub.status = null;

  const all = task.subtasks.length > 0 && task.subtasks.every(s => s.done);
  if (all && !task.done) {
    task.done = true;
    task.completed_at = new Date().toISOString();
    task.finished_at  = task.completed_at;
    task.collapsed = true;
    task.status = null;
  } else if (!all && task.done) {
    task.done = false;
    task.completed_at = null;
    task.finished_at  = null;
    task.started_at   = null;
  }
  touch(task);
}

function addSub(task, title) {
  task.subtasks.push({ id: uid(), title: title.trim(), done: false, status: null });
  // A new open subtask reopens a completed parent.
  if (task.done) { task.done = false; task.completed_at = null; }
  touch(task);
}

function deleteSub(task, subId) {
  task.subtasks = task.subtasks.filter(s => s.id !== subId);
  if (task.subtasks.length && task.subtasks.every(s => s.done) && !task.done) {
    task.done = true;
    task.completed_at = new Date().toISOString();
    task.finished_at  = task.completed_at;
    task.status = null;
  }
  touch(task);
}

/* ============================================================
   CLIENTS — the list builds itself from what you type
   ============================================================ */
function rememberClient(name) {
  const v = name.trim();
  if (!v) return;
  const list = read(LS.clients, []).filter(c => c.toLowerCase() !== v.toLowerCase());
  list.unshift(v);
  write(LS.clients, list.slice(0, 40));
}

/** Known clients: recently typed first, then anything seen on a task. */
function knownClients() {
  const seen = new Map();
  read(LS.clients, []).forEach(c => seen.set(c.toLowerCase(), c));
  state.tasks.forEach(t => { if (t.client) seen.set(t.client.toLowerCase(), t.client); });
  return [...seen.values()];
}

/* ============================================================
   RENDER
   ============================================================ */
const el = {
  heroEyebrow: $('#heroEyebrow'),
  heroTitle:   $('#heroTitle'),
  dateLabel:   $('#dateLabel'),
  datePicker:  $('#datePicker'),
  todayBtn:    $('#todayBtn'),
  statOpen:    $('#statOpen'),
  statDone:    $('#statDone'),
  statTotal:   $('#statTotal'),
  statPct:     $('#statPct'),
  addForm:     $('#addForm'),
  addInput:    $('#addInput'),
  activeList:  $('#activeList'),
  doneList:    $('#doneList'),
  doneSection: $('#doneSection'),
  doneToggle:  $('#doneToggle'),
  doneCount:   $('#doneCount'),
  emptyState:  $('#emptyState'),
  carryover:   $('#carryover'),
  carryText:   $('#carryoverText'),
  syncChip:    $('#syncChip'),
  footStatus:  $('#footStatus'),
  toast:       $('#toast'),
  movedSection:$('#movedSection'),
  movedList:   $('#movedList'),
  movedTitle:  $('#movedHeading'),
  spendList:   $('#spendList'),
  spendAdd:    $('#spendAdd'),
  spendTitle:  $('#spendHeading'),
  incomeList:  $('#incomeList'),
  incomeAdd:   $('#incomeAdd'),
  incomeTitle: $('#incomeHeading'),
};

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev:  '<svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x:     '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  plus:  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  more:  '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="19" r="1.7" fill="currentColor"/></svg>',
  cal:   '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="16" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
  next:  '<svg viewBox="0 0 24 24" fill="none"><path d="M13 6l-6 6 6 6M17 6v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grip:  '<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.6V12l3 1.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tag:   '<svg viewBox="0 0 24 24" fill="none"><path d="M3.5 11.2V4.6a1 1 0 011-1h6.6a1 1 0 01.71.3l8.1 8.1a1 1 0 010 1.42l-6.6 6.6a1 1 0 01-1.42 0l-8.1-8.1a1 1 0 01-.29-.72z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7.9" cy="7.9" r="1.4" fill="currentColor"/></svg>',
  pencil:'<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L20 8a2.1 2.1 0 00-3-3L5 17v3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14.5 6.5L17.5 9.5" stroke="currentColor" stroke-width="1.7"/></svg>',
};

/** Status vocabulary. `null` is the implicit "open" state and has no pill. */
const STATUS = {
  doing:   { label: 'בעבודה' },
  waiting: { label: 'בהמתנה' },
};

/** Without a cloud connection the carry-over list comes from the local cache. */
function localEarlier() {
  return state.tasks
    .filter(t => !t.done && t.task_date < state.date)
    .map(({ id, task_date, title }) => ({ id, task_date, title }));
}

function render() {
  closeMenu();   // the node it is anchored to is about to be replaced
  const rows   = byDate(state.date);
  const active = rows.filter(t => !t.done);
  const done   = rows.filter(t => t.done)
                     .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));

  /* --- header --- */
  const isToday = state.date === isoDate();
  el.heroEyebrow.textContent = heDayName(state.date) + ' · ' + heDate(state.date);
  el.heroTitle.textContent   = isToday ? greeting() : relativeLabel(state.date);
  el.dateLabel.textContent   = relativeLabel(state.date);
  el.datePicker.value        = state.date;
  el.todayBtn.hidden         = isToday;

  /* --- stats --- */
  const pct = rows.length ? Math.round(done.length / rows.length * 100) : 0;
  el.statOpen.textContent  = active.length;
  el.statDone.textContent  = done.length;
  el.statTotal.textContent = '/' + rows.length;
  el.statPct.textContent   = pct;

  /* --- lists --- */
  el.activeList.replaceChildren(...active.map(taskNode));
  el.doneList.replaceChildren(...done.map(taskNode));

  el.emptyState.hidden   = rows.length > 0;
  el.doneSection.hidden  = done.length === 0;
  el.doneCount.textContent = done.length;
  el.doneList.hidden     = !state.ui.doneOpen;
  el.doneToggle.setAttribute('aria-expanded', String(state.ui.doneOpen));

  /* --- carry-over --- */
  const source = state.user ? state.earlier : localEarlier();
  const carry = source.filter(t => t.task_date < state.date);
  state.earlier = source;
  el.carryover.hidden = !(isToday && carry.length);
  el.carryText.innerHTML = carry.length === 1
    ? '<strong>משימה אחת</strong> נשארה פתוחה מימים קודמים'
    : `<strong>${carry.length} משימות</strong> נשארו פתוחות מימים קודמים`;

  /* --- pushed forward off this day: still part of the day's story --- */
  const moved = pushedFrom(state.date);
  el.movedSection.hidden = moved.length === 0;
  el.movedTitle.textContent = moved.length
    ? `הועברו ליום אחר · ${moved.length}`
    : 'הועברו ליום אחר';
  el.movedList.replaceChildren(...moved.map(movedNode));

  renderSpend();
  renderIncome();
}

/** Open tasks that were planned for `date` but pushed to a later day. */
const pushedFrom = date => state.tasks
  .filter(t => t.moved_from === date && t.task_date > date && !t.done)
  .sort((a, b) => (a.task_date ?? '').localeCompare(b.task_date ?? ''));

/** A read-only echo of a task that left this day, with a way to pull it back. */
function movedNode(task) {
  const li = document.createElement('li');
  li.className = 'task task--moved';
  li.dataset.id = task.id;

  const row = document.createElement('div');
  row.className = 'task__row';

  const icon = document.createElement('span');
  icon.className = 'moved__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = ICON.next;

  const main = document.createElement('div');
  main.className = 'task__main';

  const title = document.createElement('span');
  title.className = 'task__title task__title--static';
  title.textContent = task.title;
  main.append(title);

  const meta = document.createElement('div');
  meta.className = 'task__meta';

  const when = document.createElement('span');
  when.className = 'chip chip--moved';
  when.textContent = 'הועברה ל' + relativeLabel(task.task_date);
  meta.append(when);

  const total = task.subtasks.length;
  if (total) {
    const c = document.createElement('span');
    c.className = 'chip';
    c.textContent = `${task.subtasks.filter(s => s.done).length}/${total}`;
    c.title = 'תת־משימות שהושלמו';
    meta.append(c);
  }
  if (task.client) {
    const c = document.createElement('span');
    c.className = 'chip chip--client';
    c.style.setProperty('--hue', clientHue(task.client));
    c.textContent = task.client;
    meta.append(c);
  }
  main.append(meta);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'moved__back';
  back.textContent = 'החזרה';
  back.title = `החזרת המשימה ל${relativeLabel(state.date)}`;
  back.addEventListener('click', () => doMove(task, state.date));

  row.append(icon, main, back);
  li.append(row);
  return li;
}

/** The day's spending, right under the task lists. */
function renderSpend() {
  const rows = expensesOn(state.date);
  const total = sum(rows, e => e.amount);

  el.spendTitle.textContent = rows.length
    ? `הוצאות היום · ${money(total)}`
    : 'הוצאות היום';

  el.spendList.replaceChildren(...rows.map(exp => {
    const li = document.createElement('li');
    li.className = 'spend__row' + (exp.kind === 'subscription' ? ' is-sub' : '');

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'spend__label';
    label.textContent = exp.title;
    label.title = exp.kind === 'subscription' ? 'חיוב מנוי חודשי' : 'עריכת ההוצאה';
    label.addEventListener('click', () => openExpSheet(exp));
    li.append(label);

    if (exp.kind === 'subscription') {
      const tag = document.createElement('span');
      tag.className = 'spend__kind';
      tag.textContent = 'מנוי';
      li.append(tag);
    }
    if (exp.client) {
      const c = document.createElement('span');
      c.className = 'chip chip--client';
      c.style.setProperty('--hue', clientHue(exp.client));
      c.textContent = exp.client;
      li.append(c);
    }

    const amt = document.createElement('span');
    amt.className = 'spend__amount';
    amt.dir = 'ltr';
    amt.textContent = money(exp.amount);
    li.append(amt);

    return li;
  }));
}

/** כסף שנכנס ביום שנבחר. */
function renderIncome() {
  if (!el.incomeList) return;               // HTML ישן מהמטמון
  const rows = incomeOn(state.date);
  const total = sum(rows, i => i.amount);

  el.incomeTitle.textContent = rows.length ? `כסף שנכנס · ${money(total)}` : 'כסף שנכנס';

  el.incomeList.replaceChildren(...rows.map(inc => {
    const li = document.createElement('li');
    li.className = 'spend__row is-income';

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'spend__label';
    label.textContent = inc.client ?? inc.title ?? 'תקבול';
    label.title = 'עריכת התקבול';
    label.addEventListener('click', () => openIncSheet(inc));
    li.append(label);

    if (inc.client && inc.title) {
      const t = document.createElement('span');
      t.className = 'spend__kind';
      t.textContent = inc.title;
      li.append(t);
    }

    const amt = document.createElement('span');
    amt.className = 'spend__amount spend__amount--in';
    amt.dir = 'ltr';
    amt.textContent = '+' + money(inc.amount);
    li.append(amt);

    return li;
  }));
}

function taskNode(task) {
  const total = task.subtasks.length;
  const doneN = task.subtasks.filter(s => s.done).length;
  const open  = !task.collapsed;

  const li = document.createElement('li');
  li.className = 'task' + (task.done ? ' is-done' : '') + (open ? ' is-open' : '');
  li.dataset.id = task.id;

  /* ---- main row ---- */
  const row = document.createElement('div');
  row.className = 'task__row';

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'check';
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(task.done));
  check.setAttribute('aria-label', task.done ? 'סימון כלא הושלמה' : 'סימון כהושלמה');
  check.innerHTML = ICON.check;
  check.addEventListener('click', () => {
    const turningOn = !task.done;
    setTaskDone(task, turningOn);
    if (turningOn) completeTask(task, li);
    else animateOut(li, render);
  });

  const main = document.createElement('div');
  main.className = 'task__main';

  const title = document.createElement('input');
  title.className = 'task__title';
  title.value = task.title;
  title.setAttribute('aria-label', 'שם המשימה');
  title.addEventListener('change', () => commitTitle(task, title));
  title.addEventListener('blur',   () => commitTitle(task, title));
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); title.blur(); }
    if (e.key === 'Escape') { title.value = task.title; title.blur(); }
  });
  main.append(title);

  /* ---- meta strip: status · planned hour · client · tracked time ---- */
  const meta = document.createElement('div');
  meta.className = 'task__meta';

  if (task.status && !task.done) {
    const pill = document.createElement('span');
    pill.className = `status status--${task.status}`;
    pill.innerHTML = '<span class="status__dot" aria-hidden="true"></span>';
    pill.append(STATUS[task.status].label);
    meta.append(pill);
  }

  if (task.planned_at && !task.done) {
    const t = document.createElement('span');
    t.className = 'chip chip--time';
    t.innerHTML = `<span class="chip__icon" aria-hidden="true">${ICON.clock}</span><span dir="ltr">${task.planned_at}</span>`;
    t.title = 'שעת ביצוע מתוכננת';
    meta.append(t);
  }

  const mins = minutesBetween(task.started_at, task.finished_at);
  if (task.done && mins != null) {
    const d = document.createElement('span');
    d.className = 'chip chip--dur';
    d.innerHTML = `<span class="chip__icon" aria-hidden="true">${ICON.clock}</span>`;
    d.append(humanDuration(mins));
    d.title = `${hhmm(task.started_at)}–${hhmm(task.finished_at)}`;
    meta.append(d);
  }

  if (task.client) {
    const c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip chip--client';
    c.style.setProperty('--hue', clientHue(task.client));
    c.textContent = task.client;
    c.title = 'שינוי הלקוח';
    c.addEventListener('click', e => { e.stopPropagation(); openClientSheet(task); });
    meta.append(c);
  }

  if (meta.childElementCount) main.append(meta);

  const actions = document.createElement('div');
  actions.className = 'task__actions';

  if (total) {
    const count = document.createElement('span');
    count.className = 'task__count';
    count.textContent = `${doneN}/${total}`;
    count.title = `${doneN} מתוך ${total} תת־משימות הושלמו`;
    actions.append(count);
  }

  const chev = document.createElement('button');
  chev.type = 'button';
  chev.className = 'task__btn task__btn--chev';
  chev.setAttribute('aria-expanded', String(open));
  chev.setAttribute('aria-label', open ? 'סגירת תת־משימות' : 'פתיחת תת־משימות');
  chev.innerHTML = ICON.chev;
  chev.addEventListener('click', () => {
    task.collapsed = !task.collapsed;
    touch(task);
    render();
    if (!task.collapsed) $(`.task[data-id="${task.id}"] .subadd input`)?.focus();
  });

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'task__btn task__btn--more';
  more.setAttribute('aria-label', 'אפשרויות למשימה');
  more.setAttribute('aria-haspopup', 'menu');
  more.innerHTML = ICON.more;
  more.addEventListener('click', e => { e.stopPropagation(); openMenu(task, more); });

  actions.append(chev, more);

  if (!task.done) {
    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'task__grip';
    grip.setAttribute('aria-label', 'גרירה לשינוי הסדר');
    grip.innerHTML = ICON.grip;
    grip.addEventListener('pointerdown', e => startDrag(e, li));
    row.append(grip);
  }

  row.append(check, main, actions);
  li.append(row);

  /* ---- subtasks ---- */
  const subs = document.createElement('div');
  subs.className = 'subs';

  const list = document.createElement('div');
  list.className = 'subs__list';
  task.subtasks.forEach(sub => list.append(subNode(task, sub)));
  subs.append(list);

  const form = document.createElement('form');
  form.className = 'subadd';
  form.innerHTML = `<span class="subadd__icon" aria-hidden="true">${ICON.plus}</span>`;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'הוספת תת־משימה…';
  input.setAttribute('aria-label', 'תת־משימה חדשה');
  input.maxLength = 300;
  form.append(input);
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    addSub(task, v);
    render();
    const next = $(`.task[data-id="${task.id}"] .subadd input`);
    next?.focus();
  });
  subs.append(form);
  li.append(subs);

  return li;
}

function subNode(task, sub) {
  const div = document.createElement('div');
  div.className = 'sub' + (sub.done ? ' is-done' : '');

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'check check--sm';
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(sub.done));
  check.setAttribute('aria-label', sub.done ? 'סימון כלא הושלמה' : 'סימון כהושלמה');
  check.innerHTML = ICON.check;
  check.addEventListener('click', () => {
    const wasDone = task.done;
    setSubDone(task, sub.id, !sub.done);
    if (!wasDone && task.done) completeTask(task, $(`.task[data-id="${task.id}"]`));
    else render();
  });

  const title = document.createElement('input');
  title.className = 'sub__title';
  title.value = sub.title;
  title.setAttribute('aria-label', 'שם תת־המשימה');
  const commit = () => {
    const v = title.value.trim();
    if (!v) { title.value = sub.title; return; }
    if (v === sub.title) return;
    sub.title = v;
    touch(task);
  };
  title.addEventListener('change', commit);
  title.addEventListener('blur', commit);
  title.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); title.blur(); }
    if (e.key === 'Escape') { title.value = sub.title; title.blur(); }
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'sub__del';
  del.setAttribute('aria-label', 'מחיקת תת־המשימה');
  del.innerHTML = ICON.x;
  del.addEventListener('click', () => {
    const wasDone = task.done;
    deleteSub(task, sub.id);
    if (!wasDone && task.done) animateOut($(`.task[data-id="${task.id}"]`), render);
    else render();
  });

  /* status dot — marking a subtask also marks the parent */
  const st = document.createElement('button');
  st.type = 'button';
  st.className = 'sub__status' + (sub.status ? ` is-${sub.status}` : '');
  st.setAttribute('aria-label', sub.status ? `סטטוס: ${STATUS[sub.status].label}` : 'קביעת סטטוס');
  st.setAttribute('aria-haspopup', 'menu');
  st.innerHTML = '<span class="status__dot" aria-hidden="true"></span>';
  if (sub.status) st.title = STATUS[sub.status].label;
  st.addEventListener('click', e => { e.stopPropagation(); openSubMenu(task, sub, st); });

  div.append(check, title, st, del);
  return div;
}

/** Tiny status picker for a subtask. Whatever you pick, the parent shows too. */
function openSubMenu(task, sub, anchor) {
  const wasOpen = menuEl?.dataset.for === sub.id;
  closeMenu();
  if (wasOpen) return;

  const menu = document.createElement('div');
  menu.className = 'menu menu--mini';
  menu.dataset.for = sub.id;
  menu.setAttribute('role', 'menu');

  const label = document.createElement('div');
  label.className = 'menu__label';
  label.textContent = 'סטטוס תת־המשימה';
  menu.append(label);

  for (const key of ['doing', 'waiting']) {
    const on = sub.status === key;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `menu__item menu__item--status menu__item--${key}`;
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', String(on));
    b.innerHTML =
      `<span class="status__dot" aria-hidden="true"></span><span>${STATUS[key].label}</span>` +
      (on ? `<span class="menu__check">${ICON.check}</span>` : '');
    b.addEventListener('click', () => {
      closeMenu();
      setSubStatus(task, sub.id, key);
      render();
    });
    menu.append(b);
  }

  document.body.append(menu);
  menuEl = menu;
  place(menu, anchor);
  menu.querySelector('.menu__item')?.focus();

  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
}

/* ============================================================
   TASK MENU — status, reschedule, delete
   ============================================================ */
let menuEl = null;

function closeMenu() {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  document.removeEventListener('pointerdown', onOutside, true);
  window.removeEventListener('resize', closeMenu);
  window.removeEventListener('scroll', closeMenu, true);
}
const onOutside = e => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };

function openMenu(task, anchor) {
  const wasOpen = menuEl?.dataset.for === task.id;
  closeMenu();
  if (wasOpen) return;

  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.dataset.for = task.id;
  menu.setAttribute('role', 'menu');

  const item = (cls, html, onClick, attrs = {}) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu__item' + (cls ? ' ' + cls : '');
    b.innerHTML = html;
    Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
    b.addEventListener('click', () => { closeMenu(); onClick(); });
    menu.append(b);
    return b;
  };
  const label = text => {
    const d = document.createElement('div');
    d.className = 'menu__label';
    d.textContent = text;
    menu.append(d);
  };
  const sep = () => menu.append(Object.assign(document.createElement('div'), { className: 'menu__sep' }));

  /* ---- edit ---- */
  item('', `<span class="menu__icon">${ICON.pencil}</span><span>עריכת שם המשימה</span>`, () => {
    const input = $(`.task[data-id="${task.id}"] .task__title`);
    input?.focus();
    input?.select();
  }, { role: 'menuitem' });

  item('', `<span class="menu__icon">${ICON.tag}</span><span>${task.client ? `לקוח · ${task.client}` : 'שיוך ללקוח…'}</span>`,
    () => openClientSheet(task), { role: 'menuitem' });

  if (!task.done) {
    /* planned hour — a real, visible time field so it works on every platform */
    const timeRow = document.createElement('div');
    timeRow.className = 'menu__item menu__item--time';
    timeRow.innerHTML = `<span class="menu__icon">${ICON.clock}</span><span>שעת ביצוע</span>`;
    const ti = document.createElement('input');
    ti.type = 'time';
    ti.dir = 'ltr';
    ti.value = task.planned_at ?? '';
    ti.setAttribute('aria-label', 'שעת ביצוע מתוכננת');
    ti.addEventListener('change', () => {
      setTaskPlanned(task, ti.value);
      render();
      toast(ti.value ? `נקבעה שעה ${ti.value}` : 'השעה הוסרה');
      closeMenu();
    });
    timeRow.append(ti);
    menu.append(timeRow);
  }
  sep();

  /* ---- status ---- */
  if (!task.done) {
    label('סטטוס');
    for (const key of ['doing', 'waiting']) {
      const on = task.status === key;
      item(
        `menu__item--status menu__item--${key}`,
        `<span class="status__dot" aria-hidden="true"></span><span>${STATUS[key].label}</span>` +
        (on ? `<span class="menu__check">${ICON.check}</span>` : ''),
        () => { setTaskStatus(task, key); render(); },
        { role: 'menuitemradio', 'aria-checked': String(on) },
      );
    }
    sep();

    /* ---- reschedule ---- */
    label('לא הספקתי — העברה ליום אחר');
    const today = isoDate();
    const moves = [];
    const push = (text, date) => {
      if (date !== task.task_date && !moves.some(m => m.date === date)) moves.push({ text, date });
    };
    if (task.task_date < today) push('העברה להיום', today);
    push('העברה למחר', shiftDate(task.task_date, 1));

    moves.forEach(m => item(
      '', `<span class="menu__icon">${ICON.next}</span><span>${m.text}</span>`,
      () => doMove(task, m.date), { role: 'menuitem' },
    ));

    item('', `<span class="menu__icon">${ICON.cal}</span><span>בחירת תאריך…</span>`,
      () => openDateSheet(task), { role: 'menuitem' });
    sep();
  }

  /* ---- delete ---- */
  item('menu__item--danger', `<span class="menu__icon">${ICON.trash}</span><span>מחיקת המשימה</span>`, () => {
    deleteTask(task.id);
    animateOut($(`.task[data-id="${task.id}"]`), render);
    toast('המשימה נמחקה');
  }, { role: 'menuitem' });

  document.body.append(menu);
  menuEl = menu;
  place(menu, anchor);
  menu.querySelector('.menu__item')?.focus();

  document.addEventListener('pointerdown', onOutside, true);
  window.addEventListener('resize', closeMenu);
  window.addEventListener('scroll', closeMenu, true);
}

function place(menu, anchor) {
  const a = anchor.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const pad = 8;
  const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
  // hang from the anchor's trailing edge, so the menu opens "inward"
  let left = rtl ? a.right - m.width : a.left;
  left = Math.max(pad, Math.min(left, innerWidth - m.width - pad));
  let top = a.bottom + 6;
  if (top + m.height > innerHeight - pad) top = a.top - m.height - 6;      // flip above
  top = Math.max(pad, Math.min(top, innerHeight - m.height - pad));        // keep on screen
  menu.style.left = left + 'px';
  menu.style.top  = top + 'px';
}

function doMove(task, date) {
  const node = $(`.task[data-id="${task.id}"]`);
  moveTask(task, date);
  animateOut(node, () => { render(); pull().then(render); });
  toast(`המשימה הועברה ל${relativeLabel(date)}`);
}

function commitTitle(task, input) {
  const v = input.value.trim();
  if (!v) { input.value = task.title; return; }
  if (v === task.title) return;
  task.title = v;
  touch(task);
}

function animateOut(node, then) {
  if (!node || matchMedia('(prefers-reduced-motion: reduce)').matches) return then();
  node.classList.add('is-leaving');
  setTimeout(then, 180);
}

let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2400);
}

/* ============================================================
   DRAG TO REORDER
   Pointer events, so one code path covers mouse, pen and touch.
   The dragged card follows the finger; its neighbours slide out
   of the way. Nothing is written until the drop.
   ============================================================ */
let drag = null;

function startDrag(e, li) {
  if (drag || (e.button != null && e.button !== 0)) return;
  e.preventDefault();
  closeMenu();

  const list  = el.activeList;
  const items = [...list.children];
  const from  = items.indexOf(li);
  if (from < 0) return;

  const rects = items.map(n => n.getBoundingClientRect());
  const gap   = rects.length > 1 ? Math.max(0, rects[1].top - rects[0].bottom) : 8;

  drag = { li, items, rects, gap, from, to: from, startY: e.clientY, moved: false };

  li.classList.add('is-dragging');
  document.body.classList.add('is-reordering');
  e.currentTarget.setPointerCapture?.(e.pointerId);

  document.addEventListener('pointermove', onDragMove, { passive: false });
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
}

function onDragMove(e) {
  if (!drag) return;
  e.preventDefault();

  const dy = e.clientY - drag.startY;
  if (Math.abs(dy) > 3) drag.moved = true;
  drag.li.style.transform = `translateY(${dy}px)`;

  const r0     = drag.rects[drag.from];
  const centre = r0.top + r0.height / 2 + dy;
  const last   = drag.rects.length - 1;

  let to = drag.from;
  if (centre <= drag.rects[0].top) to = 0;
  else if (centre >= drag.rects[last].bottom) to = last;
  else {
    for (let i = 0; i <= last; i++) {
      if (i === drag.from) continue;
      const r = drag.rects[i];
      if (centre >= r.top && centre <= r.bottom) { to = i; break; }
    }
  }

  if (to !== drag.to) { drag.to = to; paintShift(); }
}

/** Slide the cards the dragged one is passing over. */
function paintShift() {
  const { items, rects, gap, from, to, li } = drag;
  const step = rects[from].height + gap;
  items.forEach((n, i) => {
    if (n === li) return;
    let shift = 0;
    if (from < to && i > from && i <= to) shift = -step;
    if (from > to && i >= to && i < from) shift =  step;
    n.style.transform = shift ? `translateY(${shift}px)` : '';
  });
}

function endDrag() {
  if (!drag) return;
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', endDrag);
  document.removeEventListener('pointercancel', endDrag);

  const { li, items, from, to, moved } = drag;
  drag = null;

  li.classList.remove('is-dragging');
  document.body.classList.remove('is-reordering');
  items.forEach(n => { n.style.transform = ''; });

  if (!moved || to === from) return;

  const ids = items.map(n => n.dataset.id);
  const [movedId] = ids.splice(from, 1);
  ids.splice(to, 0, movedId);
  applyOrder(ids);
  render();
}

/* ============================================================
   COMPLETION — confetti, then "when did you start?"
   ============================================================ */
function completeTask(task, node) {
  burstConfetti();
  animateOut(node, () => { render(); openDoneSheet(task); });
}

const doneSheet = {
  root:  $('#doneSheet'),
  title: $('#doneSheetTask'),
  quick: $('#doneQuick'),
  start: $('#doneStart'),
  end:   $('#doneEnd'),
  dur:   $('#doneDuration'),
  save:  $('#doneSaveBtn'),
  skip:  $('#doneSkipBtn'),
};
let doneTarget = null;

function openDoneSheet(task) {
  doneTarget = task;
  doneSheet.title.textContent = task.title;

  const end = task.finished_at ? new Date(task.finished_at) : new Date();
  doneSheet.end.value   = hhmm(end);
  doneSheet.start.value = task.started_at ? hhmm(task.started_at) : (task.planned_at ?? '');

  doneSheet.quick.replaceChildren(...[15, 30, 60, 120].map(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quick';
    b.textContent = m < 60 ? `לפני ${m} דק׳` : m === 60 ? 'לפני שעה' : 'לפני שעתיים';
    b.addEventListener('click', () => {
      doneSheet.start.value = hhmm(new Date(end.getTime() - m * 60000));
      updateDuration();
    });
    return b;
  }));

  updateDuration();
  doneSheet.root.hidden = false;
  doneSheet.start.focus();
}

function updateDuration() {
  if (!doneTarget) return;
  const s = isoAt(doneTarget.task_date, doneSheet.start.value);
  const e = isoAt(doneTarget.task_date, doneSheet.end.value);
  const m = minutesBetween(s, e);
  doneSheet.dur.textContent = m == null ? '' : `משך העבודה: ${humanDuration(m)}`;
  doneSheet.dur.hidden = m == null;
}

function closeDoneSheet() {
  doneSheet.root.hidden = true;
  doneTarget = null;
}

doneSheet.start.addEventListener('change', updateDuration);
doneSheet.end.addEventListener('change', updateDuration);

doneSheet.save.addEventListener('click', () => {
  const t = doneTarget;
  if (!t) return closeDoneSheet();
  const s = isoAt(t.task_date, doneSheet.start.value);
  const e = isoAt(t.task_date, doneSheet.end.value) ?? new Date().toISOString();
  setTaskTimes(t, s, e);
  const m = minutesBetween(s, e);
  closeDoneSheet();
  render();
  toast(m == null ? 'נשמר' : `נרשמו ${humanDuration(m)} על המשימה`);
});

doneSheet.skip.addEventListener('click', () => { closeDoneSheet(); render(); });
$$('[data-done-close]').forEach(b => b.addEventListener('click', () => { closeDoneSheet(); render(); }));

/* ============================================================
   RESCHEDULE SHEET
   A real, visible date field. The previous version stretched an
   invisible date input over the menu row, so tapping it did nothing.
   ============================================================ */
const dateSheet = {
  root:  $('#dateSheet'),
  title: $('#dateSheetTask'),
  quick: $('#dateQuick'),
  input: $('#dateInput'),
  save:  $('#dateSaveBtn'),
};
let dateTarget = null;

function openDateSheet(task) {
  // אם ה-HTML שבדפדפן עדיין ישן (מטמון), נופלים חזרה להעברה למחר
  if (!dateSheet.root) return doMove(task, shiftDate(task.task_date, 1));
  dateTarget = task;
  dateSheet.title.textContent = task.title;
  dateSheet.input.value = task.task_date;

  const options = [
    { label: 'היום',      date: isoDate() },
    { label: 'מחר',       date: shiftDate(isoDate(), 1) },
    { label: 'מחרתיים',   date: shiftDate(isoDate(), 2) },
    { label: 'בעוד שבוע', date: shiftDate(isoDate(), 7) },
  ].filter(o => o.date !== task.task_date);

  dateSheet.quick.replaceChildren(...options.map(o => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quick';
    b.textContent = o.label;
    b.addEventListener('click', () => { dateSheet.input.value = o.date; commitDate(); });
    return b;
  }));

  dateSheet.root.hidden = false;
  dateSheet.input.focus();
}

function closeDateSheet() { if (dateSheet.root) dateSheet.root.hidden = true; dateTarget = null; }

function commitDate() {
  const task = dateTarget;
  const date = dateSheet.input?.value;
  if (!task || !date) return closeDateSheet();
  closeDateSheet();
  if (date === task.task_date) return;
  doMove(task, date);
}

dateSheet.save?.addEventListener('click', commitDate);
dateSheet.input?.addEventListener('keydown', e => { if (e.key === 'Enter') commitDate(); });
$$('[data-date-close]').forEach(b => b.addEventListener('click', closeDateSheet));

/* ============================================================
   CLIENT TAG
   ============================================================ */
const clientSheet = {
  root:   $('#clientSheet'),
  input:  $('#clientInput'),
  list:   $('#clientList'),
  recent: $('#clientRecent'),
  save:   $('#clientSaveBtn'),
  clear:  $('#clientClearBtn'),
};
let clientTarget = null;

function openClientSheet(task) {
  clientTarget = task;
  clientSheet.input.value = task.client ?? '';

  const known = knownClients();
  clientSheet.list.replaceChildren(...known.map(c =>
    Object.assign(document.createElement('option'), { value: c })));

  clientSheet.recent.replaceChildren(...known.slice(0, 8).map(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip chip--client chip--pick';
    b.style.setProperty('--hue', clientHue(c));
    b.textContent = c;
    b.addEventListener('click', () => { clientSheet.input.value = c; saveClient(); });
    return b;
  }));
  clientSheet.recent.hidden = known.length === 0;

  clientSheet.root.hidden = false;
  clientSheet.input.focus();
  clientSheet.input.select();
}

function closeClientSheet() { clientSheet.root.hidden = true; clientTarget = null; }

function saveClient() {
  if (!clientTarget) return closeClientSheet();
  const v = clientSheet.input.value;
  setTaskClient(clientTarget, v);
  closeClientSheet();
  render();
  toast(v.trim() ? `שויך ל${v.trim()}` : 'השיוך הוסר');
}

clientSheet.save.addEventListener('click', saveClient);
clientSheet.clear.addEventListener('click', () => {
  if (clientTarget) setTaskClient(clientTarget, '');
  closeClientSheet();
  render();
  toast('השיוך הוסר');
});
clientSheet.input.addEventListener('keydown', e => { if (e.key === 'Enter') saveClient(); });
$$('[data-client-close]').forEach(b => b.addEventListener('click', closeClientSheet));

/* ============================================================
   WALLET — subscriptions and what they actually cost
   ============================================================ */
const walletSheet = { root: $('#walletSheet'), body: $('#walletBody') };
let walletMonth = monthOf();

function openWallet() {
  walletMonth = monthOf();
  renderWallet();
  walletSheet.root.hidden = false;
}
function closeWallet() { walletSheet.root.hidden = true; }

function renderWallet() {
  ensureCharges();

  const rows     = expensesIn(walletMonth);
  const mine     = rows.filter(isMine);
  const theirs   = rows.filter(e => !isMine(e));
  const subRows  = mine.filter(e => e.kind === 'subscription');
  const oneRows  = mine.filter(e => e.kind !== 'subscription');
  const inRows   = incomeIn(walletMonth);

  const earned = sum(inRows, i => i.amount);
  const spent  = sum(mine,   e => e.amount);
  const profit = earned - spent;

  // מנויים מקובצים לפי מי משלם, כך שרואים בנפרד את מה שלא יוצא מהכיס שלך
  const active   = state.subs.filter(s => s.active);
  const inactive = state.subs.filter(s => !s.active);
  const myActive = active.filter(isMine);
  const payers   = [...new Set(active.filter(s => !isMine(s)).map(s => s.payer))].sort();
  const isNow    = walletMonth === monthOf();

  const b = walletSheet.body;
  b.innerHTML = `
    <div class="monthnav">
      <button class="datenav__arrow" id="wPrev" type="button" aria-label="חודש קודם">
        <svg viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="monthnav__label">${esc(heMonth(walletMonth))}</span>
      <button class="datenav__arrow" id="wNext" type="button" aria-label="חודש הבא" ${isNow ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>

    <div class="moneyrow">
      <div class="moneytile moneytile--in">
        <span>נכנס</span>
        <b dir="ltr">${money(earned)}</b>
      </div>
      <div class="moneytile">
        <span>יצא</span>
        <b dir="ltr">${money(spent)}</b>
      </div>
      <div class="moneytile moneytile--profit" data-tone="${profit < 0 ? 'down' : 'up'}">
        <span>${profit < 0 ? 'הפסד' : 'רווח'}</span>
        <b dir="ltr">${money(Math.abs(profit))}</b>
      </div>
    </div>

    <p class="wallet__note">
      מתוך מה שיצא: מנויים <strong dir="ltr">${money(sum(subRows, e => e.amount))}</strong> ·
      חד־פעמי <strong dir="ltr">${money(sum(oneRows, e => e.amount))}</strong><br>
      התחייבות חודשית שוטפת על מנויים פעילים שלך: <strong dir="ltr">${money(monthlyActive())}</strong>
      ${theirs.length ? `<br>מישהו אחר משלם החודש <strong dir="ltr">${money(sum(theirs, e => e.amount))}</strong> — מתועד, לא נספר בהוצאות שלך.` : ''}
    </p>

    <h3 class="rep__h">כסף שנכנס</h3>
    <div id="wIncome"></div>
    <button class="spend__add" id="wAddInc" type="button"><span aria-hidden="true">+</span><span>הוספת תקבול</span></button>

    <h3 class="rep__h">מנויים פעילים</h3>
    <div id="wActive"></div>
    ${payers.map(name => `
      <h3 class="rep__h rep__h--soft">${esc(name)} משלם·ת</h3>
      <div data-payer-box="${esc(name)}"></div>`).join('')}
    ${inactive.length ? '<h3 class="rep__h">מנויים לא פעילים</h3><div id="wInactive"></div>' : ''}
    <button class="spend__add" id="wAddSub" type="button"><span aria-hidden="true">+</span><span>הוספת מנוי</span></button>

    <h3 class="rep__h">הוצאות החודש</h3>
    <div id="wExpenses"></div>
    <button class="spend__add" id="wAddExp" type="button"><span aria-hidden="true">+</span><span>הוספת הוצאה</span></button>`;

  const subNode = sub => {
    const charged = state.expenses.find(e => e.subscription_id === sub.id && e.period === walletMonth);
    const row = document.createElement('div');
    row.className = 'subrow' + (sub.active ? '' : ' is-off');

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'subrow__main';
    main.innerHTML =
      `<span class="subrow__name">${esc(sub.name)}${
        sub.payer ? `<span class="chip chip--payer">${esc(sub.payer)} משלם·ת</span>` : ''
      }</span>` +
      `<span class="subrow__meta">${esc(money(sub.amount))} · חיוב ב-${sub.billing_day} בחודש` +
      (charged ? ' · <b>חויב</b>' : sub.active ? '' : ' · בוטל') + '</span>';
    main.addEventListener('click', () => openSubSheet(sub));

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'switch__track subrow__toggle' + (sub.active ? ' is-on' : '');
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(!!sub.active));
    toggle.setAttribute('aria-label', sub.active ? `כיבוי המנוי ${sub.name}` : `הפעלת המנוי ${sub.name}`);
    toggle.innerHTML = '<span class="switch__knob"></span>';
    toggle.addEventListener('click', () => {
      updateSubscription(sub, { active: !sub.active });
      ensureCharges();
      renderWallet();
      render();
      toast(sub.active ? `${sub.name} פעיל שוב` : `${sub.name} סומן כלא פעיל`);
    });

    row.append(main, toggle);
    return row;
  };

  const activeBox = $('#wActive', b);
  if (myActive.length) activeBox.replaceChildren(...myActive.map(subNode));
  else activeBox.innerHTML = '<p class="wallet__empty">אין מנויים שאת משלמת עליהם החודש.</p>';

  payers.forEach(name => {
    const box = b.querySelector(`[data-payer-box="${CSS.escape(name)}"]`);
    box?.replaceChildren(...active.filter(x => x.payer === name).map(subNode));
  });

  if (inactive.length) $('#wInactive', b).replaceChildren(...inactive.map(subNode));

  /* ---- income rows ---- */
  const incBox = $('#wIncome', b);
  if (inRows.length) {
    incBox.replaceChildren(...inRows
      .slice()
      .sort((x, y) => (x.received_on ?? '').localeCompare(y.received_on ?? ''))
      .map(inc => {
        const r = document.createElement('button');
        r.type = 'button';
        r.className = 'exprow is-income';
        r.innerHTML =
          `<span class="exprow__date" dir="ltr">${esc((inc.received_on ?? '').slice(8, 10))}</span>` +
          `<span class="exprow__title">${esc(inc.client ?? 'תקבול')}${
            inc.title ? ` · <span class="exprow__sub">${esc(inc.title)}</span>` : ''
          }${(() => { const s = splitOf(inc); return s.deducted
              ? `<span class="exprow__sub"> · חולקו ${esc(money(s.net))} אחרי קיזוז ${esc(money(s.deducted))}</span>` : ''; })()}</span>` +
          `<span class="exprow__amount" dir="ltr">${esc(money(inc.amount))}</span>`;
        r.addEventListener('click', () => openIncSheet(inc));
        return r;
      }));
  } else {
    incBox.innerHTML = '<p class="wallet__empty">עוד לא נרשם כסף שנכנס החודש.</p>';
  }

  const expBox = $('#wExpenses', b);
  if (rows.length) {
    expBox.replaceChildren(...rows
      .slice()
      .sort((x, y) => (x.spend_date ?? '').localeCompare(y.spend_date ?? ''))
      .map(exp => {
        const r = document.createElement('button');
        r.type = 'button';
        r.className = 'exprow' + (exp.kind === 'subscription' ? ' is-sub' : '') + (isMine(exp) ? '' : ' is-theirs');
        r.innerHTML =
          `<span class="exprow__date" dir="ltr">${esc((exp.spend_date ?? '').slice(8, 10))}</span>` +
          `<span class="exprow__title">${esc(exp.title)}</span>` +
          (isUnsettled(exp) ? '<span class="chip chip--wait">ממתין לקיזוז</span>' : '') +
          (exp.pot_id ? `<span class="chip chip--pot" style="--pot:${esc(potById(exp.pot_id)?.colour ?? '#3D74A8')}">${esc(potById(exp.pot_id)?.name ?? '')}</span>` : '') +
          (exp.payer ? `<span class="chip chip--payer">${esc(exp.payer)}</span>` : '') +
          (exp.client ? `<span class="chip chip--client" style="--hue:${clientHue(exp.client)}">${esc(exp.client)}</span>` : '') +
          `<span class="exprow__amount" dir="ltr">${esc(money(exp.amount))}</span>`;
        r.addEventListener('click', () => openExpSheet(exp));
        return r;
      }));
  } else {
    expBox.innerHTML = '<p class="wallet__empty">אין הוצאות בחודש הזה.</p>';
  }

  $('#wPrev', b).addEventListener('click', () => { walletMonth = shiftMonth(walletMonth, -1); renderWallet(); });
  $('#wNext', b).addEventListener('click', () => {
    if (walletMonth >= monthOf()) return;
    walletMonth = shiftMonth(walletMonth, 1);
    renderWallet();
  });
  $('#wAddSub', b).addEventListener('click', () => openSubSheet(null));
  $('#wAddInc', b).addEventListener('click', () => openIncSheet(null, walletMonth === monthOf() ? state.date : walletMonth + '-01'));
  $('#wAddExp', b).addEventListener('click', () => openExpSheet(null, walletMonth === monthOf() ? state.date : walletMonth + '-01'));
}


/* ============================================================
   פיננסים — עובר ושב מחולק לקופות
   ============================================================ */
const bankSheet = { root: $('#bankSheet'), body: $('#bankBody') };
let bankPotId = null;

function openBank() {
  if (!bankSheet.root) return;
  if (!state.pots.length) DEFAULT_POTS.forEach((d, i) => addPot({ ...d, position: i }));
  if (!potById(bankPotId)) bankPotId = potsByPos()[0]?.id ?? null;
  renderBank();
  bankSheet.root.hidden = false;
}
function closeBank() { if (bankSheet.root) bankSheet.root.hidden = true; }

/** מספר שמתגלגל מערך לערך — נעים לעין וגם מראה לאן הכסף זז. */
function rollNumber(node, from, to, ms = 700) {
  if (!node) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { node.textContent = money(to); return; }
  const t0 = performance.now();
  const ease = x => 1 - Math.pow(1 - x, 3);
  (function step(now) {
    const k = Math.min(1, (now - t0) / ms);
    node.textContent = money(from + (to - from) * ease(k));
    if (k < 1) requestAnimationFrame(step);
    else node.textContent = money(to);
  })(t0);
}

/** משיכה — מטבעות נופלים מהכרטיס כלפי מטה. שקט יותר מקונפטי, וברור שיצא כסף. */
function coinDrop(anchor) {
  if (!anchor || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = anchor.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'coins';
  document.body.append(layer);

  for (let i = 0; i < 14; i++) {
    const c = document.createElement('span');
    c.className = 'coins__bit';
    c.style.left = `${box.left + box.width * (.2 + Math.random() * .6)}px`;
    c.style.top  = `${box.top + box.height * .55}px`;
    c.style.setProperty('--dx', `${(Math.random() - .5) * 90}px`);
    c.style.setProperty('--dy', `${90 + Math.random() * 90}px`);
    c.style.animationDelay = `${Math.random() * 160}ms`;
    layer.append(c);
  }
  setTimeout(() => layer.remove(), 1400);
}

function renderBank() {
  const pots = potsByPos();
  const total = accountTotal();
  const active = potById(bankPotId) ?? pots[0] ?? null;
  bankPotId = active?.id ?? null;
  const b = bankSheet.body;

  const tiles = pots.map(p => `
    <div class="pottile">
      <span class="pottile__head">
        <i class="pottile__dot" style="background:${esc(p.colour ?? '#3D74A8')}"></i>
        <span>${esc(p.name)}</span>
      </span>
      <b dir="ltr" style="color:${esc(p.colour ?? '#3D74A8')}">${esc(money(potBalance(p.id)))}</b>
    </div>`).join('');

  const pills = pots.map(p => `
    <button class="potpill${p.id === bankPotId ? ' is-on' : ''}" type="button" data-pot="${p.id}"
            style="--pot:${esc(p.colour ?? '#3D74A8')}">${esc(p.name)}</button>`).join('');

  b.innerHTML = `
    <div class="potgrid">${tiles || '<p class="wallet__empty">אין קופות עדיין.</p>'}</div>

    <div class="bank__total">
      <span class="bank__total-label">
        <i class="bank__total-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M3.5 8.5A2.5 2.5 0 016 6h11.5A2.5 2.5 0 0120 8.5v8A2.5 2.5 0 0117.5 19H6a2.5 2.5 0 01-2.5-2.5v-8z" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17" stroke="currentColor" stroke-width="1.8"/></svg>
        </i>
        סה״כ בעו״ש
      </span>
      <b dir="ltr" id="bankTotal">${esc(money(total))}</b>
    </div>

    ${pots.length ? `<div class="potpills">${pills}</div>` : ''}

    ${active ? `
      <div class="potcard" id="potCard" style="--pot:${esc(active.colour ?? '#3D74A8')}">
        <span class="potcard__label">יתרה · ${esc(active.name)}</span>
        <b class="potcard__amount" dir="ltr" id="potAmount">${esc(money(potBalance(active.id)))}</b>
        <div class="potcard__actions">
          <button class="btn btn--pot" id="potDeposit" type="button">הפקדה</button>
          <button class="btn btn--quiet" id="potWithdraw" type="button">משיכה</button>
          <button class="btn btn--quiet" id="potTransfer" type="button">העברה</button>
        </div>
        <button class="potcard__edit" id="potEdit" type="button">${active.share}% מכל הכנסה · עריכה</button>
      </div>

      <h3 class="rep__h">תנועות</h3>
      <div id="potTxns"></div>

      <h3 class="rep__h">יעדים</h3>
      <form class="goaladd" id="goalAdd">
        <input id="goalTitle" type="text" maxlength="120" placeholder="יעד חדש" autocomplete="off">
        <input id="goalTarget" type="number" dir="ltr" min="0" step="1" inputmode="decimal" placeholder="₪">
        <button class="goaladd__btn" type="submit" aria-label="הוספת יעד">+</button>
      </form>
      <div id="potGoals"></div>` : ''}

    <button class="spend__add" id="potAdd" type="button"><span aria-hidden="true">+</span><span>הוספת קופה</span></button>`;

  $$('.potpill', b).forEach(x => x.addEventListener('click', () => { bankPotId = x.dataset.pot; renderBank(); }));
  $('#potAdd', b).addEventListener('click', () => openPotSheet(null));
  if (!active) return;

  $('#potEdit', b).addEventListener('click', () => openPotSheet(active));
  $('#potDeposit', b).addEventListener('click', () => openMoveSheet(active, 'deposit'));
  $('#potWithdraw', b).addEventListener('click', () => openMoveSheet(active, 'withdraw'));
  $('#potTransfer', b).addEventListener('click', () => openMoveSheet(active, 'transfer'));

  /* ---- transactions ---- */
  const rows = txnsOfPot(active.id)
    .slice()
    .sort((x, y) => (y.happened_on ?? '').localeCompare(x.happened_on ?? '') ||
                    (y.created_at ?? '').localeCompare(x.created_at ?? ''));
  const box = $('#potTxns', b);
  if (rows.length) {
    box.replaceChildren(...rows.map(t => {
      const r = document.createElement('div');
      r.className = 'exprow' + (t.amount >= 0 ? ' is-income' : '');
      r.innerHTML =
        `<span class="exprow__date" dir="ltr">${esc((t.happened_on ?? '').slice(8, 10))}/${esc((t.happened_on ?? '').slice(5, 7))}</span>` +
        `<span class="exprow__title">${esc(t.title ?? TXN_LABEL[t.kind] ?? 'תנועה')}</span>` +
        `<span class="exprow__amount" dir="ltr">${t.amount >= 0 ? '+' : '−'}${esc(money(Math.abs(t.amount)))}</span>`;
      if (t.kind === 'deposit' || t.kind === 'withdraw' || t.kind === 'transfer' || t.kind === 'manual') {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'exprow__del';
        del.setAttribute('aria-label', 'מחיקת התנועה');
        del.textContent = '×';
        del.addEventListener('click', e => {
          e.stopPropagation();
          deleteTxn(t.id);
          renderBank();
          toast('התנועה נמחקה');
        });
        r.append(del);
      }
      return r;
    }));
  } else {
    box.innerHTML = '<p class="wallet__empty">אין תנועות</p>';
  }

  /* ---- goals ---- */
  const bal = potBalance(active.id);
  const gs = goalsOfPot(active.id);
  const gbox = $('#potGoals', b);
  if (gs.length) {
    gbox.replaceChildren(...gs.map(g => {
      const pct = g.target > 0 ? Math.min(100, Math.max(0, bal / g.target * 100)) : 0;
      const row = document.createElement('div');
      row.className = 'goalrow' + (pct >= 100 ? ' is-done' : '');
      row.innerHTML = `
        <div class="goalrow__head">
          <span class="goalrow__title">${esc(g.title)}</span>
          <span class="goalrow__target" dir="ltr">${esc(money(g.target))}</span>
          <button class="exprow__del" type="button" aria-label="מחיקת היעד">×</button>
        </div>
        <div class="rep__track"><i style="width:${Math.round(pct)}%;background:${esc(active.colour ?? '#3D74A8')}"></i></div>
        <div class="goalrow__foot">
          <span>${pct >= 100 ? 'הגעת ליעד' : 'ממשיכים לחסוך'}</span>
          <span dir="ltr">${Math.round(pct)}%</span>
        </div>`;
      row.querySelector('.exprow__del').addEventListener('click', () => {
        deleteGoal(g.id); renderBank(); toast('היעד נמחק');
      });
      return row;
    }));
  } else {
    gbox.innerHTML = '<p class="wallet__empty">אין יעדים</p>';
  }

  $('#goalAdd', b).addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#goalTitle', b).value.trim();
    const target = Number($('#goalTarget', b).value);
    if (!title || !(target > 0)) return;
    addGoal({ pot_id: active.id, title, target });
    renderBank();
    toast('היעד נוסף');
  });
}

const TXN_LABEL = {
  opening: 'יתרת פתיחה', split: 'חלוקת הכנסה', expense: 'הוצאה',
  deposit: 'הפקדה', withdraw: 'משיכה', transfer: 'העברה', manual: 'תנועה',
};

/* ---------- deposit / withdraw / transfer ---------- */
const moveSheet = {
  root:   $('#moveSheet'),
  title:  $('#moveSheetTitle'),
  pot:    $('#moveSheetPot'),
  amount: $('#moveAmount'),
  date:   $('#moveDate'),
  name:   $('#moveTitle'),
  targetField: $('#moveTargetField'),
  target: $('#moveTarget'),
  msg:    $('#moveMsg'),
  save:   $('#moveSaveBtn'),
};
let moveTarget = null;      // { pot, mode }

function openMoveSheet(pot, mode) {
  if (!moveSheet.root) return;
  moveTarget = { pot, mode };
  const heads = { deposit: 'הפקדה', withdraw: 'משיכה', transfer: 'העברה בין קופות' };
  moveSheet.title.textContent = heads[mode];
  moveSheet.pot.textContent = mode === 'transfer'
    ? `מ${pot.name} · יתרה ${money(potBalance(pot.id))}`
    : `${pot.name} · יתרה ${money(potBalance(pot.id))}`;
  moveSheet.amount.value = '';
  moveSheet.name.value = '';
  moveSheet.date.value = isoDate();
  moveSheet.msg.hidden = true;

  const others = potsByPos().filter(p => p.id !== pot.id);
  moveSheet.targetField.hidden = mode !== 'transfer';
  if (mode === 'transfer') {
    moveSheet.target.replaceChildren(
      ...others.map(p => Object.assign(document.createElement('option'), { value: p.id, textContent: p.name })));
  }
  moveSheet.save.textContent = heads[mode];
  moveSheet.root.hidden = false;
  moveSheet.amount.focus();
}
function closeMoveSheet() { if (moveSheet.root) moveSheet.root.hidden = true; moveTarget = null; }

moveSheet.save?.addEventListener('click', () => {
  if (!moveTarget) return closeMoveSheet();
  const { pot, mode } = moveTarget;
  const amount = Number(moveSheet.amount.value);
  const fail = m => { moveSheet.msg.textContent = m; moveSheet.msg.dataset.tone = 'error'; moveSheet.msg.hidden = false; };
  if (!(amount > 0)) return fail('הסכום צריך להיות מספר גדול מאפס.');

  const on = moveSheet.date.value || isoDate();
  const title = moveSheet.name.value.trim() || null;
  const before = potBalance(pot.id);

  if (mode === 'transfer') {
    const to = potById(moveSheet.target.value);
    if (!to) return fail('בחרי קופה לקבל את הכסף.');
    if (amount > before) return fail(`ב${pot.name} יש רק ${money(before)}.`);
    addTxn({ pot_id: pot.id, amount: -amount, happened_on: on, kind: 'transfer', title: title ?? `העברה ל${to.name}` });
    addTxn({ pot_id: to.id,  amount:  amount, happened_on: on, kind: 'transfer', title: title ?? `העברה מ${pot.name}` });
  } else {
    const signed = mode === 'deposit' ? amount : -amount;
    if (mode === 'withdraw' && amount > before) return fail(`ב${pot.name} יש רק ${money(before)}.`);
    addTxn({ pot_id: pot.id, amount: signed, happened_on: on, kind: mode, title });
  }

  closeMoveSheet();
  renderBank();

  // אחרי הציור מחדש הכרטיס הוא אלמנט חדש, אז מרימים את האנימציה עכשיו
  const amountNode = $('#potAmount');
  const card = $('#potCard');
  const after = potBalance(pot.id);
  if (amountNode) rollNumber(amountNode, before, after);

  if (mode === 'deposit') { burstConfetti(); toast(`הופקדו ${money(amount)} ל${pot.name}`); }
  else if (mode === 'withdraw') { coinDrop(card); card?.classList.add('is-out'); toast(`נמשכו ${money(amount)} מ${pot.name}`); }
  else { toast(`הועברו ${money(amount)}`); }

  render();
});
$$('[data-move-close]').forEach(x => x.addEventListener('click', closeMoveSheet));

/* ---------- pot editor ---------- */
const potSheet = {
  root:  $('#potSheet'),
  title: $('#potSheetTitle'),
  name:  $('#potName'),
  share: $('#potShare'),
  hint:  $('#potShareHint'),
  msg:   $('#potMsg'),
  save:  $('#potSaveBtn'),
  del:   $('#potDeleteBtn'),
};
let potEditing = null;

function openPotSheet(pot) {
  if (!potSheet.root) return;
  potEditing = pot;
  potSheet.title.textContent = pot ? 'עריכת קופה' : 'קופה חדשה';
  potSheet.name.value  = pot?.name ?? '';
  potSheet.share.value = pot ? pot.share : '';
  potSheet.del.hidden  = !pot || state.pots.length < 2;
  potSheet.msg.hidden  = true;
  updateShareHint();
  potSheet.root.hidden = false;
  potSheet.name.focus();
}
function closePotSheet() { if (potSheet.root) potSheet.root.hidden = true; potEditing = null; }

function updateShareHint() {
  if (!potSheet.hint) return;
  const others = sum(state.pots.filter(p => p.id !== potEditing?.id), p => p.share);
  const mine = Number(potSheet.share.value) || 0;
  const total = others + mine;
  potSheet.hint.textContent = total === 100
    ? 'סך האחוזים בכל הקופות: 100% ✓'
    : `סך האחוזים בכל הקופות: ${total}% — צריך להגיע ל-100%`;
}
potSheet.share?.addEventListener('input', updateShareHint);

potSheet.save?.addEventListener('click', () => {
  const name = potSheet.name.value.trim();
  const share = Number(potSheet.share.value) || 0;
  const fail = m => { potSheet.msg.textContent = m; potSheet.msg.dataset.tone = 'error'; potSheet.msg.hidden = false; };
  if (!name) return fail('צריך שם לקופה.');
  if (share < 0 || share > 100) return fail('האחוז צריך להיות בין 0 ל-100.');

  if (potEditing) updatePot(potEditing, { name, share });
  else bankPotId = addPot({ name, share, colour: POT_COLOURS[state.pots.length % POT_COLOURS.length] }).id;

  closePotSheet();
  renderBank();
  toast(potEditing ? 'הקופה עודכנה' : 'הקופה נוספה');
});

potSheet.del?.addEventListener('click', () => {
  if (!potEditing) return closePotSheet();
  const name = potEditing.name;
  const other = potsByPos().find(p => p.id !== potEditing.id);
  deletePot(potEditing.id);
  bankPotId = other?.id ?? null;
  closePotSheet();
  renderBank();
  toast(`${name} נמחקה — הכסף עבר ל${other?.name ?? 'קופה אחרת'}`);
});
$$('[data-pot-close]').forEach(x => x.addEventListener('click', closePotSheet));

const POT_COLOURS = ['#8B5CF6', '#2E86C1', '#0F8A57', '#E0900B', '#C2537A'];


/* ============================================================
   חלוקת ההכנסה
   נפתח בכל פעם שנכנס כסף. מקזז קודם את הוצאות החודש שעדיין
   לא ירדו משום מקום, ומחלק בין הקופות רק את מה שנשאר.
   ============================================================ */
const splitSheet = { root: $('#splitSheet'), body: $('#splitBody') };
let splitIncome = null;
let splitChecked = new Set();
let splitParts = null;      // { potId: amount } כששינתה סכום ידנית
let splitPcts  = null;      // { potId: percent } כששינתה אחוז להכנסה הזאת

function openSplitSheet(inc) {
  if (!splitSheet.root || !state.pots.length) return false;
  splitIncome = inc;
  splitChecked = new Set(unsettledIn(monthOf(inc.received_on)).map(e => e.id));
  splitParts = null;
  splitPcts = null;
  drawSplit();
  splitSheet.root.hidden = false;
  return true;
}
function closeSplitSheet() {
  if (splitSheet.root) splitSheet.root.hidden = true;
  splitIncome = null; splitParts = null; splitPcts = null;
}

/** האחוז שמוצג לכל קופה: מה ששינתה להכנסה הזאת, אחרת האחוז הקבוע. */
const pctOf = pot => splitPcts ? (splitPcts[pot.id] ?? 0) : pot.share;

/**
 * הסכומים שיוצגו, לפי סדר עדיפות:
 * סכום ששינתה ידנית ← אחוז ששינתה להכנסה הזאת ← האחוז הקבוע של הקופה.
 * השארית מהעיגול הולכת לקופה עם האחוז הגדול ביותר, כדי שהסכום יֵצא מדויק.
 */
function currentParts(net) {
  const pots = potsByPos();
  if (splitParts) return pots.map(p => ({ pot: p, amount: splitParts[p.id] ?? 0 }));
  if (!splitPcts) return splitAmount(net);

  const cents = Math.round(net * 100);
  const parts = pots.map(p => ({ pot: p, cents: Math.floor(cents * pctOf(p) / 100) }));
  const drift = cents - sum(parts, x => x.cents);
  const total = sum(pots, p => pctOf(p));
  if (drift && total === 100 && parts.length) {
    const biggest = parts.reduce((a, b) => (pctOf(b.pot) > pctOf(a.pot) ? b : a), parts[0]);
    biggest.cents += drift;
  }
  return parts.map(x => ({ pot: x.pot, amount: x.cents / 100 }));
}

function drawSplit() {
  const inc = splitIncome;
  if (!inc) return;
  const month = monthOf(inc.received_on);

  // ההוצאות שאפשר לקזז: אלו שעוד לא קוזזו, ואלו שכבר סומנו להכנסה הזאת
  const options = state.expenses
    .filter(e => (e.spend_date ?? '').slice(0, 7) === month && isMine(e) && e.amount > 0)
    .filter(e => isUnsettled(e) || e.settled_by === inc.id)
    .sort((a, b) => (a.spend_date ?? '').localeCompare(b.spend_date ?? ''));

  const deducted = sum(options.filter(e => splitChecked.has(e.id)), e => e.amount);
  const net = Math.round((inc.amount - deducted) * 100) / 100;
  const parts = currentParts(Math.max(0, net));
  const allocated = sum(parts, x => x.amount);
  const drift = Math.round((net - allocated) * 100) / 100;

  const expRows = options.map(e => `
    <label class="settlerow">
      <input type="checkbox" data-exp="${e.id}" ${splitChecked.has(e.id) ? 'checked' : ''}>
      <span class="settlerow__box" aria-hidden="true"></span>
      <span class="settlerow__date" dir="ltr">${esc((e.spend_date ?? '').slice(8, 10))}/${esc((e.spend_date ?? '').slice(5, 7))}</span>
      <span class="settlerow__title">${esc(e.title)}</span>
      <span class="settlerow__amount" dir="ltr">−${esc(money(e.amount))}</span>
    </label>`).join('');

  const pctTotal = Math.round(sum(potsByPos(), p => pctOf(p)) * 100) / 100;

  const potRows = parts.map(({ pot, amount }) => `
    <div class="splitrow" style="--pot:${esc(pot.colour ?? '#3D74A8')}">
      <span class="splitrow__dot" aria-hidden="true"></span>
      <span class="splitrow__name">${esc(pot.name)}</span>
      <label class="splitrow__pctbox">
        <input class="splitrow__pct" type="number" dir="ltr" min="0" max="100" step="1"
               inputmode="decimal" data-pct="${pot.id}" value="${pctOf(pot)}"
               aria-label="אחוז ל${esc(pot.name)}">
        <span aria-hidden="true">%</span>
      </label>
      <input class="splitrow__input" type="number" dir="ltr" min="0" step="0.01"
             inputmode="decimal" data-pot="${pot.id}" value="${amount.toFixed(2)}"
             aria-label="סכום ל${esc(pot.name)}">
    </div>`).join('');

  splitSheet.body.innerHTML = `
    <div class="splithero">
      <span>נכנס${inc.client ? ` מ${esc(inc.client)}` : ''}</span>
      <b dir="ltr">${esc(money(inc.amount))}</b>
    </div>

    ${expRows ? `
      <h3 class="rep__h">קודם יורדות ההוצאות</h3>
      <p class="chart__cap">מסומן = יורד מההכנסה הזאת ולא נספר שוב בשום מקום.</p>
      <div class="settlelist">${expRows}</div>` : ''}

    <div class="splitnet">
      <span>נשאר לחלוקה</span>
      <b dir="ltr" class="${net < 0 ? 'is-neg' : ''}">${esc(money(net))}</b>
    </div>
    ${deducted ? `<p class="chart__cap splitnet__note">${esc(money(inc.amount))} פחות ${esc(money(deducted))} הוצאות</p>` : ''}

    <h3 class="rep__h">בין הקופות</h3>
    <div class="splitlist">${potRows}</div>

    <p class="splitcheck" data-ok="${drift === 0 && pctTotal === 100}">
      ${drift !== 0
        ? `${drift > 0 ? 'עוד' : 'יותר מדי'} ${esc(money(Math.abs(drift)))} — צריך להגיע ל-${esc(money(net))}`
        : pctTotal !== 100
          ? `סך האחוזים ${pctTotal}% — צריך להגיע ל-100%`
          : 'הסכומים מסתדרים בדיוק ✓'}
      <button class="splitcheck__undo" id="splitReset" type="button">איפוס לאחוזים הקבועים</button>
    </p>

    <div class="btn-row rep__actions">
      <button class="btn btn--primary" id="splitConfirm" type="button" ${drift === 0 && net >= 0 ? '' : 'disabled'}>אישור החלוקה</button>
      <button class="btn btn--quiet btn--danger" id="splitCancel" type="button">ביטול ההכנסה</button>
    </div>`;

  $$('[data-exp]', splitSheet.body).forEach(cb => cb.addEventListener('change', () => {
    cb.checked ? splitChecked.add(cb.dataset.exp) : splitChecked.delete(cb.dataset.exp);
    splitParts = null;                       // הסכום השתנה, אז חוזרים לאחוזים
    drawSplit();
  }));

  // שינוי אחוז — הסכומים מחושבים מחדש לבד, לכל הקופות
  $$('[data-pct]', splitSheet.body).forEach(inp => inp.addEventListener('input', () => {
    splitPcts = Object.fromEntries(
      $$('[data-pct]', splitSheet.body).map(x => [x.dataset.pct, Number(x.value) || 0]));
    splitParts = null;                  // האחוזים מנצחים סכום שהוקלד קודם
    const focused = inp.dataset.pct;
    drawSplit();
    // number inputs לא תומכים ב-setSelectionRange, אז רק מחזירים פוקוס
    $(`[data-pct="${focused}"]`, splitSheet.body)?.focus();
  }));

  // שינוי סכום ידני — האחוזים מתעדכנים כדי לשקף אותו
  $$('[data-pot]', splitSheet.body).forEach(inp => inp.addEventListener('input', () => {
    splitParts = Object.fromEntries(
      $$('[data-pot]', splitSheet.body).map(x => [x.dataset.pot, Number(x.value) || 0]));
    const nowAllocated = sum(Object.values(splitParts), v => v);
    const d = Math.round((net - nowAllocated) * 100) / 100;

    $$('[data-pct]', splitSheet.body).forEach(x => {
      const share = net > 0 ? (splitParts[x.dataset.pct] ?? 0) / net * 100 : 0;
      x.value = String(Math.round(share * 10) / 10);
    });

    const note = $('.splitcheck', splitSheet.body);
    note.dataset.ok = String(d === 0);
    note.firstChild.nodeValue = d === 0
      ? 'הסכומים מסתדרים בדיוק ✓ '
      : `${d > 0 ? 'עוד' : 'יותר מדי'} ${money(Math.abs(d))} — צריך להגיע ל-${money(net)} `;
    $('#splitConfirm', splitSheet.body).disabled = !(d === 0 && net >= 0);
  }));

  $('#splitReset', splitSheet.body)?.addEventListener('click', () => {
    splitParts = null; splitPcts = null; drawSplit();
  });

  // ביטול — ההכנסה נמחקת לגמרי, כאילו לא הוקלדה
  $('#splitCancel', splitSheet.body).addEventListener('click', () => {
    const id = inc.id;
    closeSplitSheet();
    deleteIncome(id);
    if (walletSheet.root?.hidden === false) renderWallet();
    if (bankSheet.root?.hidden === false) renderBank();
    render();
    toast('ההכנסה בוטלה');
  });

  $('#splitConfirm', splitSheet.body).addEventListener('click', () => {
    const chosen = (splitParts || splitPcts)
      ? parts.filter(x => x.amount)
      : null;
    const res = applyIncomeSplit(inc, { settledIds: [...splitChecked], parts: chosen });
    closeSplitSheet();
    if (bankSheet.root?.hidden === false) renderBank();
    render();
    burstConfetti();
    toast(res.deducted
      ? `חולקו ${money(res.net)} · קוזזו ${money(res.deducted)}`
      : `חולקו ${money(res.net)} בין הקופות`);
  });
}

$$('[data-split-close]').forEach(x => x.addEventListener('click', () => {
  // סגירה בלי אישור — עדיין מחלקים לפי האחוזים, כדי שלא יישאר כסף לא משויך
  const inc = splitIncome;
  closeSplitSheet();
  if (inc) {
    applyIncomeSplit(inc, { settledIds: [] });
    if (bankSheet.root?.hidden === false) renderBank();
    render();
    toast('חולק לפי האחוזים');
  }
}));

$('#bankBtn')?.addEventListener('click', openBank);
$$('[data-bank-close]').forEach(x => x.addEventListener('click', closeBank));

$('#walletBtn').addEventListener('click', openWallet);
$$('[data-wallet-close]').forEach(x => x.addEventListener('click', closeWallet));

/* ---------- subscription editor ---------- */
const subSheet = {
  root:   $('#subSheet'),
  title:  $('#subSheetTitle'),
  name:   $('#subName'),
  amount: $('#subAmount'),
  day:    $('#subDay'),
  started:$('#subStarted'),
  payer:  $('#subPayer'),
  payers: $('#subPayerList'),
  active: $('#subActive'),
  msg:    $('#subMsg'),
  save:   $('#subSaveBtn'),
  del:    $('#subDeleteBtn'),
};
let subTarget = null;

function openSubSheet(sub) {
  subTarget = sub;
  subSheet.title.textContent = sub ? 'עריכת מנוי' : 'מנוי חדש';
  subSheet.name.value    = sub?.name ?? '';
  subSheet.amount.value  = sub ? sub.amount : '';
  subSheet.day.value     = sub?.billing_day ?? 1;
  subSheet.started.value = (sub?.started_on ?? isoDate()).slice(0, 7);
  subSheet.active.checked = sub ? !!sub.active : true;
  if (subSheet.payer) {
    subSheet.payer.value = sub?.payer ?? '';
    const known = [...new Set(state.subs.map(x => x.payer).filter(Boolean))];
    subSheet.payers?.replaceChildren(
      ...(known.length ? known : ['אמא']).map(n => Object.assign(document.createElement('option'), { value: n })));
  }
  subSheet.del.hidden = !sub;
  subSheet.msg.hidden = true;
  subSheet.root.hidden = false;
  subSheet.name.focus();
}
function closeSubSheet() { subSheet.root.hidden = true; subTarget = null; }

subSheet.save.addEventListener('click', () => {
  const name = subSheet.name.value.trim();
  const amount = Number(subSheet.amount.value);
  if (!name) { subSheet.msg.textContent = 'צריך שם לפלטפורמה.'; subSheet.msg.dataset.tone = 'error'; subSheet.msg.hidden = false; return; }
  if (!(amount >= 0)) { subSheet.msg.textContent = 'הסכום צריך להיות מספר.'; subSheet.msg.dataset.tone = 'error'; subSheet.msg.hidden = false; return; }

  const patch = {
    name,
    amount,
    billing_day: Math.min(28, Math.max(1, Number(subSheet.day.value) || 1)),
    active: subSheet.active.checked,
    started_on: (subSheet.started.value || isoDate().slice(0, 7)) + '-01',
    payer: subSheet.payer?.value.trim() || null,
  };

  if (subTarget) updateSubscription(subTarget, patch);
  else addSubscription(patch);

  ensureCharges();
  closeSubSheet();
  renderWallet();
  render();
  toast(subTarget ? 'המנוי עודכן' : 'המנוי נוסף');
});

subSheet.del.addEventListener('click', () => {
  if (!subTarget) return closeSubSheet();
  const name = subTarget.name;
  deleteSubscription(subTarget.id);
  closeSubSheet();
  renderWallet();
  render();
  toast(`${name} נמחק — החיובים שכבר תועדו נשארו`);
});
$$('[data-sub-close]').forEach(x => x.addEventListener('click', closeSubSheet));

/* ---------- expense editor ---------- */
const expSheet = {
  root:    $('#expSheet'),
  title:   $('#expSheetTitle'),
  name:    $('#expTitle'),
  names:   $('#expTitleList'),
  amount:  $('#expAmount'),
  date:    $('#expDate'),
  client:  $('#expClient'),
  clients: $('#expClientList'),
  pot:     $('#expPot'),
  msg:     $('#expMsg'),
  save:    $('#expSaveBtn'),
  del:     $('#expDeleteBtn'),
};
let expTarget = null;

function openExpSheet(exp, defaultDate) {
  expTarget = exp;
  expSheet.title.textContent = exp
    ? (exp.kind === 'subscription' ? 'חיוב מנוי' : 'עריכת הוצאה')
    : 'הוצאה חדשה';
  expSheet.name.value   = exp?.title ?? '';
  expSheet.amount.value = exp ? exp.amount : '';
  expSheet.date.value   = exp?.spend_date ?? defaultDate ?? state.date;
  expSheet.client.value = exp?.client ?? '';
  if (expSheet.pot) {
    const settled = exp?.settled_by ? state.income.find(i => i.id === exp.settled_by) : null;
    expSheet.pot.replaceChildren(
      Object.assign(document.createElement('option'), {
        value: '',
        textContent: settled ? `קוזז מהתקבול של ${settled.client ?? 'תקבול'}` : 'לקזז מההכנסה הבאה',
      }),
      ...potsByPos().map(p => Object.assign(document.createElement('option'), { value: p.id, textContent: p.name })));
    expSheet.pot.value = exp?.pot_id ?? '';
    expSheet.pot.disabled = !state.pots.length;
  }
  expSheet.del.hidden   = !exp;
  expSheet.msg.hidden   = true;

  const pastTitles = [...new Set(state.expenses.filter(e => e.kind !== 'subscription').map(e => e.title))];
  expSheet.names.replaceChildren(...pastTitles.map(t => Object.assign(document.createElement('option'), { value: t })));
  expSheet.clients.replaceChildren(...knownClients().map(c => Object.assign(document.createElement('option'), { value: c })));

  expSheet.root.hidden = false;
  expSheet.name.focus();
}
function closeExpSheet() { expSheet.root.hidden = true; expTarget = null; }

expSheet.save.addEventListener('click', () => {
  const title = expSheet.name.value.trim();
  const amount = Number(expSheet.amount.value);
  if (!title) { expSheet.msg.textContent = 'צריך לכתוב על מה ההוצאה.'; expSheet.msg.dataset.tone = 'error'; expSheet.msg.hidden = false; return; }
  if (!(amount >= 0)) { expSheet.msg.textContent = 'הסכום צריך להיות מספר.'; expSheet.msg.dataset.tone = 'error'; expSheet.msg.hidden = false; return; }

  const patch = { title, amount, spend_date: expSheet.date.value || state.date, client: expSheet.client.value.trim() || null };
  const exp = expTarget ? (updateExpense(expTarget, patch), expTarget) : addExpense(patch);

  // הקופה קובעת מאיפה הכסף יורד. בלי קופה — ההוצאה ממתינה לקיזוז מההכנסה הבאה.
  const wanted = expSheet.pot?.value || '';
  if (wanted && potById(wanted)) payFromPot(exp, wanted);
  else if (!wanted && exp.pot_id) unsettleExpense(exp);   // הסירה קופה — חוזרת להמתנה

  closeExpSheet();
  if (walletSheet.root?.hidden === false) renderWallet();
  if (bankSheet.root?.hidden === false) renderBank();
  render();
  toast('ההוצאה נשמרה');
});

expSheet.del.addEventListener('click', () => {
  if (!expTarget) return closeExpSheet();
  deleteExpense(expTarget.id);
  if (bankSheet.root?.hidden === false) renderBank();
  closeExpSheet();
  if (!walletSheet.root.hidden) renderWallet();
  render();
  toast('ההוצאה נמחקה');
});
$$('[data-exp-close]').forEach(x => x.addEventListener('click', closeExpSheet));

/* ---------- income editor ---------- */
const incSheet = {
  root:    $('#incSheet'),
  title:   $('#incSheetTitle'),
  client:  $('#incClient'),
  clients: $('#incClientList'),
  name:    $('#incTitle'),
  amount:  $('#incAmount'),
  date:    $('#incDate'),
  msg:     $('#incMsg'),
  save:    $('#incSaveBtn'),
  del:     $('#incDeleteBtn'),
};
let incTarget = null;

function openIncSheet(inc, defaultDate) {
  if (!incSheet.root) return;               // HTML ישן מהמטמון — לא מפילים את האפליקציה
  incTarget = inc;
  incSheet.title.textContent = inc ? 'עריכת תקבול' : 'תקבול חדש';
  incSheet.client.value = inc?.client ?? '';
  incSheet.name.value   = inc?.title ?? '';
  incSheet.amount.value = inc ? inc.amount : '';
  incSheet.date.value   = inc?.received_on ?? defaultDate ?? state.date;
  incSheet.del.hidden   = !inc;
  incSheet.msg.hidden   = true;
  incSheet.clients.replaceChildren(
    ...knownClients().map(c => Object.assign(document.createElement('option'), { value: c })));
  incSheet.root.hidden = false;
  incSheet.client.focus();
}
function closeIncSheet() { if (incSheet.root) incSheet.root.hidden = true; incTarget = null; }

incSheet.save?.addEventListener('click', () => {
  const amount = Number(incSheet.amount.value);
  const client = incSheet.client.value.trim();
  const fail = m => { incSheet.msg.textContent = m; incSheet.msg.dataset.tone = 'error'; incSheet.msg.hidden = false; };
  if (!client && !incSheet.name.value.trim()) return fail('כתבי ממי נכנס הכסף.');
  if (!(amount > 0)) return fail('הסכום צריך להיות מספר גדול מאפס.');

  const patch = {
    client: client || null,
    title: incSheet.name.value.trim() || null,
    amount,
    received_on: incSheet.date.value || state.date,
  };
  const inc = incTarget ? (updateIncome(incTarget, patch), incTarget) : addIncome(patch);

  closeIncSheet();
  if (walletSheet.root?.hidden === false) renderWallet();
  render();

  // כל כניסת כסף עוברת דרך מסך החלוקה, כדי שתמיד יהיה ברור לאן הוא הלך
  if (!openSplitSheet(inc)) toast('התקבול נשמר');
});

incSheet.del?.addEventListener('click', () => {
  if (!incTarget) return closeIncSheet();
  deleteIncome(incTarget.id);
  closeIncSheet();
  if (walletSheet.root?.hidden === false) renderWallet();
  render();
  toast('התקבול נמחק');
});
$$('[data-inc-close]').forEach(x => x.addEventListener('click', closeIncSheet));
el.spendAdd.addEventListener('click', () => openExpSheet(null, state.date));
el.incomeAdd?.addEventListener('click', () => openIncSheet(null, state.date));

/* ============================================================
   CONFETTI — a short canvas burst, no dependencies
   ============================================================ */
function burstConfetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2);

  canvas.width  = innerWidth  * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.display = 'block';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colours = ['#5FA3DE', '#22C55E', '#F59E0B', '#7CBAEA', '#A78BFA', '#F472B6'];
  const bits = Array.from({ length: 110 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 260,
    y: innerHeight * .3,
    vx: (Math.random() - .5) * 10,
    vy: -(5 + Math.random() * 10),
    w: 5 + Math.random() * 6,
    h: 8 + Math.random() * 8,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - .5) * .32,
    colour: colours[(Math.random() * colours.length) | 0],
  }));

  let frame = 0;
  (function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    let alive = false;
    for (const b of bits) {
      b.vy += .46; b.vx *= .99;
      b.x += b.vx; b.y += b.vy; b.rot += b.vr;
      if (b.y < innerHeight + 40) alive = true;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.fillStyle = b.colour;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (alive && ++frame < 170) requestAnimationFrame(tick);
    else { ctx.clearRect(0, 0, innerWidth, innerHeight); canvas.style.display = 'none'; }
  })();
}


/* ============================================================
   CHARTS
   Plain HTML bars (they survive the PDF snapshot) and one SVG
   donut. One hue per chart; the reader compares magnitude, so
   nothing here needs a categorical palette.
   ============================================================ */

/** Completion ring. `pct` 0–100. */
function donut(pct, size = 96) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const on = c * Math.max(0, Math.min(100, pct)) / 100;
  const mid = size / 2;
  return `<div class="donut" style="--size:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="#E8E8EB" stroke-width="${stroke}"/>
      ${on <= 0 ? '' /* ב-0% הקצה המעוגל היה מצייר נקודה ירוקה מיותרת */ : `
      <circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke="#16A34A" stroke-width="${stroke}"
              stroke-linecap="round" stroke-dasharray="${on.toFixed(1)} ${(c - on).toFixed(1)}"
              transform="rotate(-90 ${mid} ${mid})"/>`}
    </svg>
    <span class="donut__label">${pct}<small>%</small></span>
  </div>`;
}

/**
 * Column chart from `points` — [{ v, tick, title }].
 * Bars are divs, so html2canvas reproduces them exactly.
 */
function columnChart(points, { unit = '', tickEvery = 1 } = {}) {
  if (!points.length) return '';
  const max = Math.max(...points.map(p => p.v));
  if (max <= 0) return '<p class="chart__empty">אין נתונים להצגה</p>';
  const peak = points.reduce((a, b) => (b.v > a.v ? b : a), points[0]);

  const cols = points.map((p, i) => {
    const h = p.v > 0 ? Math.max(4, Math.round(p.v / max * 100)) : 0;
    const isPeak = p === peak && p.v > 0;
    return `<div class="chart__col" title="${esc(p.title ?? '')}">
      ${isPeak ? `<span class="chart__peak">${esc(String(p.v) + unit)}</span>` : ''}
      <span class="chart__bar${h ? '' : ' is-zero'}" style="height:${h}%"></span>
      <span class="chart__tick">${i % tickEvery === 0 ? esc(p.tick ?? '') : ''}</span>
    </div>`;
  }).join('');

  return `<div class="chart"><div class="chart__plot">${cols}</div></div>`;
}

/** One horizontal bar split into labelled parts — part-to-whole for two categories. */
function splitBar(parts) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (!total) return '';
  return `<div class="split">
    <div class="split__bar">
      ${parts.filter(p => p.value > 0).map(p =>
        `<i style="width:${(p.value / total * 100).toFixed(1)}%;background:${p.colour}"></i>`).join('')}
    </div>
    <div class="split__legend">
      ${parts.map(p => `<span class="split__key">
        <i style="background:${p.colour}"></i>${esc(p.label)}
        <b dir="ltr">${esc(money(p.value))}</b></span>`).join('')}
    </div>
  </div>`;
}

/** Minutes of tracked work per hour of the day. */
function hourlyLoad(timed) {
  const bins = Array.from({ length: 24 }, () => 0);
  for (const { t } of timed) {
    const a = new Date(t.started_at), b = new Date(t.finished_at);
    for (let h = a.getHours(); h <= b.getHours() && h < 24; h++) {
      const from = Math.max(a.getTime(), new Date(a).setHours(h, 0, 0, 0));
      const to   = Math.min(b.getTime(), new Date(a).setHours(h, 59, 59, 999));
      bins[h] += Math.max(0, Math.round((to - from) / 60000));
    }
  }
  return bins;
}

/** Trim empty hours from both ends, keeping a readable window. */
function workWindow(bins) {
  let first = bins.findIndex(v => v > 0);
  let last  = bins.length - 1 - [...bins].reverse().findIndex(v => v > 0);
  if (first < 0) { first = 8; last = 18; }
  first = Math.max(0, Math.min(first, 8));
  last  = Math.min(23, Math.max(last, first + 7));
  return [first, last];
}

/* ============================================================
   DAILY REPORT
   ============================================================ */
const reportSheet = { root: $('#reportSheet'), body: $('#reportBody') };
const NO_CLIENT = 'ללא לקוח';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function reportData(date) {
  const rows = byDate(date);
  const done = rows.filter(t => t.done);
  const open = rows.filter(t => !t.done);

  const timed = done
    .map(t => ({ t, mins: minutesBetween(t.started_at, t.finished_at) }))
    .filter(x => x.mins != null);
  const totalMins = timed.reduce((n, x) => n + x.mins, 0);

  const byClient = new Map();
  rows.forEach(t => {
    const key = t.client ?? NO_CLIENT;
    const c = byClient.get(key) ?? { name: key, total: 0, done: 0, mins: 0 };
    c.total++;
    if (t.done) c.done++;
    const m = minutesBetween(t.started_at, t.finished_at);
    if (m != null) c.mins += m;
    byClient.set(key, c);
  });

  return {
    rows, done, open, timed, totalMins,
    pct: rows.length ? Math.round(done.length / rows.length * 100) : 0,
    clients: [...byClient.values()].sort((a, b) => b.total - a.total),
  };
}

let reportMode  = 'day';     // 'day' | 'month'
let reportMonth = monthOf();
let monthTasks  = null;      // tasks for reportMonth, fetched on demand

/** Tasks for a whole month. From the cloud when connected, else local. */
async function loadMonthTasks(ym) {
  const from = ym + '-01';
  const to   = shiftMonth(ym, 1) + '-01';
  if (state.sb && state.user) {
    const { data, error } = await state.sb
      .from('tasks').select(COLS).gte('task_date', from).lt('task_date', to);
    if (!error) return (data ?? []).map(normalize);
  }
  return state.tasks.filter(t => t.task_date >= from && t.task_date < to);
}

function monthData(ym, rows) {
  const done  = rows.filter(t => t.done);
  const timed = rows.map(t => ({ t, mins: minutesBetween(t.started_at, t.finished_at) }))
                    .filter(x => x.mins != null);

  const byClient = new Map();
  const bump = (name, patch) => {
    const c = byClient.get(name) ?? { name, total: 0, done: 0, mins: 0, spend: 0, earned: 0 };
    Object.entries(patch).forEach(([k, v]) => { c[k] += v; });
    byClient.set(name, c);
  };
  rows.forEach(t => {
    const m = minutesBetween(t.started_at, t.finished_at);
    bump(t.client ?? NO_CLIENT, { total: 1, done: t.done ? 1 : 0, mins: m ?? 0 });
  });

  const allSpend = expensesIn(ym);
  const spend    = allSpend.filter(isMine);          // מה שבאמת יצא מהכיס שלך
  const theirs   = allSpend.filter(e => !isMine(e));
  const subSpend = spend.filter(e => e.kind === 'subscription');
  const oneSpend = spend.filter(e => e.kind !== 'subscription');
  oneSpend.forEach(e => { if (e.client) bump(e.client, { total: 0, done: 0, mins: 0, spend: e.amount }); });

  const income = incomeIn(ym);
  income.forEach(i => { if (i.client) bump(i.client, { total: 0, done: 0, mins: 0, spend: 0, earned: i.amount }); });

  const bySub = new Map();
  subSpend.forEach(e => bySub.set(e.title, (bySub.get(e.title) ?? 0) + Number(e.amount || 0)));

  return {
    rows, done, timed,
    totalMins: timed.reduce((n, x) => n + x.mins, 0),
    pct: rows.length ? Math.round(done.length / rows.length * 100) : 0,
    clients: [...byClient.values()].sort((a, b) => b.earned - a.earned || b.total - a.total || b.spend - a.spend),
    spend, subSpend, oneSpend, theirs, income,
    subTotal:    sum(subSpend, e => e.amount),
    oneTotal:    sum(oneSpend, e => e.amount),
    total:       sum(spend,    e => e.amount),
    othersTotal: sum(theirs,   e => e.amount),
    earned:      sum(income,   i => i.amount),
    bySub: [...bySub.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
  };
}

/**
 * שורת מדד. לכל פס יש משמעות אחת בלבד, זו שכתובה בכותרת המשנה של המקטע —
 * בדוח היומי אחוז ההשלמה, בדוח החודשי הגודל היחסי.
 */
const barRow = (label, meta, pct, hue, colour = null) => `
  <div class="rep__bar">
    <div class="rep__bar-head">
      <span class="chip${hue == null ? '' : ' chip--client'}"${hue == null ? '' : ` style="--hue:${hue}"`}>${esc(label)}</span>
      <span class="rep__bar-meta">${esc(meta)}</span>
    </div>
    <div class="rep__track"><i style="width:${Math.max(pct > 0 ? 2 : 0, Math.round(pct))}%${
      colour ? `;background:${colour}` : ''
    }"></i></div>
  </div>`;

function openReport() {
  reportSheet.root.hidden = false;
  drawReport();
}

async function drawReport() {
  $('#reportSheetTitle').textContent = reportMode === 'day' ? 'דוח יומי' : 'דוח חודשי';
  $('#repDay').classList.toggle('is-on', reportMode === 'day');
  $('#repMonth').classList.toggle('is-on', reportMode === 'month');
  $('#repDay').setAttribute('aria-selected', String(reportMode === 'day'));
  $('#repMonth').setAttribute('aria-selected', String(reportMode === 'month'));

  if (reportMode === 'day') return drawDayReport();

  reportSheet.body.innerHTML = '<p class="rep__empty">טוען…</p>';
  monthTasks = await loadMonthTasks(reportMonth);
  drawMonthReport();
}

/* ---------------- daily ---------------- */
function drawDayReport() {
  const d = reportData(state.date);
  const spend = expensesOn(state.date);
  const spendTotal = myOutlay(spend);                    // בלי מה שמישהו אחר משלם
  const othersTotal = sum(spend.filter(e => !isMine(e)), e => e.amount);
  const earned = sum(incomeOn(state.date), i => i.amount);
  const profit = earned - spendTotal;
  const pushed = pushedFrom(state.date);

  const bins = hourlyLoad(d.timed);
  const [fromH, toH] = workWindow(bins);
  const hourPoints = [];
  for (let h = fromH; h <= toH; h++) {
    hourPoints.push({
      v: bins[h],
      tick: String(h).padStart(2, '0'),
      title: `${String(h).padStart(2, '0')}:00 · ${humanDuration(bins[h]) || 'ללא עבודה'}`,
    });
  }
  const hourChart = d.totalMins
    ? `<h3 class="rep__h">מתי עבדת</h3>
       <p class="chart__cap">דקות עבודה מתועדות לפי שעה</p>
       ${columnChart(hourPoints, { unit: ' דק׳', tickEvery: hourPoints.length > 12 ? 2 : 1 })}`
    : '';

  const clientRows = d.clients
    .map(c => barRow(c.name,
      `${c.done}/${c.total}${c.mins ? ' · ' + humanDuration(c.mins) : ''}`,
      c.total ? c.done / c.total * 100 : 0,
      c.name === NO_CLIENT ? null : clientHue(c.name)))
    .join('');

  const timeline = d.timed.length ? d.timed
    .sort((a, b) => (a.t.finished_at ?? '').localeCompare(b.t.finished_at ?? ''))
    .map(x => `
      <li class="rep__row">
        <span class="rep__time" dir="ltr">${hhmm(x.t.started_at)}–${hhmm(x.t.finished_at)}</span>
        <span class="rep__task">${esc(x.t.title)}</span>
        <span class="rep__dur">${esc(humanDuration(x.mins))}</span>
      </li>`).join('') : '';

  const leftovers = d.open.map(t => `
    <li class="rep__row rep__row--open">
      <span class="rep__task">${esc(t.title)}</span>
      ${t.client ? `<span class="chip chip--client" style="--hue:${clientHue(t.client)}">${esc(t.client)}</span>` : ''}
    </li>`).join('');

  const pushedRows = pushed.map(t => `
    <li class="rep__row rep__row--open">
      <span class="rep__task">${esc(t.title)}</span>
      <span class="rep__time">${esc(relativeLabel(t.task_date))}</span>
    </li>`).join('');

  const spendRows = spend.map(e => `
    <li class="rep__row${isMine(e) ? '' : ' rep__row--open'}">
      <span class="rep__task">${esc(e.title)}</span>
      ${e.kind === 'subscription' ? '<span class="spend__kind">מנוי</span>' : ''}
      ${e.payer ? `<span class="chip chip--payer">${esc(e.payer)} משלם·ת</span>` : ''}
      <span class="rep__money" dir="ltr">${esc(money(e.amount))}</span>
    </li>`).join('');

  const incRows = incomeOn(state.date).map(i => `
    <li class="rep__row">
      <span class="rep__task">${esc(i.client ?? 'תקבול')}${i.title ? ` · ${esc(i.title)}` : ''}</span>
      <span class="rep__money rep__money--in" dir="ltr">+${esc(money(i.amount))}</span>
    </li>`).join('');

  reportSheet.body.innerHTML = `
    <p class="rep__date">${esc(heDayName(state.date))} · ${esc(heDate(state.date))}</p>

    <div class="rep__hero">
      ${donut(d.pct)}
      <div class="rep__kpis">
        <div class="rep__kpi"><b>${d.done.length}</b><span>הושלמו</span></div>
        <div class="rep__kpi"><b>${d.open.length}</b><span>נותרו</span></div>
        <div class="rep__kpi"><b>${d.totalMins ? esc(humanDuration(d.totalMins)) : '—'}</b><span>זמן עבודה</span></div>
        <div class="rep__kpi"><b dir="ltr">${earned ? esc(money(earned)) : '—'}</b><span>נכנס</span></div>
        <div class="rep__kpi"><b dir="ltr">${spendTotal ? esc(money(spendTotal)) : '—'}</b><span>יצא</span></div>
        ${earned || spendTotal ? `<div class="rep__kpi" data-tone="${profit < 0 ? 'down' : 'up'}"><b dir="ltr">${esc(money(Math.abs(profit)))}</b><span>${profit < 0 ? 'הפסד' : 'רווח'}</span></div>` : ''}
        ${pushed.length ? `<div class="rep__kpi"><b>${pushed.length}</b><span>הועברו הלאה</span></div>` : ''}
      </div>
    </div>

    ${hourChart}
    ${d.clients.length ? `<h3 class="rep__h">לפי לקוח</h3>
       <p class="chart__cap">אורך הפס = אחוז המשימות שהושלמו אצל אותו לקוח</p>${clientRows}` : ''}
    ${timeline   ? `<h3 class="rep__h">מה נעשה ומתי</h3><ul class="rep__list">${timeline}</ul>` : ''}
    ${incRows    ? `<h3 class="rep__h">כסף שנכנס</h3><ul class="rep__list">${incRows}</ul>` : ''}
    ${spendRows  ? `<h3 class="rep__h">הוצאות היום</h3>${
      othersTotal ? `<p class="chart__cap">${esc(money(othersTotal))} מזה משלם מישהו אחר ולא נספר ברווח</p>` : ''
    }<ul class="rep__list">${spendRows}</ul>` : ''}
    ${leftovers  ? `<h3 class="rep__h">נשאר פתוח</h3><ul class="rep__list">${leftovers}</ul>` : ''}
    ${pushedRows ? `<h3 class="rep__h">הועברו ליום אחר</h3><ul class="rep__list">${pushedRows}</ul>` : ''}
    ${d.rows.length || spend.length || earned ? '' : '<p class="rep__empty">אין משימות, הוצאות או הכנסות ליום הזה.</p>'}

    <div class="btn-row rep__actions">
      <button class="btn btn--primary" id="repPdf" type="button">הורדת PDF</button>
    </div>`;

  $('#repPdf')?.addEventListener('click', () => downloadReportPdf(`דוח יומי · ${heDayName(state.date)} ${heDate(state.date)}`));
}

/* ---------------- monthly ---------------- */
function drawMonthReport() {
  const m = monthData(reportMonth, monthTasks ?? []);
  const maxSpend = Math.max(1, ...m.bySub.map(s => s.amount), m.oneTotal);
  const profit = m.earned - m.total;
  const isNow = reportMonth === monthOf();

  const days = new Date(Number(reportMonth.slice(0, 4)), Number(reportMonth.slice(5, 7)), 0).getDate();
  const perDay = Array.from({ length: days }, () => 0);
  m.done.forEach(t => {
    const dnum = Number((t.task_date ?? '').slice(8, 10));
    if (dnum >= 1 && dnum <= days) perDay[dnum - 1]++;
  });
  const dayPoints = perDay.map((v, i) => ({
    v,
    tick: String(i + 1),
    title: `${i + 1} ב${heMonth(reportMonth).split(' ')[0]} · ${v} משימות`,
  }));
  const dayChart = m.done.length
    ? `<h3 class="rep__h">משימות שהושלמו לאורך החודש</h3>
       ${columnChart(dayPoints, { tickEvery: 5 })}`
    : '';

  const spendSplit = m.total
    ? `<h3 class="rep__h">חלוקת ההוצאה</h3>${splitBar([
        { label: 'מנויים',   value: m.subTotal, colour: '#4E93D4' },
        { label: 'חד־פעמי', value: m.oneTotal, colour: '#E0900B' },
      ])}`
    : '';

  // נכנס מול יצא — שני פסים באותו קנה מידה, כדי שהיחס ביניהם ייקרא מיד
  const flowMax = Math.max(m.earned, m.total, 1);
  const flowChart = (m.earned || m.total)
    ? `<h3 class="rep__h">נכנס מול יצא</h3>
       <p class="chart__cap">שני הפסים באותו קנה מידה. הפער ביניהם הוא ${profit < 0 ? 'ההפסד' : 'הרווח'}.</p>
       ${barRow('נכנס', money(m.earned), m.earned / flowMax * 100, null, '#0F8A57')}
       ${barRow('יצא',  money(m.total),  m.total  / flowMax * 100, null, '#4E93D4')}`
    : '';

  const incRows = m.income
    .slice().sort((a, b) => (a.received_on ?? '').localeCompare(b.received_on ?? ''))
    .map(i => `
      <li class="rep__row">
        <span class="rep__time" dir="ltr">${esc((i.received_on ?? '').slice(8, 10))}/${esc((i.received_on ?? '').slice(5, 7))}</span>
        <span class="rep__task">${esc(i.client ?? 'תקבול')}${i.title ? ` · ${esc(i.title)}` : ''}</span>
        <span class="rep__money rep__money--in" dir="ltr">+${esc(money(i.amount))}</span>
      </li>`).join('');

  const subRows = m.bySub.map(s => barRow(s.name, money(s.amount), s.amount / maxSpend * 100, clientHue(s.name))).join('');

  // הכנסה ומשימות הם שני סיפורים שונים, אז כל אחד מקבל מקטע משלו
  // ופס עם משמעות אחת — אחרת לקוח ששילם ₪4,000 מקבל פס ריק.
  const maxEarned = Math.max(1, ...m.clients.map(c => c.earned));
  const earnRows = m.clients
    .filter(c => c.earned > 0)
    .map(c => barRow(c.name,
      [money(c.earned), c.spend ? `הוצאה ${money(c.spend)}` : ''].filter(Boolean).join(' · '),
      c.earned / maxEarned * 100,
      c.name === NO_CLIENT ? null : clientHue(c.name),
      '#0F8A57'))
    .join('');

  const clientRows = m.clients
    .filter(c => c.total > 0)
    .map(c => barRow(c.name,
      [`${c.done}/${c.total}`, c.mins ? humanDuration(c.mins) : ''].filter(Boolean).join(' · '),
      c.done / c.total * 100,
      c.name === NO_CLIENT ? null : clientHue(c.name)))
    .join('');

  const oneRows = m.oneSpend
    .slice().sort((a, b) => (a.spend_date ?? '').localeCompare(b.spend_date ?? ''))
    .map(e => `
      <li class="rep__row">
        <span class="rep__time" dir="ltr">${esc((e.spend_date ?? '').slice(8, 10))}/${esc((e.spend_date ?? '').slice(5, 7))}</span>
        <span class="rep__task">${esc(e.title)}</span>
        <span class="rep__money" dir="ltr">${esc(money(e.amount))}</span>
      </li>`).join('');

  reportSheet.body.innerHTML = `
    <div class="monthnav">
      <button class="datenav__arrow" id="rPrev" type="button" aria-label="חודש קודם">
        <svg viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="monthnav__label">${esc(heMonth(reportMonth))}</span>
      <button class="datenav__arrow" id="rNext" type="button" aria-label="חודש הבא" ${isNow ? 'disabled' : ''}>
        <svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>

    <div class="rep__hero">
      ${donut(m.pct)}
      <div class="rep__kpis">
        <div class="rep__kpi"><b>${m.done.length}</b><span>משימות הושלמו</span></div>
        <div class="rep__kpi"><b>${m.totalMins ? esc(humanDuration(m.totalMins)) : '—'}</b><span>זמן עבודה</span></div>
        <div class="rep__kpi"><b dir="ltr">${esc(money(m.total))}</b><span>הוצאות עבודה</span></div>
      </div>
    </div>

    <div class="moneyrow">
      <div class="moneytile moneytile--in"><span>נכנס</span><b dir="ltr">${esc(money(m.earned))}</b></div>
      <div class="moneytile"><span>יצא</span><b dir="ltr">${esc(money(m.total))}</b></div>
      <div class="moneytile moneytile--profit" data-tone="${profit < 0 ? 'down' : 'up'}">
        <span>${profit < 0 ? 'הפסד' : 'רווח'}</span><b dir="ltr">${esc(money(Math.abs(profit)))}</b>
      </div>
    </div>
    ${m.othersTotal ? `<p class="wallet__note">${esc(money(m.othersTotal))} שילם מישהו אחר — מתועד בארנק, לא נספר כאן.</p>` : ''}

    ${dayChart}
    ${flowChart}
    ${incRows ? `<h3 class="rep__h">כסף שנכנס</h3><ul class="rep__list">${incRows}</ul>` : ''}
    ${spendSplit}
    ${subRows    ? `<h3 class="rep__h">מנויים שחויבו</h3>
       <p class="chart__cap">אורך הפס = הסכום ביחס למנוי היקר ביותר</p>${subRows}` : ''}
    ${oneRows    ? `<h3 class="rep__h">רכישות חד־פעמיות</h3><ul class="rep__list">${oneRows}</ul>` : ''}
    ${earnRows ? `<h3 class="rep__h">הכנסה לפי לקוח</h3>
       <p class="chart__cap">אורך הפס = הסכום ביחס ללקוח שהכניס הכי הרבה</p>${earnRows}` : ''}
    ${clientRows ? `<h3 class="rep__h">משימות לפי לקוח</h3>
       <p class="chart__cap">אורך הפס = אחוז המשימות שהושלמו אצל אותו לקוח</p>${clientRows}` : ''}
    ${m.rows.length || m.spend.length || m.earned ? '' : '<p class="rep__empty">אין נתונים לחודש הזה.</p>'}

    <div class="btn-row rep__actions">
      <button class="btn btn--primary" id="repPdf" type="button">הורדת PDF</button>
    </div>`;

  $('#rPrev').addEventListener('click', () => { reportMonth = shiftMonth(reportMonth, -1); drawReport(); });
  $('#rNext').addEventListener('click', () => {
    if (reportMonth >= monthOf()) return;
    reportMonth = shiftMonth(reportMonth, 1);
    drawReport();
  });
  $('#repPdf')?.addEventListener('click', () => downloadReportPdf(`דוח חודשי · ${heMonth(reportMonth)}`));
}

/**
 * Snapshot the rendered report and save it as a PDF.
 * The libraries are pulled in only on the first click, and they are
 * served from this site — nothing is fetched from a CDN.
 */
async function downloadReportPdf(title) {
  const btn = $('#repPdf');
  if (!btn) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'מכין PDF…';

  let sheet;
  try {
    const { jsPDF, html2canvas } = await import('./pdf.js');

    // Render a detached copy so the modal's scrolling never clips the page.
    sheet = document.createElement('div');
    sheet.className = 'pdfdoc';
    sheet.innerHTML =
      `<div class="pdfdoc__head">
         <span class="pdfdoc__brand">המשימות שלי</span>
         <span class="pdfdoc__title">${esc(title)}</span>
       </div>` + reportSheet.body.innerHTML;
    sheet.querySelector('.rep__actions')?.remove();
    document.body.append(sheet);

    const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', logging: false });

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const drawW = pageW - margin * 2;
    const sliceH = Math.floor(canvas.width * (pageH - margin * 2) / drawW);

    for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
      const h = Math.min(sliceH, canvas.height - y);
      const part = document.createElement('canvas');
      part.width = canvas.width;
      part.height = h;
      const pctx = part.getContext('2d');
      pctx.fillStyle = '#ffffff';                       // JPEG לא שומר שקיפות
      pctx.fillRect(0, 0, part.width, part.height);
      pctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page) pdf.addPage();
      // JPEG באיכות גבוהה — הקובץ יוצא קטן פי כמה מ-PNG וניתן לשלוח במייל
      pdf.addImage(part.toDataURL('image/jpeg', 0.94), 'JPEG', margin, margin, drawW, h * drawW / canvas.width);
    }

    pdf.save(title.replace(/[\\/:*?"<>|·]+/g, ' ').trim() + '.pdf');
    toast('הדוח הורד');
  } catch (err) {
    console.error(err);
    toast('הפקת ה-PDF נכשלה');
  } finally {
    sheet?.remove();
    btn.disabled = false;
    btn.textContent = label;
  }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('הדוח הועתק'); }
  catch { toast('ההעתקה נכשלה'); }
}

function dayReportText(d, spend, spendTotal, pushed = []) {
  const lines = [
    `דוח משימות · ${heDayName(state.date)} ${heDate(state.date)}`,
    `הושלמו ${d.done.length} מתוך ${d.rows.length} (${d.pct}%)`,
  ];
  if (d.totalMins) lines.push(`זמן עבודה מתועד: ${humanDuration(d.totalMins)}`);
  if (spendTotal)  lines.push(`הוצאות היום: ${money(spendTotal)}`);
  if (d.clients.length) {
    lines.push('', 'לפי לקוח:');
    d.clients.forEach(c => lines.push(`· ${c.name} — ${c.done}/${c.total}${c.mins ? ` (${humanDuration(c.mins)})` : ''}`));
  }
  if (d.timed.length) {
    lines.push('', 'מה נעשה:');
    d.timed.forEach(x => lines.push(`· ${hhmm(x.t.started_at)}–${hhmm(x.t.finished_at)} ${x.t.title} (${humanDuration(x.mins)})`));
  }
  if (spend.length) {
    lines.push('', 'הוצאות:');
    spend.forEach(e => lines.push(`· ${e.title} — ${money(e.amount)}${e.kind === 'subscription' ? ' (מנוי)' : ''}`));
  }
  if (d.open.length) {
    lines.push('', 'נשאר פתוח:');
    d.open.forEach(t => lines.push(`· ${t.title}`));
  }
  if (pushed.length) {
    lines.push('', 'הועברו ליום אחר:');
    pushed.forEach(t => lines.push(`· ${t.title} → ${relativeLabel(t.task_date)}`));
  }
  return lines.join('\n');
}

function monthReportText(m) {
  const lines = [
    `דוח חודשי · ${heMonth(reportMonth)}`,
    `משימות: ${m.done.length} הושלמו מתוך ${m.rows.length} (${m.pct}%)`,
  ];
  if (m.totalMins) lines.push(`זמן עבודה מתועד: ${humanDuration(m.totalMins)}`);
  lines.push('', `הוצאות עבודה: ${money(m.total)}`,
             `· מנויים: ${money(m.subTotal)}`,
             `· חד־פעמי: ${money(m.oneTotal)}`);
  if (m.bySub.length) {
    lines.push('', 'מנויים שחויבו:');
    m.bySub.forEach(s => lines.push(`· ${s.name} — ${money(s.amount)}`));
  }
  if (m.oneSpend.length) {
    lines.push('', 'רכישות חד־פעמיות:');
    m.oneSpend.forEach(e => lines.push(`· ${e.spend_date} ${e.title} — ${money(e.amount)}`));
  }
  if (m.clients.length) {
    lines.push('', 'לפי לקוח:');
    m.clients.forEach(c => lines.push(
      `· ${c.name} — ${c.done}/${c.total}${c.mins ? ` (${humanDuration(c.mins)})` : ''}${c.spend ? ` · הוצאות ${money(c.spend)}` : ''}`));
  }
  return lines.join('\n');
}

function closeReport() { reportSheet.root.hidden = true; }
$$('[data-report-close]').forEach(b => b.addEventListener('click', closeReport));
$('#reportBtn').addEventListener('click', openReport);
$('#repDay').addEventListener('click',   () => { reportMode = 'day';   drawReport(); });
$('#repMonth').addEventListener('click', () => { reportMode = 'month'; reportMonth = monthOf(state.date); drawReport(); });

/* ============================================================
   CLOUD  (Supabase)
   ============================================================ */
const COLS = 'id,task_date,title,done,completed_at,status,collapsed,position,subtasks,' +
             'client,planned_at,started_at,finished_at,moved_from,created_at,updated_at';

const toRow = t => ({
  id: t.id,
  user_id: state.user.id,
  task_date: t.task_date,
  title: t.title,
  done: t.done,
  completed_at: t.completed_at ?? null,
  status: t.status ?? null,
  collapsed: t.collapsed,
  position: t.position,
  subtasks: t.subtasks,
  client: t.client ?? null,
  planned_at: t.planned_at ?? null,
  started_at: t.started_at ?? null,
  finished_at: t.finished_at ?? null,
  moved_from: t.moved_from ?? null,
  created_at: t.created_at,
  updated_at: t.updated_at,
});

const SUB_COLS = 'id,name,amount,billing_day,active,started_on,cancelled_on,note,payer,position,created_at,updated_at';
const EXP_COLS = 'id,spend_date,title,amount,kind,subscription_id,period,client,note,payer,pot_id,settled_by,created_at,updated_at';
const INC_COLS = 'id,received_on,client,title,amount,note,created_at,updated_at';
const POT_COLS  = 'id,name,share,colour,position,created_at,updated_at';
const TXN_COLS  = 'id,pot_id,happened_on,amount,kind,title,source_id,note,created_at,updated_at';
const GOAL_COLS = 'id,pot_id,title,target,done,position,created_at,updated_at';

const subToRow = s => ({
  id: s.id,
  user_id: state.user.id,
  name: s.name,
  amount: s.amount,
  billing_day: s.billing_day,
  active: s.active,
  started_on: s.started_on ?? null,
  cancelled_on: s.cancelled_on ?? null,
  note: s.note ?? null,
  payer: s.payer ?? null,
  position: s.position ?? 0,
  created_at: s.created_at,
  updated_at: s.updated_at,
});

const expToRow = e => ({
  id: e.id,
  user_id: state.user.id,
  spend_date: e.spend_date,
  title: e.title,
  amount: e.amount,
  kind: e.kind,
  subscription_id: e.subscription_id ?? null,
  period: e.period ?? null,
  client: e.client ?? null,
  note: e.note ?? null,
  payer: e.payer ?? null,
  pot_id: e.pot_id ?? null,
  settled_by: e.settled_by ?? null,
  created_at: e.created_at,
  updated_at: e.updated_at,
});

const incToRow = i => ({
  id: i.id,
  user_id: state.user.id,
  received_on: i.received_on,
  client: i.client ?? null,
  title: i.title ?? null,
  amount: i.amount,
  note: i.note ?? null,
  created_at: i.created_at,
  updated_at: i.updated_at,
});

const potToRow = p => ({
  id: p.id, user_id: state.user.id,
  name: p.name, share: p.share, colour: p.colour ?? null,
  position: p.position ?? 0,
  created_at: p.created_at, updated_at: p.updated_at,
});

const txnToRow = t => ({
  id: t.id, user_id: state.user.id,
  pot_id: t.pot_id, happened_on: t.happened_on, amount: t.amount,
  kind: t.kind, title: t.title ?? null, source_id: t.source_id ?? null, note: t.note ?? null,
  created_at: t.created_at, updated_at: t.updated_at,
});

const goalToRow = g => ({
  id: g.id, user_id: state.user.id,
  pot_id: g.pot_id ?? null, title: g.title, target: g.target, done: !!g.done,
  position: g.position ?? 0,
  created_at: g.created_at, updated_at: g.updated_at,
});

/** Everything the sync layer needs to know about each table. */
const TABLES = {
  tasks:         { list: () => state.tasks,    row: toRow    },
  subscriptions: { list: () => state.subs,     row: subToRow },
  expenses:      { list: () => state.expenses, row: expToRow },
  income:        { list: () => state.income,   row: incToRow },
  pots:          { list: () => state.pots,     row: potToRow },
  pot_txns:      { list: () => state.txns,     row: txnToRow },
  goals:         { list: () => state.goals,    row: goalToRow },
};

function setStatus(s, label) {
  state.status = s;
  el.syncChip.dataset.state = s;
  $('.sync-chip__text', el.syncChip).textContent =
    label ?? { local: 'מקומי', syncing: 'מסנכרן…', synced: 'מסונכרן', error: 'שגיאה' }[s];
  el.footStatus.textContent = s === 'synced'
    ? 'הנתונים מסונכרנים בענן הפרטי שלך'
    : s === 'error'
      ? 'הסנכרון נכשל — הנתונים שמורים במכשיר'
      : 'הנתונים נשמרים במכשיר הזה';
}

async function connect() {
  const { url, key } = state.cfg;
  if (!url || !key) { setStatus('local'); return false; }
  try {
    const { createClient } = await import('./supabase.js');
    state.sb = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lera.auth' },
    });
    const { data } = await state.sb.auth.getSession();
    state.user = data?.session?.user ?? null;
    state.sb.auth.onAuthStateChange((_e, session) => {
      state.user = session?.user ?? null;
      renderAccount();
      if (state.user) sync();
    });
    return true;
  } catch (err) {
    console.error(err);
    setStatus('error');
    return false;
  }
}

let flushing = false;
async function flush() {
  if (flushing || !state.sb || !state.user || !state.queue.length || !navigator.onLine) return;
  flushing = true;
  setStatus('syncing');
  try {
    while (state.queue.length) {
      const op = state.queue[0];
      const table = op.table ?? 'tasks';
      const spec = TABLES[table];

      if (op.type === 'delete') {
        const { error } = await state.sb.from(table).delete().eq('id', op.id);
        if (error) throw error;
      } else if (spec) {
        const row = spec.list().find(r => r.id === op.id);
        if (row) {
          const { error } = await state.sb.from(table).upsert(spec.row(row));
          if (error) throw error;
        }
      }
      state.queue.shift();
      write(LS.queue, state.queue);
    }
    setStatus('synced');
  } catch (err) {
    console.error('sync failed', err);
    setStatus('error');
  } finally {
    flushing = false;
  }
}

async function pull() {
  if (!state.sb || !state.user) return;
  setStatus('syncing');
  try {
    const dates = [state.date, shiftDate(state.date, -1), shiftDate(state.date, 1)];

    // the days in view, plus anything that was pushed forward off this day
    const [mainRes, pushedRes] = await Promise.all([
      state.sb.from('tasks').select(COLS).in('task_date', dates),
      state.sb.from('tasks').select(COLS).eq('moved_from', state.date),
    ]);
    if (mainRes.error)   throw mainRes.error;
    if (pushedRes.error) throw pushedRes.error;

    const pending = new Set(state.queue.map(o => o.id));
    const byId = new Map();
    for (const r of [...(mainRes.data ?? []), ...(pushedRes.data ?? [])]) {
      if (!pending.has(r.id)) byId.set(r.id, r);
    }
    const incoming = [...byId.values()];
    const incomingIds = new Set(byId.keys());

    state.tasks = [
      ...state.tasks.filter(t =>
        (!dates.includes(t.task_date) || pending.has(t.id)) && !incomingIds.has(t.id)),
      ...incoming.map(normalize),
    ];

    // open tasks left behind on earlier dates
    const { data: earlier } = await state.sb
      .from('tasks').select('id,task_date,title')
      .eq('done', false).lt('task_date', state.date)
      .order('task_date', { ascending: false }).limit(200);
    state.earlier = earlier ?? [];

    /* --- money tables: all small, so fetch everything --- */
    const [subsRes, expRes, incRes, potRes, txnRes, goalRes] = await Promise.all([
      state.sb.from('subscriptions').select(SUB_COLS).order('position'),
      state.sb.from('expenses').select(EXP_COLS).order('spend_date'),
      state.sb.from('income').select(INC_COLS).order('received_on'),
      state.sb.from('pots').select(POT_COLS).order('position'),
      state.sb.from('pot_txns').select(TXN_COLS).order('happened_on'),
      state.sb.from('goals').select(GOAL_COLS).order('position'),
    ]);
    if (subsRes.error) throw subsRes.error;
    if (expRes.error)  throw expRes.error;
    if (incRes.error)  throw incRes.error;
    if (potRes.error)  throw potRes.error;
    if (txnRes.error)  throw txnRes.error;
    if (goalRes.error) throw goalRes.error;

    state.subs = [
      ...state.subs.filter(s => pending.has(s.id)),
      ...(subsRes.data ?? []).filter(s => !pending.has(s.id)).map(normalizeSub),
    ];
    state.expenses = [
      ...state.expenses.filter(e => pending.has(e.id)),
      ...(expRes.data ?? []).filter(e => !pending.has(e.id)).map(normalizeExp),
    ];
    state.income = [
      ...state.income.filter(i => pending.has(i.id)),
      ...(incRes.data ?? []).filter(i => !pending.has(i.id)).map(normalizeInc),
    ];
    state.pots = [
      ...state.pots.filter(p => pending.has(p.id)),
      ...(potRes.data ?? []).filter(p => !pending.has(p.id)).map(normalizePot),
    ];
    state.txns = [
      ...state.txns.filter(t => pending.has(t.id)),
      ...(txnRes.data ?? []).filter(t => !pending.has(t.id)).map(normalizeTxn),
    ];
    state.goals = [
      ...state.goals.filter(g => pending.has(g.id)),
      ...(goalRes.data ?? []).filter(g => !pending.has(g.id)).map(normalizeGoal),
    ];

    ensureCharges();
    persist();
    setStatus('synced');
  } catch (err) {
    console.error('pull failed', err);
    setStatus('error');
  }
}

async function sync() {
  if (!state.sb || !state.user) { setStatus('local'); return; }
  await flush();
  await pull();
  render();
}

async function carryOver() {
  const ids = state.earlier.filter(t => t.task_date < state.date).map(t => t.id);
  if (!ids.length) return;

  if (state.sb && state.user) {
    setStatus('syncing');
    const { error } = await state.sb
      .from('tasks')
      .update({ task_date: state.date, moved_from: null, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { console.error(error); setStatus('error'); toast('ההעברה נכשלה'); return; }
  }
  // local mirror
  let p = nextPosition(state.date);
  ids.forEach(id => {
    const t = state.tasks.find(x => x.id === id);
    if (t) { t.task_date = state.date; t.moved_from = null; t.position = p++; t.updated_at = new Date().toISOString(); }
  });
  state.earlier = [];
  persist();
  await pull();
  render();
  toast(`${ids.length} משימות הועברו להיום`);
}

/* ============================================================
   SETTINGS SHEET
   ============================================================ */
const sheet = {
  root:     $('#sheet'),
  url:      $('#cfgUrl'),
  key:      $('#cfgKey'),
  connect:  $('#connectBtn'),
  divider:  $('#authDivider'),
  authBox:  $('#authBox'),
  email:    $('#cfgEmail'),
  pass:     $('#cfgPass'),
  signIn:   $('#signInBtn'),
  signUp:   $('#signUpBtn'),
  account:  $('#accountBox'),
  accEmail: $('#accountEmail'),
  accInit:  $('#accountInitial'),
  accState: $('#accountState'),
  syncNow:  $('#syncNowBtn'),
  signOut:  $('#signOutBtn'),
  msg:      $('#sheetMsg'),
};

function openSheet() {
  sheet.url.value = state.cfg.url;
  sheet.key.value = state.cfg.key;
  renderAccount();
  sheet.root.hidden = false;
  (state.user ? sheet.syncNow : state.sb ? sheet.email : sheet.url).focus();
}
function closeSheet() { sheet.root.hidden = true; sheet.msg.hidden = true; }

function renderAccount() {
  const connected = !!state.sb;
  sheet.divider.hidden = !connected || !!state.user;
  sheet.authBox.hidden = !connected || !!state.user;
  sheet.account.hidden = !state.user;

  if (state.user) {
    sheet.accEmail.textContent = state.user.email ?? '';
    sheet.accInit.textContent  = (state.user.email ?? '?').charAt(0);
    sheet.accState.textContent = { synced: 'מסונכרן', syncing: 'מסנכרן…', error: 'שגיאת סנכרון', local: 'מקומי' }[state.status];
  }
  sheet.connect.textContent = connected ? 'עדכון פרטי החיבור' : 'חיבור לפרויקט';
}

function sheetMsg(text, tone = 'info') {
  sheet.msg.textContent = text;
  sheet.msg.dataset.tone = tone;
  sheet.msg.hidden = false;
}

/* human-readable Supabase errors */
function explain(err) {
  const m = (err?.message ?? '').toLowerCase();
  if (m.includes('invalid login'))          return 'אימייל או סיסמה שגויים.';
  if (m.includes('email not confirmed'))    return 'צריך לאשר את המייל שנשלח אליך לפני הכניסה.';
  if (m.includes('already registered'))     return 'החשבון כבר קיים — אפשר להתחבר.';
  if (m.includes('relation') && m.includes('does not exist'))
                                            return 'טבלת tasks חסרה. הריצי את supabase/schema.sql ב-SQL Editor.';
  if (m.includes('column') && /status|client|planned_at|started_at|finished_at/.test(m))
                                            return 'חסרה עמודה בטבלה. הריצי שוב את supabase/schema.sql ב-SQL Editor.';
  if (m.includes('password'))               return 'הסיסמה חייבת להכיל לפחות 6 תווים.';
  return err?.message ?? 'משהו השתבש.';
}

sheet.connect.addEventListener('click', async () => {
  const url = sheet.url.value.trim().replace(/\/+$/, '');
  const key = sheet.key.value.trim();
  if (!url || !key) return sheetMsg('צריך למלא גם כתובת וגם מפתח.', 'error');
  if (!/^https:\/\/.+\.supabase\.(co|in)$/.test(url))
    return sheetMsg('הכתובת אמורה להיראות כך: https://xxxx.supabase.co', 'error');

  state.cfg = { url, key };
  write(LS.cfg, state.cfg);
  sheetMsg('מתחבר…');
  const ok = await connect();
  renderAccount();
  if (ok) { sheetMsg('הפרויקט חובר. עכשיו התחברי עם אימייל וסיסמה.', 'ok'); sheet.email.focus(); }
  else sheetMsg('החיבור נכשל. בדקי את הכתובת והמפתח.', 'error');
});

async function auth(kind) {
  const email = sheet.email.value.trim();
  const password = sheet.pass.value;
  if (!email || !password) return sheetMsg('צריך אימייל וסיסמה.', 'error');

  const btn = kind === 'in' ? sheet.signIn : sheet.signUp;
  btn.disabled = true;
  try {
    const fn = kind === 'in' ? 'signInWithPassword' : 'signUp';
    const { data, error } = await state.sb.auth[fn]({ email, password });
    if (error) throw error;

    if (kind === 'up' && !data.session) {
      sheetMsg('נשלח אליך מייל לאישור. אחרי האישור אפשר להיכנס.', 'ok');
      return;
    }
    state.user = data.user;
    renderAccount();
    sheetMsg('מחובר. מסנכרן…', 'ok');
    await sync();
    sheetMsg('הכול מסונכרן ✓', 'ok');
    setTimeout(closeSheet, 700);
  } catch (err) {
    sheetMsg(explain(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

sheet.signIn.addEventListener('click', () => auth('in'));
sheet.signUp.addEventListener('click', () => auth('up'));
sheet.pass.addEventListener('keydown', e => { if (e.key === 'Enter') auth('in'); });

sheet.syncNow.addEventListener('click', async () => {
  sheet.syncNow.disabled = true;
  await sync();
  renderAccount();
  sheet.syncNow.disabled = false;
  toast(state.status === 'synced' ? 'סונכרן ✓' : 'הסנכרון נכשל');
});

sheet.signOut.addEventListener('click', async () => {
  await state.sb?.auth.signOut();
  state.user = null;
  setStatus('local');
  renderAccount();
  sheetMsg('התנתקת. הנתונים נשארים במכשיר.', 'info');
});

$$('[data-close]').forEach(b => b.addEventListener('click', closeSheet));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  // ה-?. שומר על האפליקציה גם אם ה-HTML בדפדפן ישן מהמטמון וחסר בו חלק
  if (menuEl) closeMenu();
  else if (doneSheet.root?.hidden   === false) { closeDoneSheet(); render(); }
  else if (clientSheet.root?.hidden === false) closeClientSheet();
  else if (dateSheet.root?.hidden   === false) closeDateSheet();
  else if (subSheet.root?.hidden    === false) closeSubSheet();
  else if (expSheet.root?.hidden    === false) closeExpSheet();
  else if (incSheet.root?.hidden    === false) closeIncSheet();
  else if (moveSheet.root?.hidden   === false) closeMoveSheet();
  else if (potSheet.root?.hidden    === false) closePotSheet();
  else if (splitSheet.root?.hidden  === false) closeSplitSheet();
  else if (bankSheet.root?.hidden   === false) closeBank();
  else if (walletSheet.root?.hidden === false) closeWallet();
  else if (reportSheet.root?.hidden === false) closeReport();
  else if (!sheet.root.hidden) closeSheet();
});

/* ============================================================
   EVENTS
   ============================================================ */
$('#settingsBtn').addEventListener('click', openSheet);
el.syncChip.addEventListener('click', () => (state.user ? sync() : openSheet()));

el.addForm.addEventListener('submit', e => {
  e.preventDefault();
  const v = el.addInput.value.trim();
  if (!v) return;
  addTask(v);
  el.addInput.value = '';
  el.addForm.classList.remove('is-active');
  render();
  el.addInput.focus();
});
el.addInput.addEventListener('input', () => {
  el.addForm.classList.toggle('is-active', el.addInput.value.trim().length > 0);
});

function goto(date) {
  state.date = date;
  render();
  pull().then(render);
}
$('#prevDay').addEventListener('click', () => goto(shiftDate(state.date, -1)));
$('#nextDay').addEventListener('click', () => goto(shiftDate(state.date,  1)));
el.todayBtn.addEventListener('click', () => goto(isoDate()));
el.datePicker.addEventListener('change', e => { if (e.target.value) goto(e.target.value); });

el.doneToggle.addEventListener('click', () => {
  state.ui.doneOpen = !state.ui.doneOpen;
  write(LS.ui, state.ui);
  render();
});

$('#carryoverBtn').addEventListener('click', carryOver);

/* keyboard: "n" focuses the composer */
document.addEventListener('keydown', e => {
  if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  e.preventDefault();
  el.addInput.focus();
});

window.addEventListener('online',  () => sync());
window.addEventListener('offline', () => setStatus('error', 'לא מקוון'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

/* the calendar rolls over while the tab is open */
setInterval(() => {
  const today = isoDate();
  if (state.date !== today && el.todayBtn.hidden) goto(today);
}, 60_000);

/* ============================================================
   BOOT
   ============================================================ */
(async function boot() {
  setStatus('local');
  ensureCharges();
  render();
  if (await connect()) {
    renderAccount();
    if (state.user) await sync();
    else setStatus('local');
  }
  ensureCharges();
  render();
})();
