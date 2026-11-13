import { parts, seed, dateKey, blankDay, groupSets, parseImport } from './diary.mjs';
import { readPhotos, changePhotos } from './photos.mjs';
import { exportBackup, readBackup, restorePhotos } from './backup.mjs';

const root = document.querySelector('#fitness-journal');
const get = id => document.getElementById('fj-' + id);
const nav = root.querySelector('nav');
const editDone = get('edit-done');
const dock = get('dock');
const footer = get('footer');
new ResizeObserver(() => {
  root.style.setProperty('--footer-height', footer.getBoundingClientRect().height + 'px');
}).observe(footer);
const key = 'fitness-journal-v1';
let today = dateKey(new Date());
const defaultMoods = [['😊', '开心'], ['🔥', '练爽了'], ['😌', '平静'], ['😴', '疲惫'], ['☁️', '低落']];
let state = { library: seed, days: {} };
try {
  const stored = localStorage.getItem(key);
  if (stored) state = JSON.parse(stored);
} catch {
  alert('无法读取本机记录。');
}
let selectedDate = today;
let month = new Date();
month.setDate(1);
let filter = state.days[today]?.part || parts[0];
let openAction = '';
let editing = false;
const photoUrls = new Set();
const comparisonUrls = new Set();
const iconPaths = {
  today: 'M3 9v6m3-9v12m12-12v12m3-9v6M6 12h12',
  journal: 'M5 3h12a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2zm0 15a2 2 0 0 1 2-2h12M9 8h6m-6 4h4',
  calendar: 'M4 6h16v14H4zM8 4v4m8-4v4M4 11h16m-12 4h2m4 0h2',
  library: 'M4 5h7v6H4zm9 0h7v6h-7zm-9 8h7v6H4zm9 0h7v6h-7z',
  press: 'M3 8v4m3-6v8m12-8v8m3-6v4M6 10h12M4 18h16m-13 0v3m10-3v3',
  pull: 'M4 4h16M8 8v8m8-8v8m-11-3 3 3 3-3m2 0 3 3 3-3M8 20h8',
  fly: 'M12 19v-8m-1 1L5 6m8 6 6-6M5 10V6h4m6 0h4v4',
  squat: 'M11 4h2m-1 3v5l-5 4h7l3 4M5 8h14M5 6v4m14-4v4',
  bridge: 'M3 19h18M5 16l8-7 5 2 2 5M7 8h2',
};

function moodOptions() {
  return [...defaultMoods, ...(state.customMoods ?? [])];
}

function moodText(label) {
  if (!label) return '—';
  const icon = moodOptions().find(([, name]) => name === label)?.[0];
  return icon ? icon + ' ' + label : label;
}

function change(update) {
  const next = structuredClone(state);
  update(next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    alert('本机保存失败，请检查浏览器存储空间或权限。');
    return false;
  }
  state = next;
  return true;
}

function editDay(update) {
  return change(next => update(next.days[selectedDate] ??= blankDay()));
}

function add(parent, tag, label = '') {
  const el = document.createElement(tag);
  el.textContent = label;
  parent.append(el);
  return el;
}

function button(parent, label, click) {
  const el = add(parent, 'button', label);
  el.type = 'button';
  el.onclick = click;
  return el;
}

function pressed(el, value) {
  el.setAttribute('aria-pressed', String(value));
}

function field(parent, label, tag = 'input') {
  return add(add(parent, 'label', label), tag);
}

function svg(tag, attrs, parent) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  if (parent) parent.append(el);
  return el;
}

function prependIcon(el, type) {
  const icon = svg('svg', { class: 'line-icon', viewBox: '0 0 24 24', 'aria-hidden': 'true',
    fill: 'none', stroke: 'currentColor', 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  svg('path', { d: iconPaths[type] }, icon);
  el.prepend(icon);
}

function setText(sets) {
  return groupSets(sets).map(({ weight, reps, count }) => `${weight} kg × ${reps} 次 × ${count} 组`).join('\n');
}

function renderSetRows(parent, sets) {
  const list = add(parent, 'ol');
  list.className = 'set-list';
  for (const { weight, reps, count } of groupSets(sets)) {
    const row = add(list, 'li');
    add(row, 'span', `${weight} kg × ${reps} 次`).className = 'set-value';
    add(row, 'span', `× ${count} 组`).className = 'set-count';
  }
}

function hasTraining(day) {
  return day?.actions.some(action => action.sets.length || action.note.trim());
}

function historyFor(name, before) {
  return Object.keys(state.days).sort().reverse().flatMap(date => {
    if (before && date >= before) return [];
    const action = state.days[date].actions.find(item => item.name === name);
    return action && (action.sets.length || action.note) ? [{ date, ...action }] : [];
  });
}

function show(page) {
  get('photos').replaceChildren();
  get('day').querySelector('.photo-panel')?.remove();
  get('compare').replaceChildren();
  releasePhotoUrls();
  releasePhotoUrls(comparisonUrls);
  dock.hidden = true;
  for (const name of ['today', 'journal', 'calendar', 'entry', 'library']) get(name).hidden = name !== page;
  get('footer').hidden = page === 'entry';
  nav.querySelectorAll('button').forEach(el => pressed(el, el.dataset.page === page));
  if (page === 'today') renderToday();
  if (page === 'journal') renderJournal();
  if (page === 'calendar') renderCalendar();
  if (page === 'library') renderLibrary();
  if (page === 'entry') renderEntry();
  editDone.hidden = !editing || (page !== 'today' && page !== 'journal');
  get('subtitle').textContent = page === 'today' || page === 'journal' || page === 'entry'
    ? selectedDate : page === 'calendar' ? '训练与日记回顾' : '管理常用训练动作';
}

function actionEditor(parent, action) {
  const details = add(parent, 'details');
  details.open = action.name === openAction;
  const summary = add(details, 'summary');
  details.ontoggle = () => {
    if (!details.isConnected || get('today').hidden) return;
    if (details.open) {
      openAction = action.name;
      get('training').querySelectorAll('details[open]').forEach(other => {
        if (other !== details) other.open = false;
      });
      showDock();
    } else if (openAction === action.name) {
      openAction = '';
      dock.hidden = true;
    }
  };
  const previous = historyFor(action.name, selectedDate)[0];
  add(details, 'small', previous ? `上次 · ${previous.date}\n${setText(previous.sets)}${previous.note ? '\n' + previous.note : ''}` : '上次 · 暂无记录').className = 'previous-training';
  const fields = add(details, 'div');
  fields.className = 'fields';
  const weightField = add(fields, 'div');
  add(weightField, 'span', '重量（kg）').className = 'field-label';
  const wheel = add(weightField, 'span');
  wheel.className = 'wheel';
  const weight = add(wheel, 'input');
  weight.type = 'number';
  weight.min = '0';
  weight.step = 'any';
  weight.inputMode = 'decimal';
  weight.setAttribute('aria-label', '重量（kg）');
  const reps = field(fields, '次数');
  reps.type = 'number';
  reps.min = '1';
  reps.inputMode = 'numeric';
  function step(delta) {
    const value = Number.isFinite(weight.valueAsNumber) ? weight.valueAsNumber : 0;
    weight.value = Math.max(0, Number((value + delta).toFixed(8)));
  }
  for (const [label, delta] of [['−', -1], ['＋', 1]]) {
    const el = button(wheel, label, () => step(delta));
    el.setAttribute('aria-label', delta > 0 ? '增加 1 公斤' : '减少 1 公斤');
    if (delta < 0) wheel.prepend(el);
  }
  weight.addEventListener('wheel', event => {
    if (!event.deltaY) return;
    event.preventDefault();
    step(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  let startY;
  weight.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') {
      startY = event.clientY;
      weight.setPointerCapture(event.pointerId);
    }
  });
  weight.addEventListener('pointermove', event => {
    if (startY === undefined) return;
    const steps = Math.trunc((startY - event.clientY) / 24);
    if (steps) {
      step(steps);
      startY -= steps * 24;
    }
  });
  for (const event of ['pointerup', 'pointercancel']) weight.addEventListener(event, () => { startY = undefined; });

  function current(day = state.days[selectedDate]) {
    return day.actions.find(item => item.name === action.name);
  }
  const last = action.sets.at(-1);
  if (last) {
    weight.value = last.weight;
    reps.value = last.reps;
  }
  const rows = add(details, 'div');
  rows.setAttribute('aria-live', 'polite');
  const status = add(details, 'small');
  status.setAttribute('role', 'status');
  const controls = add(details, 'div');
  controls.className = 'row';
  function saveSet() {
    if (!Number.isFinite(weight.valueAsNumber) || !weight.checkValidity() ||
        !Number.isSafeInteger(reps.valueAsNumber) || !reps.checkValidity()) {
      status.textContent = '请填写有效的重量和次数。';
      if (!Number.isFinite(weight.valueAsNumber) || !weight.checkValidity()) weight.focus();
      else reps.focus();
      return;
    }
    if (editDay(day => current(day).sets.push({ weight: weight.valueAsNumber, reps: reps.valueAsNumber, count: 1 }))) {
      status.textContent = '';
      renderSets();
    }
  }
  function showDock() {
    dock.hidden = false;
    get('active-action').textContent = action.name;
    get('active-sets').textContent = summary.dataset.sets;
    get('quick-set').onclick = saveSet;
  }
  const undo = button(controls, '撤销最后一组', () => {
    if (editDay(day => {
      const sets = current(day).sets;
      if (sets.at(-1).count > 1) sets.at(-1).count--;
      else sets.pop();
    })) renderSets();
  });
  const note = field(details, '动作备注', 'textarea');
  note.rows = 2;
  note.value = action.note;
  note.onchange = () => editDay(day => { current(day).note = note.value; });
  button(controls, '移除动作', () => {
    const record = current();
    if ((record.sets.length || record.note.trim()) &&
        !confirm(`移除当天的「${action.name}」及其组数和备注？`)) return;
    if (!editDay(day => {
      day.actions = day.actions.filter(item => item.name !== action.name);
    })) return;
    openAction = '';
    renderToday();
    const chip = Array.from(get('actions').querySelectorAll('button')).find(el => el.textContent === action.name);
    (chip || get('filter')).focus();
  }).className = 'remove-action';
  function renderSets() {
    const sets = current().sets;
    summary.dataset.sets = '已记 ' + sets.reduce((count, set) => count + set.count, 0) + ' 组';
    summary.textContent = action.name + ' · ' + summary.dataset.sets;
    summary.className = 'action-label';
    prependIcon(summary, actionIcon(action.name));
    rows.replaceChildren();
    renderSetRows(rows, sets);
    undo.disabled = !sets.length;
    if (details.open && !get('today').hidden) showDock();
  }
  renderSets();
}

function renderToday() {
  const day = state.days[selectedDate] || blankDay();
  const chips = get('parts');
  chips.replaceChildren();
  parts.forEach(part => {
    const el = button(chips, part, () => {
      if (editDay(entry => { entry.part = part; })) {
        filter = part;
        renderToday();
      }
    });
    pressed(el, day.part === part);
  });
  get('filter').value = filter;
  renderActions();
  dock.hidden = true;
  get('training').replaceChildren();
  day.actions.forEach(action => actionEditor(add(get('training'), 'article'), action));
}

function renderJournal() {
  const day = state.days[selectedDate] || blankDay();
  renderMoods(day);
  get('note').value = day.note;
  const weight = get('body-weight');
  weight.value = day.bodyWeight ?? '';
  get('weight-status').textContent = '';
  renderPhotos(get('photos'), selectedDate, true);
  renderWeightTrend();
  if (get('compare-details').open) renderComparison();
}

function renderMoods(day) {
  const options = moodOptions();
  const group = get('moods');
  group.replaceChildren();
  for (const [icon, label] of options) {
    const el = button(group, label, () => {
      if (editDay(entry => { entry.mood = entry.mood === label ? '' : label; })) {
        group.querySelectorAll('button').forEach(item => pressed(item, item === el && state.days[selectedDate].mood === label));
      }
    });
    const symbol = add(el, 'span', icon);
    symbol.setAttribute('aria-hidden', 'true');
    el.prepend(symbol);
    pressed(el, day.mood === label);
  }
}

function renderWeightTrend() {
  const panel = get('trend');
  panel.replaceChildren();
  const dayMs = 86_400_000;
  const end = Date.parse(selectedDate);
  const points = Object.entries(state.days).flatMap(([date, day]) => {
    const age = (end - Date.parse(date)) / dayMs;
    return age >= 0 && age < 30 && Number.isFinite(day.bodyWeight) ? [{ date, age, kg: day.bodyWeight }] : [];
  }).sort((a, b) => b.age - a.age);
  if (points.length < 2) {
    add(panel, 'p', points.length
      ? '最近记录 ' + points[0].kg + ' kg。再记录一天就能看到变化。'
      : '近 30 天还没有体重记录。');
    return;
  }
  const weights = points.map(point => point.kg);
  const low = Math.min(...weights);
  const high = Math.max(...weights);
  const padding = Math.max(0.25, (high - low) * 0.15);
  const first = points[0];
  const last = points.at(-1);
  const x = point => 42 + (first.age - point.age) / (first.age - last.age) * 238;
  const y = point => 102 - (point.kg - low + padding) / (high - low + 2 * padding) * 82;
  const chart = svg('svg', { class: 'weight-chart', viewBox: '0 0 300 126', role: 'img',
    'aria-label': '近 30 天体重趋势，' + points.map(point => point.date + ' ' + point.kg + ' 公斤').join('，') }, panel);
  for (const kg of new Set([high, low])) {
    const row = y({ kg });
    svg('line', { x1: 42, x2: 280, y1: row, y2: row, stroke: 'var(--edge)' }, chart);
    svg('text', { x: 37, y: row + 4, 'text-anchor': 'end' }, chart).textContent = kg;
  }
  svg('polyline', { points: points.map(point => x(point) + ',' + y(point)).join(' '),
    fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, chart);
  for (const point of points) {
    const dot = svg('circle', { cx: x(point), cy: y(point), r: 3, fill: 'currentColor' }, chart);
    svg('title', {}, dot).textContent = point.date + ' · ' + point.kg + ' kg';
  }
  svg('text', { x: 42, y: 120 }, chart).textContent = first.date.slice(5);
  svg('text', { x: 280, y: 120, 'text-anchor': 'end' }, chart).textContent = last.date.slice(5);
  add(panel, 'small', '共 ' + points.length + ' 次记录 · 最近 ' + last.kg + ' kg').className = 'trend-caption';
}

function releasePhotoUrls(urls = photoUrls) {
  urls.forEach(url => URL.revokeObjectURL(url));
  urls.clear();
}

async function renderPhotos(panel, date, editable) {
  releasePhotoUrls();
  panel.replaceChildren();
  add(panel, 'h2', '日记照片');
  const status = add(panel, 'small');
  status.setAttribute('role', 'status');
  let picker;
  if (editable) {
    picker = field(panel, '添加照片');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.multiple = true;
    picker.onchange = async () => {
      const files = [...picker.files].filter(file => file.type.startsWith('image/') && file.type !== 'image/svg+xml');
      if (!files.length) {
        status.textContent = '请选择图片文件。';
        return;
      }
      picker.disabled = true;
      status.textContent = '正在保存照片…';
      try {
        await changePhotos(date, photos => [...photos, ...files.map(file => ({
          id: crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)),
            byte => byte.toString(16).padStart(2, '0')).join(''),
          file,
        }))]);
        if (picker.isConnected) renderPhotos(panel, date, editable);
        refreshComparison();
      } catch {
        picker.disabled = false;
        status.textContent = '照片保存失败，请检查本机存储空间后重试。';
      }
    };
  }
  const gallery = add(panel, 'div');
  gallery.className = 'photo-grid';
  try {
    const photos = await readPhotos(date);
    if (!gallery.isConnected) return;
    if (!photos.length) status.textContent = '这天还没有照片。';
    photos.forEach(({ id, file }, index) => {
      const item = add(gallery, 'figure');
      const url = URL.createObjectURL(file);
      photoUrls.add(url);
      const link = add(item, 'a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      const image = add(link, 'img');
      image.alt = '日记照片 ' + (index + 1);
      image.loading = 'lazy';
      image.src = url;
      image.onerror = () => { link.textContent = '打开原图'; };
      if (editable) button(item, '移除照片', async event => {
        if (!confirm('移除这张照片？')) return;
        const remove = event.currentTarget;
        remove.disabled = true;
        try {
          await changePhotos(date, current => current.filter(photo => photo.id !== id));
          if (gallery.isConnected) renderPhotos(panel, date, editable);
          refreshComparison();
        } catch {
          remove.disabled = false;
          status.textContent = '照片移除失败，请重试。';
        }
      }).setAttribute('aria-label', '移除照片 ' + (index + 1));
    });
  } catch {
    status.textContent = '无法读取本机照片。';
  }
}

function refreshComparison() {
  if (get('compare-details').open && !get('journal').hidden) renderComparison();
}

async function renderComparison() {
  const panel = get('compare');
  const previous = Array.from(panel.querySelectorAll('.compare-date'), select => select.value);
  panel.replaceChildren();
  releasePhotoUrls(comparisonUrls);
  const status = add(panel, 'small', '正在读取照片日期…');
  try {
    const dates = (await readPhotos()).sort().reverse();
    if (!status.isConnected) return;
    if (dates.length < 2) {
      status.textContent = '至少在两个不同日期添加照片，就可以并排对比。';
      return;
    }
    status.remove();
    const grid = add(panel, 'div');
    grid.className = 'photo-grid';
    for (const [index, side] of ['左侧', '右侧'].entries()) {
      const figure = add(grid, 'figure');
      const date = field(figure, side + '日期', 'select');
      date.className = 'compare-date';
      dates.forEach(value => date.add(new Option(value)));
      date.value = dates.includes(previous[index]) ? previous[index] : dates[1 - index];
      const slot = add(figure, 'div');
      let photoUrl;
      function clearPreview() {
        if (!photoUrl) return;
        URL.revokeObjectURL(photoUrl);
        comparisonUrls.delete(photoUrl);
        photoUrl = undefined;
      }
      date.onchange = async () => {
        clearPreview();
        slot.replaceChildren();
        const loading = add(slot, 'small', '正在读取…');
        try {
          const photos = await readPhotos(date.value);
          if (!loading.isConnected) return;
          slot.replaceChildren();
          const choice = photos.length > 1 ? field(slot, side + '照片', 'select') : null;
          if (choice) photos.forEach((_, i) => choice.add(new Option('照片 ' + (i + 1), i)));
          const image = add(slot, 'img');
          image.alt = side + '日记照片';
          image.onerror = () => { image.alt = '浏览器无法预览这张照片'; };
          function preview() {
            clearPreview();
            const file = photos[choice ? +choice.value : 0]?.file;
            if (!file) {
              image.alt = '当天没有照片';
              return;
            }
            photoUrl = URL.createObjectURL(file);
            comparisonUrls.add(photoUrl);
            image.alt = side + '日记照片';
            image.src = photoUrl;
          }
          if (choice) choice.onchange = preview;
          preview();
        } catch {
          loading.textContent = '无法读取照片。';
        }
      };
      date.onchange();
    }
  } catch {
    status.textContent = '无法读取本机照片。';
  }
}

function renderActions() {
  const chips = get('actions');
  chips.replaceChildren();
  state.library.filter(item => item.part === filter).forEach(({ name }) => {
    const chip = button(chips, name, () => {
      const existing = state.days[selectedDate]?.actions.some(item => item.name === name);
      if (!existing && !editDay(day => day.actions.push({ name, sets: [], note: '' }))) return;
      openAction = name;
      renderToday();
    });
    chip.classList.add('action-label');
    prependIcon(chip, actionIcon(name));
  });
  button(chips, '＋ 新动作', () => {
    show('library');
    get('new-part').value = filter;
    get('new').open = true;
    get('create').elements.namedItem('actionName').focus();
  });
}

function actionIcon(name) {
  if (/引体|下拉/.test(name)) return 'pull';
  if (/臀桥/.test(name)) return 'bridge';
  if (/蹲|内收/.test(name)) return 'squat';
  if (/飞鸟|夹胸|字举/.test(name)) return 'fly';
  if (/推/.test(name)) return 'press';
  return 'today';
}

function renderCalendar() {
  const grid = get('grid');
  grid.replaceChildren();
  const year = month.getFullYear();
  const m = month.getMonth();
  get('month').textContent = `${year} 年 ${m + 1} 月`;
  let count = 0;
  for (const label of '一二三四五六日') add(grid, 'small', label);
  const offset = (month.getDay() + 6) % 7;
  const cells = new Map();
  for (let i = 0; i < offset; i++) add(grid, 'span');
  for (let d = 1; d <= new Date(year, m + 1, 0).getDate(); d++) {
    const date = dateKey(new Date(year, m, d));
    const day = state.days[date];
    const trained = hasTraining(day);
    if (trained) count++;
    const el = button(grid, d, () => {
      selectedDate = date;
      show('entry');
      get('back').focus();
    });
    el.dataset.date = date;
    pressed(el, date === selectedDate);
    if (date === today) el.setAttribute('aria-current', 'date');
    if (trained) add(el, 'span', day.part || '练').className = 'mark';
    const mood = moodOptions().find(([, label]) => label === day?.mood);
    if (mood) add(el, 'span', mood[0]).className = 'mark circle';
    const extra = add(el, 'span', day?.bodyWeight != null ? '秤' : '');
    extra.className = 'day-extra';
    el.setAttribute('aria-label', [date, trained && (day.part || '有训练'), mood?.[1], day?.bodyWeight != null && '有体重'].filter(Boolean).join('，'));
    cells.set(date, extra);
  }
  readPhotos().then(dates => dates.forEach(date => {
    const extra = cells.get(date);
    if (!extra?.isConnected) return;
    extra.textContent += extra.textContent ? ' · 照' : '照';
    const cell = extra.parentElement;
    cell.setAttribute('aria-label', cell.getAttribute('aria-label') + '，有照片');
  })).catch(() => {});
  get('count').textContent = '本月训练 ' + count + ' 天';
}

function renderEntry() {
  const body = get('day');
  body.replaceChildren();
  const day = state.days[selectedDate];
  const overview = add(body, 'article');
  overview.className = 'entry-overview';
  add(overview, 'h2', selectedDate);
  const tags = add(overview, 'div');
  tags.className = 'row';
  add(tags, 'span', day?.part || '未选训练部位').className = 'mark';
  const total = day?.actions.reduce((sum, action) => sum + action.sets.reduce((count, set) => count + set.count, 0), 0) || 0;
  add(tags, 'small', total ? `共 ${total} 组训练` : '这天还没有训练组数');
  renderDay(body, day || blankDay());
  const photos = add(body, 'article');
  photos.className = 'photo-panel';
  renderPhotos(photos, selectedDate, false);
  const controls = add(body, 'div');
  controls.className = 'row';
  for (const [page, label] of [['today', '编辑训练'], ['journal', '编辑日记']]) {
    button(controls, label, () => {
      editing = true;
      filter = day?.part || parts[0];
      openAction = '';
      show(page);
    });
  }
}

function renderDay(parent, day) {
  const training = add(parent, 'section');
  training.className = 'day-section';
  add(training, 'h2', '训练内容');
  if (!day.actions.length) add(training, 'small', '这天还没有训练记录。');
  for (const action of day.actions) {
    const section = add(training, 'div');
    section.className = 'entry-action';
    const title = add(section, 'h3', action.name);
    title.className = 'action-label';
    prependIcon(title, actionIcon(action.name));
    if (action.sets.length) renderSetRows(section, action.sets);
    else add(section, 'small', '还没有记录组数');
    if (action.note) add(section, 'p', action.note).className = 'action-note';
  }
  const mood = add(parent, 'section');
  mood.className = 'day-section mood';
  add(mood, 'h2', '今日心情');
  if (day.mood) add(mood, 'p', moodText(day.mood)).className = 'entry-mood';
  else add(mood, 'small', '这天还没有记录心情。');
  const journal = add(parent, 'section');
  journal.className = 'day-section';
  add(journal, 'h2', '日记');
  if (day.bodyWeight != null) add(journal, 'p', '体重 · ' + day.bodyWeight + ' kg').className = 'entry-weight';
  if (day.note) add(journal, 'p', day.note);
  else add(journal, 'small', '这天还没有写日记。');
}

function renderLibrary() {
  const list = get('library-list');
  list.replaceChildren();
  parts.forEach(part => {
    const entries = state.library.filter(item => item.part === part);
    if (!entries.length) return;
    add(list, 'h3', part);
    entries.forEach(({ name }) => {
      const details = add(list, 'details');
      const summary = add(details, 'summary', name);
      summary.className = 'action-label';
      prependIcon(summary, actionIcon(name));
      const history = historyFor(name);
      if (!history.length) add(details, 'small', '暂无记录');
      history.forEach(({ date, sets, note }, index) => {
        add(details, 'p', (index === 0 ? '上次 · ' : '') + date).className = 'history-date';
        renderSetRows(details, sets);
        if (note) add(details, 'small', note);
      });
    });
  });
}

get('create').onsubmit = event => {
  event.preventDefault();
  const field = event.currentTarget.elements.namedItem('actionName');
  const name = field.value.trim();
  const part = get('new-part').value;
  const result = get('create-result');
  if (!name || state.library.some(item => item.name === name)) {
    result.textContent = name ? '动作库里已有同名动作。' : '请输入动作名称。';
    return;
  }
  if (!change(next => next.library.push({ name, part }))) return;
  field.value = '';
  filter = part;
  get('new').open = false;
  result.textContent = '已添加「' + name + '」 · ' + part;
  renderLibrary();
};

get('preview').onclick = () => {
  const panel = get('review');
  panel.replaceChildren();
  const { entries, issues } = parseImport(get('paste').value);
  if (!entries.size || issues.some(issue => issue.blocking)) {
    add(panel, 'p', '请检查日期格式、重复日期及日期前的文字。');
  }
  issues.forEach(({ i, line, blocking }) => add(panel, 'p', `第 ${i + 1} 行 · ${blocking ? '请修正' : '保留为备注，请核对'} · ${line}`));
  const selected = new Map();
  entries.forEach((day, date) => {
    const label = add(panel, 'label');
    const check = add(label, 'input');
    check.type = 'checkbox';
    check.style.width = 'auto';
    check.checked = !Object.hasOwn(state.days, date);
    selected.set(date, check);
    label.append(date + (check.checked ? '' : ' · 已有记录，勾选会替换训练与备注'));
    const summary = add(panel, 'div');
    renderDay(summary, day);
  });
  if (entries.size && !issues.some(issue => issue.blocking)) {
    button(panel, '确认保存勾选日期', () => {
      const dates = [...selected].filter(([, check]) => check.checked).map(([date]) => date);
      if (!dates.length) return;
      if (dates.some(date => Object.hasOwn(state.days, date)) && !confirm('替换勾选日期的训练与日记备注？')) return;
      if (!change(next => {
        dates.forEach(date => {
          const day = entries.get(date);
          const { part, note, actions } = day;
          next.days[date] = { ...(next.days[date] ?? blankDay()), part, note, actions };
          day.actions.forEach(({ name }) => {
            if (day.part && !next.library.some(item => item.name === name)) next.library.push({ name, part: day.part });
          });
        });
      })) return;
      panel.replaceChildren();
      get('paste').value = '';
      add(panel, 'p', `已导入 ${dates.length} 天。`);
      const [year, m] = dates[0].split('-').map(Number);
      month = new Date(year, m - 1, 1);
      renderCalendar();
    });
  }
};
get('paste').oninput = () => get('review').replaceChildren();

const backupStatus = get('backup-status');
const download = get('download');
const backupFile = get('backup-file');
const backupReview = get('backup-review');
get('export').onclick = async event => {
  const trigger = event.currentTarget;
  trigger.disabled = true;
  backupStatus.textContent = '正在打包本机记录…';
  if (download.hasAttribute('href')) URL.revokeObjectURL(download.href);
  download.hidden = true;
  try {
    download.href = URL.createObjectURL(await exportBackup(state));
    download.download = 'fitness-journal-' + today + '.json';
    download.hidden = false;
    backupStatus.textContent = '备份已生成。点击下载后，将文件传到新设备。';
  } catch {
    backupStatus.textContent = '生成备份失败，请重试。';
  } finally {
    trigger.disabled = false;
  }
};

backupFile.onchange = async () => {
  backupReview.replaceChildren();
  backupStatus.textContent = '';
  const file = backupFile.files[0];
  if (!file) return;
  backupFile.disabled = true;
  try {
    const backup = await readBackup(file);
    const days = Object.entries(backup.state.days);
    const photoCount = [...backup.photos.values()].reduce((total, photos) => total + photos.length, 0);
    add(backupReview, 'p', `备份包含 ${days.length} 天记录和 ${photoCount} 张照片。已有日期的训练和日记保留，照片会补入。`);
    button(backupReview, '确认导入备份', async event => {
      const trigger = event.currentTarget;
      trigger.disabled = true;
      backupFile.disabled = true;
      let added = 0;
      let saved = false;
      backupStatus.textContent = '正在导入到本机…';
      try {
        saved = change(next => {
          for (const [date, day] of days) {
            if (Object.hasOwn(next.days, date)) continue;
            next.days[date] = day;
            added++;
          }
          for (const action of backup.state.library) {
            if (!next.library.some(item => item.name === action.name)) next.library.push(action);
          }
          for (const mood of backup.state.customMoods ?? []) {
            if (!moodOptions().some(([, name]) => name === mood[1]) &&
                !(next.customMoods ??= []).some(([, name]) => name === mood[1])) next.customMoods.push(mood);
          }
        });
        if (!saved) {
          backupStatus.textContent = '本机记录保存失败，请重试。';
          return;
        }
        await restorePhotos(backup.photos);
        backupReview.replaceChildren();
        backupFile.value = '';
        backupStatus.textContent = `导入完成。新增 ${added} 天，保留 ${days.length - added} 天本机记录。`;
      } catch {
        backupStatus.textContent = saved ? '训练和日记已保存，照片尚未全部导入。可以点击确认重试。' : '导入失败，请重试。';
      } finally {
        trigger.disabled = false;
        backupFile.disabled = false;
        if (saved) {
          filter = state.days[selectedDate]?.part || parts[0];
          if (!get('journal').hidden) renderJournal();
          if (!get('today').hidden) renderToday();
          if (!get('calendar').hidden) renderCalendar();
          if (!get('library').hidden) renderLibrary();
        }
      }
    });
  } catch {
    backupStatus.textContent = '无法读取备份，请选择健身日记导出的 JSON 文件。';
  } finally {
    backupFile.disabled = false;
  }
};

for (const part of parts) {
  get('filter').add(new Option(part));
  get('new-part').add(new Option(part));
}
get('note').onchange = event => {
  const input = event.target;
  if (!editDay(entry => { entry.note = input.value; })) input.value = state.days[selectedDate]?.note || '';
};
const weightField = get('body-weight');
weightField.onchange = () => {
  const status = get('weight-status');
  if (!weightField.checkValidity()) {
    status.textContent = '请输入大于 0 的体重（kg）。';
    return;
  }
  const value = weightField.value === '' ? null : weightField.valueAsNumber;
  if (editDay(day => { day.bodyWeight = value; })) {
    status.textContent = value === null ? '已清除体重。' : '体重已保存。';
    renderWeightTrend();
  } else weightField.value = state.days[selectedDate]?.bodyWeight ?? '';
};

const moodForm = get('create-mood');
const emojiField = moodForm.elements.namedItem('icon');
for (const emoji of ['😊', '🔥', '✨', '😌', '😴', '😮‍💨', '🥹', '💪', '🌧️', '💜']) {
  button(get('mood-icons'), emoji, () => { emojiField.value = emoji; }).setAttribute('aria-label', '选用 ' + emoji);
}
moodForm.onsubmit = event => {
  event.preventDefault();
  const label = moodForm.elements.namedItem('label').value.trim();
  const icon = emojiField.value.trim();
  const status = get('mood-status');
  if (!label || !icon || moodOptions().some(([, name]) => name === label)) {
    status.textContent = !label || !icon ? '请填写心情名称和 Emoji。' : '已有同名心情，请换个名称。';
    return;
  }
  const emoji = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(icon);
  if ([...emoji].length !== 1 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(icon)) {
    status.textContent = '请选择或输入一个 Emoji。';
    return;
  }
  if (!change(next => (next.customMoods ??= []).push([icon, label]))) return;
  moodForm.reset();
  status.textContent = '';
  get('new-mood').open = false;
  renderMoods(state.days[selectedDate] || blankDay());
  get('moods').lastElementChild.focus();
};
get('filter').onchange = () => {
  filter = get('filter').value;
  renderActions();
};
for (const [id, delta] of [['prev', -1], ['next', 1]]) {
  get(id).onclick = () => {
    month.setMonth(month.getMonth() + delta);
    renderCalendar();
  };
}
get('back').onclick = () => {
  show('calendar');
  get('grid').querySelector(`[data-date="${selectedDate}"]`)?.focus();
};
get('compare-details').ontoggle = refreshComparison;
nav.querySelectorAll('button').forEach(el => {
  prependIcon(el, el.dataset.page);
  el.onclick = () => {
    refreshDate();
    if (el.dataset.page === 'calendar') editing = false;
    if (!editing && (el.dataset.page === 'today' || el.dataset.page === 'journal') && selectedDate !== today) {
      selectedDate = today;
      filter = state.days[today]?.part || parts[0];
      openAction = '';
    }
    show(el.dataset.page);
  };
});
editDone.onclick = () => {
  editing = false;
  show('entry');
};

let midnightTimer;
function refreshDate() {
  clearTimeout(midnightTimer);
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  midnightTimer = setTimeout(refreshDate, nextMidnight - now);

  const date = dateKey(now);
  if (date === today) return;
  const wasToday = selectedDate === today;
  const wasCurrentMonth = dateKey(month).slice(0, 7) === today.slice(0, 7);
  today = date;
  if (editing || !get('entry').hidden) return;

  if (wasCurrentMonth) month = new Date(now.getFullYear(), now.getMonth(), 1);
  if (wasToday) {
    // Commit any diary field being edited to the old date before switching.
    document.activeElement?.blur();
    selectedDate = today;
    filter = state.days[today]?.part || parts[0];
    openAction = '';
    if (!get('today').hidden) show('today');
    if (!get('journal').hidden) show('journal');
  }
  if (!get('calendar').hidden) renderCalendar();
}

show('today');
const isIPhone = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)');
function updateInstallHint() {
  get('install').hidden = !isIPhone || navigator.standalone === true || standalone.matches ||
    Boolean(window.webkit?.messageHandlers?.fitnessBackup);
}
updateInstallHint();
standalone.addEventListener('change', updateInstallHint);
refreshDate();
window.addEventListener('focus', refreshDate);
window.addEventListener('pageshow', refreshDate);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshDate();
});
if (!window.AndroidDiary && !window.webkit?.messageHandlers?.fitnessBackup &&
    'serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(console.error);
}
