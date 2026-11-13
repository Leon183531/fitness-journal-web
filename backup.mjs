import { readPhotos, changePhotos } from './photos.mjs';
import { parts } from './diary.mjs';

const format = 'fitness-journal';
const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const validImage = type => typeof type === 'string' && type.startsWith('image/') && type !== 'image/svg+xml';

function encodePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function exportBackup(state) {
  const photos = {};
  for (const date of await readPhotos()) {
    photos[date] = await Promise.all((await readPhotos(date)).map(async ({ id, file }) => ({
      id, type: file.type, data: await encodePhoto(file),
    })));
  }
  return new Blob([JSON.stringify({ format, version: 1, state, photos })], { type: 'application/json' });
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const validSet = set => isRecord(set) && Number.isFinite(set.weight) && set.weight >= 0 &&
  positiveInteger(set.reps) && positiveInteger(set.count);

function validDay(day) {
  return isRecord(day) && [day.part, day.mood, day.note].every(text) &&
    (day.bodyWeight == null || (Number.isFinite(day.bodyWeight) && day.bodyWeight > 0)) &&
    Array.isArray(day.actions) && day.actions.every(action => isRecord(action) &&
      text(action.name) && text(action.note) && Array.isArray(action.sets) && action.sets.every(validSet));
}

export async function readBackup(file) {
  const backup = JSON.parse(await file.text());
  const state = backup?.state;
  if (backup?.format !== format || backup.version !== 1 || !isRecord(state) ||
      !Array.isArray(state.library) || !state.library.every(action => isRecord(action) && text(action.name) && parts.includes(action.part)) ||
      (state.customMoods !== undefined && (!Array.isArray(state.customMoods) ||
        !state.customMoods.every(mood => Array.isArray(mood) && mood.length === 2 && mood.every(text)))) ||
      !isRecord(state.days) || !Object.entries(state.days).every(([date, day]) => validDate(date) && validDay(day)) ||
      !isRecord(backup.photos)) throw new Error('Invalid backup');

  const photos = new Map();
  for (const [date, items] of Object.entries(backup.photos)) {
    if (!validDate(date) || !Array.isArray(items)) throw new Error('Invalid photos');
    photos.set(date, items.map(item => {
      if (!isRecord(item) || !text(item.id) || !validImage(item.type) || !text(item.data)) throw new Error('Invalid photo');
      const bytes = Uint8Array.from(atob(item.data), character => character.charCodeAt(0));
      return { id: item.id, file: new Blob([bytes], { type: item.type }) };
    }));
  }
  return { state, photos };
}

export async function restorePhotos(photos) {
  for (const [date, incoming] of photos) {
    if (!incoming.length) continue;
    await changePhotos(date, current => {
      const merged = new Map(current.map(photo => [photo.id, photo]));
      incoming.forEach(photo => { if (!merged.has(photo.id)) merged.set(photo.id, photo); });
      return [...merged.values()];
    });
  }
}
