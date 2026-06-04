/* 愈见 App - IndexedDB 存储层 */

const DB = {
  _db: null,
  _ready: null,

  async init() {
    if (this._ready) return this._ready;
    this._ready = new Promise((resolve, reject) => {
      const req = indexedDB.open('YuHuDB', 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('wounds')) {
          db.createObjectStore('wounds', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('records')) {
          const store = db.createObjectStore('records', { keyPath: 'id' });
          store.createIndex('woundId', 'woundId', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('chatHistory')) {
          db.createObjectStore('chatHistory', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror = () => reject(req.error);
    });
    return this._ready;
  },

  async _tx(storeName, mode = 'readonly') {
    await this.init();
    const tx = this._db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  },

  // 通用CRUD
  async getAll(storeName) {
    const store = await this._tx(storeName);
    return new Promise((resolve) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
    });
  },

  async get(storeName, id) {
    const store = await this._tx(storeName);
    return new Promise((resolve) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
    });
  },

  async put(storeName, item) {
    if (!item.id) item.id = Utils.uid();
    item.updatedAt = new Date().toISOString();
    const store = await this._tx(storeName, 'readwrite');
    return new Promise((resolve) => {
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
    });
  },

  async delete(storeName, id) {
    const store = await this._tx(storeName, 'readwrite');
    return new Promise((resolve) => {
      store.delete(id);
      resolve();
    });
  },

  async clear(storeName) {
    const store = await this._tx(storeName, 'readwrite');
    return new Promise((resolve) => {
      store.clear();
      resolve();
    });
  },

  // 伤口
  async getWounds() { return this.getAll('wounds'); },
  async saveWound(w) { return this.put('wounds', w); },
  async deleteWound(id) {
    const records = await this.getRecordsByWound(id);
    for (const r of records) await this.delete('records', r.id);
    return this.delete('wounds', id);
  },

  // 监测记录
  async getRecords(woundId) {
    const all = await this.getAll('records');
    return all.filter(r => r.woundId === woundId).sort((a, b) => new Date(b.date) - new Date(a.date));
  },
  async getRecordsByWound(woundId) { return this.getRecords(woundId); },
  async saveRecord(r) { return this.put('records', r); },
  async deleteRecord(id) { return this.delete('records', id); },

  // AI对话历史
  async getChatHistory() {
    const all = await this.getAll('chatHistory');
    return all.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  },
  async saveChatMessage(msg) { return this.put('chatHistory', msg); },
  async clearChatHistory() { return this.clear('chatHistory'); },

  // 设置
  async getSetting(key) {
    const store = await this._tx('settings');
    return new Promise((resolve) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
    });
  },
  async saveSetting(key, value) { return this.put('settings', { key, value }); },

  // 每日AI用量追踪
  async getTodayUsage() {
    const date = new Date().toISOString().slice(0, 10);
    const storedDate = await this.getSetting('usage_date');
    const count = await this.getSetting('usage_count');
    if (storedDate !== date) { await this._resetUsage(date); return 0; }
    return parseInt(count) || 0;
  },
  async incrementUsage() {
    const date = new Date().toISOString().slice(0, 10);
    const storedDate = await this.getSetting('usage_date');
    const count = (storedDate === date ? parseInt(await this.getSetting('usage_count')) || 0 : 0) + 1;
    await this.saveSetting('usage_date', date);
    await this.saveSetting('usage_count', count);
    return count;
  },
  async _resetUsage(date) {
    await this.saveSetting('usage_date', date);
    await this.saveSetting('usage_count', 0);
  },

  // 会员状态
  async isPro() { return !!(await this.getSetting('is_pro')); },
  async setPro(val) { return this.saveSetting('is_pro', val); },
  async getProExpiry() { return this.getSetting('pro_expiry'); },

  // 导出全部数据
  async exportAll() {
    const [wounds, records, chatHistory] = await Promise.all([
      this.getAll('wounds'), this.getAll('records'), this.getAll('chatHistory')
    ]);
    return { wounds, records, chatHistory, exportedAt: new Date().toISOString() };
  },

  // 导入数据
  async importAll(data) {
    if (!data.wounds || !data.records) throw new Error('无效的数据格式');
    for (const w of data.wounds) await this.put('wounds', w);
    for (const r of data.records) await this.put('records', r);
  }
};
