/* ============================================================
   המשימות שלי — app logic
   Offline-first: every change writes to localStorage immediately
   and is queued for Supabase. Cloud is source of truth on load.
   ============================================================ */

const LS = {
  tasks:   'tasks.v1',
  queue:   'queue.v1',
  cfg:     'cfg.v1',
  ui:      'ui.v1',
  clients: 'clients.v1',
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
  client: null, planned_at: null, started_at: null, finished_at: null,
  ...t,
  subtasks: (t.subtasks ?? []).map(s => ({ status: null, ...s })),
});

const state = {
  date:    isoDate(),
  tasks:   read(LS.tasks, []).map(normalize),
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
    status: null,        // null | 'doing' | 'waiting'
    collapsed: true,
    position: nextPosition(state.date),
    subtasks: [],
    client: null,        // free-text client tag
    planned_at: null,    // 'HH:MM' — when it is meant to happen
    started_at: null,    // ISO — filled from the completion sheet
    finished_at: null,   // ISO — stamped the moment it is checked off
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

/** Reschedule to another day — appended to the end of the target day. */
function moveTask(task, date) {
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

    const pick = document.createElement('label');
    pick.className = 'menu__item menu__item--date';
    pick.innerHTML = `<span class="menu__icon">${ICON.cal}</span><span>בחירת תאריך…</span>`;
    const input = document.createElement('input');
    input.type = 'date';
    input.value = task.task_date;
    input.setAttribute('aria-label', 'העברת המשימה לתאריך');
    input.addEventListener('change', () => {
      if (!input.value || input.value === task.task_date) return closeMenu();
      const date = input.value;
      closeMenu();
      doMove(task, date);
    });
    pick.append(input);
    menu.append(pick);
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

function openReport() {
  const d = reportData(state.date);
  const maxTotal = Math.max(1, ...d.clients.map(c => c.total));

  const clientRows = d.clients.map(c => `
    <div class="rep__bar">
      <div class="rep__bar-head">
        <span class="chip${c.name === NO_CLIENT ? '' : ' chip--client'}" style="--hue:${clientHue(c.name)}">${esc(c.name)}</span>
        <span class="rep__bar-meta">${c.done}/${c.total}${c.mins ? ' · ' + esc(humanDuration(c.mins)) : ''}</span>
      </div>
      <div class="rep__track"><i style="width:${Math.round(c.total / maxTotal * 100)}%"></i></div>
    </div>`).join('');

  const timeline = d.timed.length ? d.timed
    .sort((a, b) => (a.t.finished_at ?? '').localeCompare(b.t.finished_at ?? ''))
    .map(x => `
      <li class="rep__row">
        <span class="rep__time" dir="ltr">${hhmm(x.t.started_at)}–${hhmm(x.t.finished_at)}</span>
        <span class="rep__task">${esc(x.t.title)}</span>
        <span class="rep__dur">${esc(humanDuration(x.mins))}</span>
      </li>`).join('') : '';

  const leftovers = d.open.map(t => `<li class="rep__row rep__row--open"><span class="rep__task">${esc(t.title)}</span>${
    t.client ? `<span class="chip chip--client" style="--hue:${clientHue(t.client)}">${esc(t.client)}</span>` : ''
  }</li>`).join('');

  reportSheet.body.innerHTML = `
    <p class="rep__date">${esc(heDayName(state.date))} · ${esc(heDate(state.date))}</p>

    <div class="rep__hero">
      <div class="rep__ring" style="--pct:${d.pct}">
        <span>${d.pct}<small>%</small></span>
      </div>
      <div class="rep__kpis">
        <div class="rep__kpi"><b>${d.done.length}</b><span>הושלמו</span></div>
        <div class="rep__kpi"><b>${d.open.length}</b><span>נותרו</span></div>
        <div class="rep__kpi"><b>${d.totalMins ? esc(humanDuration(d.totalMins)) : '—'}</b><span>זמן עבודה</span></div>
      </div>
    </div>

    ${d.clients.length ? `<h3 class="rep__h">לפי לקוח</h3>${clientRows}` : ''}
    ${timeline ? `<h3 class="rep__h">מה נעשה ומתי</h3><ul class="rep__list">${timeline}</ul>` : ''}
    ${leftovers ? `<h3 class="rep__h">נשאר פתוח</h3><ul class="rep__list">${leftovers}</ul>` : ''}
    ${d.rows.length ? '' : '<p class="rep__empty">אין משימות ליום הזה.</p>'}

    <div class="btn-row rep__actions">
      <button class="btn btn--primary" id="repCopy" type="button">העתקת הדוח</button>
    </div>`;

  $('#repCopy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(reportText(d)); toast('הדוח הועתק'); }
    catch { toast('ההעתקה נכשלה'); }
  });

  reportSheet.root.hidden = false;
}

function reportText(d) {
  const lines = [
    `דוח משימות · ${heDayName(state.date)} ${heDate(state.date)}`,
    `הושלמו ${d.done.length} מתוך ${d.rows.length} (${d.pct}%)`,
  ];
  if (d.totalMins) lines.push(`זמן עבודה מתועד: ${humanDuration(d.totalMins)}`);
  if (d.clients.length) {
    lines.push('', 'לפי לקוח:');
    d.clients.forEach(c => lines.push(`· ${c.name} — ${c.done}/${c.total}${c.mins ? ` (${humanDuration(c.mins)})` : ''}`));
  }
  if (d.timed.length) {
    lines.push('', 'מה נעשה:');
    d.timed.forEach(x => lines.push(`· ${hhmm(x.t.started_at)}–${hhmm(x.t.finished_at)} ${x.t.title} (${humanDuration(x.mins)})`));
  }
  if (d.open.length) {
    lines.push('', 'נשאר פתוח:');
    d.open.forEach(t => lines.push(`· ${t.title}`));
  }
  return lines.join('\n');
}

function closeReport() { reportSheet.root.hidden = true; }
$$('[data-report-close]').forEach(b => b.addEventListener('click', closeReport));
$('#reportBtn').addEventListener('click', openReport);

/* ============================================================
   CLOUD  (Supabase)
   ============================================================ */
const COLS = 'id,task_date,title,done,completed_at,status,collapsed,position,subtasks,' +
             'client,planned_at,started_at,finished_at,created_at,updated_at';

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
      ...incoming.map(normalize),
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
  if (menuEl) closeMenu();
  else if (!doneSheet.root.hidden)   { closeDoneSheet(); render(); }
  else if (!clientSheet.root.hidden) closeClientSheet();
  else if (!reportSheet.root.hidden) closeReport();
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
  render();
  if (await connect()) {
    renderAccount();
    if (state.user) await sync();
    else setStatus('local');
  }
  render();
})();
