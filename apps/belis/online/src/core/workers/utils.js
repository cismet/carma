export const workerInstance = new ComlinkWorker(
  new URL('./dexie.js', import.meta.url)
);
