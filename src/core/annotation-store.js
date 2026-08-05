import { openDB } from 'idb';

const DB_NAME = 'AuraPDFStudio_DB';
const STORE_NAME = 'annotations';

export class AnnotationStore {
  constructor() {
    this.annotations = new Map(); // id -> annotation object
    this.history = [];             // Stack of past states for undo
    this.future = [];              // Stack of undone states for redo
    this.listeners = new Set();    // Subscriber callbacks
    this.dbPromise = this.initDB();
  }

  async initDB() {
    if (typeof window === 'undefined' || !window.indexedDB) return null;
    try {
      return await openDB(DB_NAME, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        },
      });
    } catch (e) {
      console.warn('IndexedDB initialization skipped:', e);
      return null;
    }
  }

  saveSnapshot() {
    const currentSnapshot = Array.from(this.annotations.values()).map((a) => ({ ...a }));
    this.history.push(currentSnapshot);
    if (this.history.length > 100) {
      this.history.shift(); // Limit undo stack to 100 levels
    }
    this.future = []; // Clear redo stack on new action
  }

  add(annotation) {
    if (!annotation.id) {
      annotation.id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `annot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    this.saveSnapshot();
    this.annotations.set(annotation.id, { ...annotation });
    this.notify();
    this.persistToStorage();
    return annotation;
  }

  update(id, changes) {
    if (!this.annotations.has(id)) return null;
    this.saveSnapshot();
    const existing = this.annotations.get(id);
    const updated = { ...existing, ...changes, modifiedAt: new Date().toISOString() };
    this.annotations.set(id, updated);
    this.notify();
    this.persistToStorage();
    return updated;
  }

  remove(id) {
    if (!this.annotations.has(id)) return false;
    this.saveSnapshot();
    this.annotations.delete(id);
    this.notify();
    this.persistToStorage();
    return true;
  }

  getByPage(pageIndex) {
    return Array.from(this.annotations.values()).filter((a) => a.pageIndex === pageIndex);
  }

  getAll() {
    return Array.from(this.annotations.values());
  }

  undo() {
    if (this.history.length === 0) return false;
    const currentSnapshot = Array.from(this.annotations.values()).map((a) => ({ ...a }));
    this.future.push(currentSnapshot);

    const previousSnapshot = this.history.pop();
    this.annotations.clear();
    for (const item of previousSnapshot) {
      this.annotations.set(item.id, item);
    }
    this.notify();
    this.persistToStorage();
    return true;
  }

  redo() {
    if (this.future.length === 0) return false;
    const currentSnapshot = Array.from(this.annotations.values()).map((a) => ({ ...a }));
    this.history.push(currentSnapshot);

    const nextSnapshot = this.future.pop();
    this.annotations.clear();
    for (const item of nextSnapshot) {
      this.annotations.set(item.id, item);
    }
    this.notify();
    this.persistToStorage();
    return true;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    for (const callback of this.listeners) {
      try {
        callback(this.getAll());
      } catch (e) {
        console.error('AnnotationStore listener error:', e);
      }
    }
  }

  async persistToStorage(fileKey = 'active-document') {
    try {
      const db = await this.dbPromise;
      if (db) {
        await db.put(STORE_NAME, this.getAll(), fileKey);
      }
    } catch (e) {
      // Ignored in non-browser or test environments
    }
  }

  async loadFromStorage(fileKey = 'active-document') {
    try {
      const db = await this.dbPromise;
      if (db) {
        const stored = await db.get(STORE_NAME, fileKey);
        if (Array.isArray(stored)) {
          this.annotations.clear();
          for (const item of stored) {
            this.annotations.set(item.id, item);
          }
          this.history = [];
          this.future = [];
          this.notify();
        }
      }
    } catch (e) {
      // Ignored in non-browser or test environments
    }
  }

  clear() {
    this.annotations.clear();
    this.history = [];
    this.future = [];
    this.notify();
  }
}
