/* ============================================================
   המשימות שלי — app logic
   Offline-first: every change writes to localStorage immediately
   and is queued for Supabase. Cloud is source of truth on load.
   ============================================================ */

const LS = {
  tasks: 'tasks.v1',
  queue: 'queue.v1',
  cfg:   'cfg.v1',
  ui:    'ui.v1',
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

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'לילה טוב';
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  if (h < 21) return 'ערב טוב';
  return 'לילה טוב';
}

/* ============================================================
   STATE
   ============================================================ */
const state = {
  date:    isoDate(),
  tasks:   read(LS.tasks, []),
  queue:   read(LS.queue, []),
  cfg:     read(LS.cfg, { url: '', key: '' }),
  ui:      read(LS.ui, { doneOpen: true }),
  user:    null,
  sb:      null,
  status:  'local',   // local | syncing | synced | error
  earlier: [],        // open tasks from previous dates
};

const persist = () => { write(LS.tasks, state.tasks); write(LS.queue, state.queue); };

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
function touch(task) {
  task.updated_at = new Date().toISOString();
  queueOp({ type: 'upsert', id: task.id });
  persist();
}

function queueOp(op) {
  state.queue = state.queue.filter(o => o.id !== op.id);
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
    collapsed: true,
    position: nextPosition(state.date),
    subtasks: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  state.tasks.push(task);
  touch(task);
  return task;
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  queueOp({ type: 'delete', id });
  persist();
}

/** Toggling the parent cascades to every subtask — predictable both ways. */
function setTaskDone(task, done) {
  task.done = done;
  task.completed_at = done ? new Date().toISOString() : null;
  task.subtasks = task.subtasks.map(s => ({ ...s, done }));
  if (done) task.collapsed = true;
  touch(task);
}

/** Toggling a subtask rolls up: all done → parent done; any open → parent open. */
function setSubDone(task, subId, done) {
  const sub = task.subtasks.find(s => s.id === subId);
  if (!sub) return;
  sub.done = done;

  const all = task.subtasks.length > 0 && task.subtasks.every(s => s.done);
  if (all && !task.done) {
    task.done = true;
    task.completed_at = new Date().toISOString();
    task.collapsed = true;
  } else if (!all && task.done) {
    task.done = false;
    task.completed_at = null;
  }
  touch(task);
}

function addSub(task, title) {
  task.subtasks.push({ id: uid(), title: title.trim(), done: false });
  // A new open subtask reopens a completed parent.
  if (task.done) { task.done = false; task.completed_at = null; }
  touch(task);
}

function deleteSub(task, subId) {
  task.subtasks = task.subtasks.filter(s => s.id !== subId);
  if (task.subtasks.length && task.subtasks.every(s => s.done) && !task.done) {
    task.done = true;
    task.completed_at = new Date().toISOString();
  }
  touch(task);
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
  statPct:     $('#statPct'),
  ring:        $('#ring'),
  addForm:     $('#addForm'),
  addInput:    $('#addInput'),
  activeList:  $('#activeList'),
  doneList:    $('#doneList'),
  doneSection: $('#doneSection'),
  doneToggle:  $('#doneToggle'),
  doneCount:   $('#doneCount'),
  emptyState:  $('#emptyState'),
  carryover:   $('#carryover'),
  carryCount:  $('#carryoverCount'),
  syncChip:    $('#syncChip'),
  footStatus:  $('#footStatus'),
  toast:       $('#toast'),
};

const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev:  '<svg viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x:     '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  plus:  '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

/** Without a cloud connection the carry-over list comes from the local cache. */
function localEarlier() {
  return state.tasks
    .filter(t => !t.done && t.task_date < state.date)
    .map(({ id, task_date, title }) => ({ id, task_date, title }));
}

function render() {
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
  el.statOpen.textContent = active.length;
  el.statDone.textContent = done.length;
  el.statPct.textContent  = pct + '%';
  el.ring.style.setProperty('--p', pct);

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
  el.carryCount.textContent = carry.length === 1 ? 'משימה אחת' : `${carry.length} משימות`;
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
    setTaskDone(task, !task.done);
    animateOut(li, render);
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

  if (total) {
    const meta = document.createElement('div');
    meta.className = 'task__meta';
    const bar = document.createElement('div');
    bar.className = 'mini';
    bar.innerHTML = `<span style="width:${Math.round(doneN / total * 100)}%"></span>`;
    const txt = document.createElement('span');
    txt.textContent = `${doneN} מתוך ${total} תת־משימות`;
    meta.append(bar, txt);
    main.append(meta);
  }

  const actions = document.createElement('div');
  actions.className = 'task__actions';

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

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'task__btn task__btn--del';
  del.setAttribute('aria-label', 'מחיקת המשימה');
  del.innerHTML = ICON.trash;
  del.addEventListener('click', () => {
    deleteTask(task.id);
    animateOut(li, render);
    toast('המשימה נמחקה');
  });

  actions.append(chev, del);
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
    if (!wasDone && task.done) {
      animateOut($(`.task[data-id="${task.id}"]`), render);
      toast('המשימה הושלמה 🎉');
    } else {
      render();
    }
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

  div.append(check, title, del);
  return div;
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
   CLOUD  (Supabase)
   ============================================================ */
const COLS = 'id,task_date,title,done,completed_at,collapsed,position,subtasks,created_at,updated_at';

const toRow = t => ({
  id: t.id,
  user_id: state.user.id,
  task_date: t.task_date,
  title: t.title,
  done: t.done,
  completed_at: t.completed_at,
  collapsed: t.collapsed,
  position: t.position,
  subtasks: t.subtasks,
  created_at: t.created_at,
  updated_at: t.updated_at,
});

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
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.4');
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
      if (op.type === 'delete') {
        const { error } = await state.sb.from('tasks').delete().eq('id', op.id);
        if (error) throw error;
      } else {
        const task = state.tasks.find(t => t.id === op.id);
        if (task) {
          const { error } = await state.sb.from('tasks').upsert(toRow(task));
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

    const { data, error } = await state.sb
      .from('tasks').select(COLS).in('task_date', dates);
    if (error) throw error;

    const pending = new Set(state.queue.map(o => o.id));
    const incoming = (data ?? []).filter(r => !pending.has(r.id));
    const incomingIds = new Set(incoming.map(r => r.id));

    state.tasks = [
      ...state.tasks.filter(t =>
        (!dates.includes(t.task_date) || pending.has(t.id)) && !incomingIds.has(t.id)),
      ...incoming.map(r => ({ ...r, subtasks: r.subtasks ?? [] })),
    ];

    // open tasks left behind on earlier dates
    const { data: earlier } = await state.sb
      .from('tasks').select('id,task_date,title')
      .eq('done', false).lt('task_date', state.date)
      .order('task_date', { ascending: false }).limit(200);
    state.earlier = earlier ?? [];

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
      .update({ task_date: state.date, updated_at: new Date().toISOString() })
      .in('id', ids);
    if (error) { console.error(error); setStatus('error'); toast('ההעברה נכשלה'); return; }
  }
  // local mirror
  let p = nextPosition(state.date);
  ids.forEach(id => {
    const t = state.tasks.find(x => x.id === id);
    if (t) { t.task_date = state.date; t.position = p++; t.updated_at = new Date().toISOString(); }
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
  if (e.key === 'Escape' && !sheet.root.hidden) closeSheet();
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
  render();
  if (await connect()) {
    renderAccount();
    if (state.user) await sync();
    else setStatus('local');
  }
  render();
})();
