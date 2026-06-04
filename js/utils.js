/* 愈见 YuJian — 工具函数（宠物版） */

const Utils = {
  toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2500);
  },

  formatDate(d) {
    if (typeof d === 'string') d = new Date(d);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  formatDateShort(d) {
    if (typeof d === 'string') d = new Date(d);
    return `${d.getMonth()+1}/${d.getDate()}`;
  },

  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

  debounce(fn, ms = 300) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  },

  // 宠物身体部位
  locationText(loc) {
    const map = {
      head: '头部', ear: '耳朵', neck: '颈部',
      front_leg: '前肢', back_leg: '后肢', paw: '爪子',
      abdomen: '腹部', back: '背部', tail: '尾部',
      other: '其他'
    };
    return map[loc] || loc;
  },

  // 宠物伤口类型
  typeText(type) {
    const map = {
      surgical: '手术切口', traumatic: '外伤', bite: '咬伤',
      scratch: '抓伤', ulcer: '皮肤溃疡', burn: '烫伤/烧伤',
      other: '其他'
    };
    return map[type] || type;
  },

  // 宠物品种
  speciesText(s) {
    const map = { dog: '狗狗', cat: '猫咪', rabbit: '兔子', hamster: '仓鼠', bird: '鸟类', other: '其他宠物' };
    return map[s] || s;
  },

  phStatus(ph) {
    if (ph < 6.5) return { text: '偏低', color: 'warning', risk: '中风险' };
    if (ph > 7.8) return { text: '偏高', color: 'danger', risk: '高风险' };
    return { text: '正常', color: 'success', risk: '低风险' };
  },

  uaStatus(ua) {
    if (ua < 150) return { text: '偏低', color: 'warning', risk: '中风险' };
    if (ua > 416) return { text: '偏高', color: 'danger', risk: '高风险' };
    return { text: '正常', color: 'success', risk: '低风险' };
  },

  tempStatus(temp) {
    if (temp < 37) return { text: '偏低', color: 'warning' };
    if (temp > 39.5) return { text: '发热', color: 'danger' };
    return { text: '正常', color: 'success' };
  },

  overallRisk(ph, ua, temp) {
    const scores = [this.phStatus(ph), this.uaStatus(ua)];
    if (scores.some(s => s.color === 'danger')) return { level: '高风险', color: 'danger', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' };
    if (scores.some(s => s.color === 'warning')) return { level: '需关注', color: 'warning', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' };
    return { level: '愈合良好', color: 'success', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' };
  },

  mockSensorData() {
    return {
      ph: +(5.5 + Math.random() * 3).toFixed(1),
      uricAcid: Math.floor(100 + Math.random() * 400),
      temperature: +(37.5 + Math.random() * 2.5).toFixed(1),
      timestamp: new Date().toISOString()
    };
  }
};
