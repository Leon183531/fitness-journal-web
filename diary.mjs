export const parts = ['胸', '背', '肩', '腿', '手臂', '腹'];
export const seed = [
  ['平板卧推', '上斜卧推', '夹胸'],
  ['正手引体向上', '反手引体向上', '高位下拉', '对握高位下拉'],
  ['飞鸟', '反向飞鸟', '哑铃推肩', 'Y 字举'],
  ['深蹲', '保加利亚蹲', '臀桥', '内收肌'],
].flatMap((names, i) => names.map(name => ({ name, part: parts[i] })));

export function dateKey(date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map(value => String(value).padStart(2, '0')).join('-');
}

export function blankDay() {
  return { part: '', mood: '', note: '', bodyWeight: null, actions: [] };
}

export function groupSets(sets) {
  const groups = [];
  for (const set of sets) {
    const last = groups.at(-1);
    if (last && last.weight === set.weight && last.reps === set.reps) last.count += set.count;
    else groups.push({ ...set });
  }
  return groups;
}

export function parseImport(source) {
  const entries = new Map();
  const issues = [];
  let day;
  let action;
  for (const [i, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\s*(.*)$/);
    if (header) {
      const [, y, m, d, rest] = header;
      const date = new Date(+y, +m - 1, +d);
      const key = [y, m.padStart(2, '0'), d.padStart(2, '0')].join('-');
      action = undefined;
      day = undefined;
      if (dateKey(date) !== key || entries.has(key)) {
        issues.push({ i, line, blocking: true });
        continue;
      }
      day = blankDay();
      day.part = parts.find(part => rest.startsWith(part)) || '';
      day.note = rest.slice(day.part.length).trim().replace(/^[（(](.*)[）)]$/, '$1');
      entries.set(key, day);
      continue;
    }
    if (!day) {
      issues.push({ i, line, blocking: true });
      continue;
    }
    const set = line.match(/^(\d+(?:\.\d+)?)\s*kg\s*[x×*]\s*(\d+)\s*[x×*]\s*(\d+)$/i);
    if (set && action && Number.isFinite(+set[1]) && [+set[2], +set[3]].every(n => Number.isSafeInteger(n) && n > 0)) {
      action.sets.push({ weight: +set[1], reps: +set[2], count: +set[3] });
    } else if (/^[\d+-]|\bkg\b|^备注[：:]/i.test(line)) {
      const target = action || day;
      target.note = [target.note, line.replace(/^备注[：:]\s*/, '')].filter(Boolean).join('\n');
      if (!/^备注[：:]/.test(line)) issues.push({ i, line, blocking: false });
    } else {
      const name = line.replace(/^y\s*字举$/i, 'Y 字举');
      action = day.actions.find(entry => entry.name === name);
      if (!action) {
        action = { name, sets: [], note: '' };
        day.actions.push(action);
      }
    }
  }
  return { entries, issues };
}
