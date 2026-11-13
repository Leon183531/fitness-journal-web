let database;

function openPhotos() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('fitness-journal-photos', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('days');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

export async function readPhotos(date) {
  const db = await openPhotos();
  return new Promise((resolve, reject) => {
    const store = db.transaction('days').objectStore('days');
    const request = date === undefined ? store.getAllKeys() : store.get(date);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

export async function changePhotos(date, update) {
  const db = await openPhotos();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('days', 'readwrite');
    const store = tx.objectStore('days');
    const request = store.get(date);
    request.onsuccess = () => {
      const photos = update(request.result ?? []);
      if (photos.length) store.put(photos, date);
      else store.delete(date);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
