/* ═══════════════════════════════════════════
   愈见 YuJian — Application Controller
   ═══════════════════════════════════════════ */

const App = {
  _currentTab: 'home',
  _currentWound: null,
  _chatMessages: [],
  _isProcessing: false,
  _isPro: false,
  _isLoggedIn: false,
  _user: null,

  /* ========== Lifecycle ========== */
  async init() {
    // 设置全局超时保护 - 无论如何，8秒后必须显示主界面
    const splashTimeout = setTimeout(() => {
      console.warn('App.init timeout, forcing splash hide');
      this._forceHideSplash();
    }, 8000);

    try {
      await DB.init();
      await AI.init();
      await this.loadSettings();
      this._isPro = !!(await DB.getSetting('is_pro'));

      // 检查本地登录状态
      const session = await DB.getSetting('auth_session');
      if (session && session.token) {
        this._isLoggedIn = true;
        this._user = session.user;
      }

      // 如果本地无会话，尝试恢复 Supabase 会话（带超时保护）
      if (!this._isLoggedIn && typeof SB !== 'undefined' && SB.client) {
        try {
          // 使用 Promise.race 设置 3 秒超时
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Supabase auth timeout')), 3000)
          );
          const { user } = await Promise.race([
            SB.auth.getUser(),
            timeoutPromise
          ]);
          if (user) {
            const { data: profile } = await SB.db.select('users', { eq: { id: user.id } });
            this._user = {
              id: user.id,
              email: user.email,
              name: profile?.[0]?.name || user.email?.split('@')[0] || '用户',
              avatar_url: profile?.[0]?.avatar_url
            };
            this._isLoggedIn = true;
            await DB.saveSetting('auth_session', { token: 'supabase', user: this._user });
          }
        } catch (err) {
          console.warn('Supabase auth recovery failed:', err.message);
          // 继续执行，不阻塞启动
        }
      }

      // 初始化BLE回调
      try {
        if (BLE.isSupported()) {
          BLE.setDataCallback((type, value) => this._onBLEData(type, value));
        }
      } catch (err) {
        console.warn('BLE init failed:', err.message);
      }

      // 初始化引导与登录动画
      if (typeof Onboarding !== 'undefined') Onboarding.init();
      if (typeof AuthAnim !== 'undefined') AuthAnim.init();

      // Splash动画序列
      clearTimeout(splashTimeout);
      this._runSplashSequence();
    } catch (err) {
      console.error('App.init error:', err);
      clearTimeout(splashTimeout);
      this._forceHideSplash();
    }
  },

  /* ========== 强制隐藏启动画面 ========== */
  _forceHideSplash() {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('done');
      setTimeout(() => {
        splash.style.display = 'none';
        this._afterSplash();
      }, 100);
    }
  },

  /* ========== Splash Sequence ========== */
  _runSplashSequence() {
    const splash = document.getElementById('splash-screen');
    // 强制显示至少1.5秒，给用户观看品牌动画的时间
    setTimeout(() => {
      splash.classList.add('done');
      setTimeout(() => {
        splash.style.display = 'none';
        this._afterSplash();
      }, 600);
    }, 1800);
  },

  async _afterSplash() {
    // 首次使用 → 显示引导页
    if (typeof Onboarding !== 'undefined' && !Onboarding.isCompleted()) {
      this._showOnboarding();
      return;
    }
    if (!this._isLoggedIn) {
      this.showAuth();
    } else {
      this.hideAuth();
      this.loadHomeData();
      this.loadWoundList();
      this.loadChatHistory();
      this.updateProfileStats();
      const now = new Date();
      document.getElementById('r-date').value = now.toISOString().slice(0, 16);
    }
  },

  _showOnboarding() {
    const screen = document.getElementById('onboarding-screen');
    if (screen) {
      screen.style.display = 'flex';
      requestAnimationFrame(() => screen.classList.add('active'));
    }
  },

  _afterOnboarding() {
    if (!this._isLoggedIn) {
      this.showAuth();
    } else {
      this.hideAuth();
      this.loadHomeData();
      this.loadWoundList();
      this.loadChatHistory();
      this.updateProfileStats();
    }
  },

  /* ========== Auth Page Control ========== */
  showAuth() {
    // 隐藏引导页
    const obScreen = document.getElementById('onboarding-screen');
    if (obScreen) { obScreen.classList.remove('active'); obScreen.style.display = 'none'; }
    document.getElementById('page-auth').classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector('.bottom-nav').style.display = 'none';
  },

  hideAuth() {
    document.getElementById('page-auth').classList.remove('active');
    document.getElementById('page-home').classList.add('active');
    document.querySelector('.bottom-nav').style.display = '';
    // 更新导航激活状态
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.nav-item[data-tab="home"]').classList.add('active');
  },

  /* ========== Navigation ========== */
  switchTab(tab) {
    if (tab === this._currentTab) return;
    if (!this._isLoggedIn && tab !== 'auth') return;

    const oldPage = document.getElementById(`page-${this._currentTab}`);
    const newPage = document.getElementById(`page-${tab}`);

    // 转场动画
    if (oldPage) {
      oldPage.classList.add('exiting');
      setTimeout(() => {
        oldPage.classList.remove('active', 'exiting');
      }, 250);
    }

    this._currentTab = tab;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    if (newPage) {
      setTimeout(() => {
        newPage.classList.add('active');
      }, oldPage ? 50 : 0);
    }
    const nav = document.querySelector(`.nav-item[data-tab="${tab}"]`);
    if (nav) nav.classList.add('active');

    if (tab === 'home') this.loadHomeData();
    if (tab === 'monitor') this.loadMonitorCharts();
    if (tab === 'community') this._initCommunity();
    if (tab === 'records') this.loadWoundList();
    if (tab === 'ai') this._refreshUsageUI();
    if (tab === 'profile') this.updateProfileStats();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  /* ========== Home Dashboard ========== */
  async loadHomeData() {
    const records = await DB.getAll('records');
    if (records.length > 0) {
      const sorted = records.sort((a, b) => new Date(b.date) - new Date(a.date));
      const latest = sorted[0];
      document.getElementById('home-ph').textContent = latest.ph?.toFixed(1) || '--';
      document.getElementById('home-ua').textContent = latest.uricAcid || '--';
      document.getElementById('home-temp').textContent = latest.temperature ? `${latest.temperature}℃` : '--';
      this.updateRiskCard(latest);
    } else {
      document.getElementById('home-ph').textContent = '7.0';
      document.getElementById('home-ua').textContent = '280';
      document.getElementById('home-temp').textContent = '36.5℃';
    }
  },

  updateRiskCard(record) {
    if (!record) return;
    const risk = Utils.overallRisk(record.ph, record.uricAcid, record.temperature);
    const el = document.getElementById('risk-text');
    const ring = document.getElementById('risk-ring');

    const config = {
      success: { text: '愈合良好 · 低风险', color: 'var(--teal)', bg: 'var(--teal-soft)', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
      warning: { text: '需要关注 · 中风险', color: 'var(--amber)', bg: 'var(--amber-soft)', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' },
      danger: { text: '高风险 · 需立即处理', color: 'var(--rose)', bg: 'var(--rose-soft)', icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" stroke-width="2.5" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' }
    };
    const c = config[risk.color] || config.success;

    el.textContent = c.text;
    el.style.color = c.color;
    ring.style.background = c.bg;
    ring.innerHTML = c.icon;
  },

  /* ========== AI Chat ========== */
  async _checkUsageLimit() {
    const isPro = await DB.isPro();
    if (isPro) return true;
    const used = await DB.getTodayUsage();
    const limit = 5;
    const remaining = limit - used;
    const el = document.getElementById('usage-remaining');
    const bar = document.getElementById('usage-bar-inner');
    if (el) el.textContent = `${remaining}/${limit}`;
    if (bar) {
      const pct = (used / limit) * 100;
      bar.style.width = pct + '%';
      bar.style.background = pct >= 100 ? 'var(--rose)' : pct > 80 ? 'var(--amber)' : 'var(--teal)';
    }
    return used < limit;
  },

  async _afterUse() {
    const isPro = await DB.isPro();
    if (!isPro) await DB.incrementUsage();
    this._refreshUsageUI();
  },

  async _refreshUsageUI() {
    const isPro = await DB.isPro();
    const el = document.getElementById('usage-remaining');
    const bar = document.getElementById('usage-bar-inner');
    const label = document.getElementById('usage-label');
    if (isPro) {
      if (el) el.textContent = '∞';
      if (bar) { bar.style.width = '100%'; bar.style.background = 'var(--gold)'; }
      if (label) label.textContent = 'Pro 无限使用';
    } else {
      const used = await DB.getTodayUsage();
      const limit = 5;
      if (el) el.textContent = `${limit - used}/${limit}`;
      if (bar) {
        const pct = (used / limit) * 100;
        bar.style.width = pct + '%';
        bar.style.background = pct >= 100 ? 'var(--rose)' : pct > 80 ? 'var(--amber)' : 'var(--teal)';
      }
      if (label) label.textContent = `每日免费额度`;
    }
  },

  async _showLimitReached() {
    this._addChat('ai', `🟡 <b>今日免费次数已用完</b>（5/5）\n\n升级<b>愈见 Pro</b>即可无限使用：\n✦ 无限AI咨询 & 拍照诊断\n✦ 专家在线问诊\n✦ 高级报告导出\n\n<span style="color:var(--gold);font-weight:700">仅 ¥29/月</span>`);
    const container = document.getElementById('chat-container');
    const btn = document.createElement('div');
    btn.style.cssText = 'text-align:center;margin:8px 0 16px';
    btn.innerHTML = '<button class="btn btn-sm" style="background:linear-gradient(135deg,#B7931A,#D4A843);color:#1A1D28;font-weight:700;font-size:13px;width:100%" onclick="App.upgradeToPro()">✦ 立即升级愈见 Pro</button>';
    container.appendChild(btn);
    container.scrollTop = container.scrollHeight;
  },

  upgradeToPro() {
    this.switchTab('profile');
    Utils.toast('请在个人中心完成升级', 'warning');
  },

  async sendMessage() {
    if (this._isProcessing) return;
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    if (!(await this._checkUsageLimit())) { this._showLimitReached(); return; }

    input.value = '';
    this._isProcessing = true;
    this._addChat('user', text);

    try {
      let ctx = {};
      const allRecords = await DB.getAll('records');
      if (allRecords.length > 0) ctx = allRecords.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      if (this._currentWound) {
        ctx.woundType = this._currentWound.type;
        ctx.woundLocation = this._currentWound.location;
      }

      const reply = await AI.woundChat(text, ctx);
      this._addChat('ai', reply);
      await this._afterUse();
    } catch (err) {
      this._addChat('ai', `抱歉，请求失败：${err.message}`);
    }
    this._isProcessing = false;
  },

  quickAsk(q) {
    document.getElementById('chat-input').value = q;
    this.switchTab('ai');
    setTimeout(() => this.sendMessage(), 300);
  },

  _addChat(role, text) {
    const container = document.getElementById('chat-container');
    const ts = new Date().toISOString();
    this._chatMessages.push({ role, content: text, timestamp: ts });
    DB.saveChatMessage({ role, content: text, timestamp: ts }).catch(() => {});

    const isAI = role === 'ai';
    const div = document.createElement('div');
    div.className = `flex gap-2 ${isAI ? '' : 'flex-row-reverse'}`;

    if (isAI) {
      div.innerHTML = `<div class="chat-avatar" style="background:linear-gradient(135deg,var(--blue-deep),var(--blue));color:#fff"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity="0.3"/><path d="M12 6v6l4 2"/></svg></div><div class="chat-bubble ai">${this._e(text)}</div>`;
    } else {
      div.innerHTML = `<div class="chat-avatar" style="background:var(--ink-muted);color:#fff;font-size:12px">我</div><div class="chat-bubble user">${this._e(text)}</div>`;
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  async loadChatHistory() {
    const history = await DB.getChatHistory();
    this._chatMessages = history;
  },

  async clearAIChat() {
    await DB.clearChatHistory();
    this._chatMessages = [];
    const container = document.getElementById('chat-container');
    const welcome = container.querySelector('.flex');
    container.innerHTML = '';
    if (welcome) container.appendChild(welcome);
    Utils.toast('对话历史已清除');
  },

  /* ========== Photo Diagnosis ========== */
  openCamera() {
    this.switchTab('ai');
    document.getElementById('camera-input').click();
  },

  async handlePhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { Utils.toast('图片不能超过20MB', 'error'); return; }

    if (!(await this._checkUsageLimit())) { this._showLimitReached(); e.target.value = ''; return; }

    this._addChat('user', '📸 上传伤口照片进行AI诊断');

    try {
      this._isProcessing = true;
      const base64 = await this._compress(file);

      const loadingIdx = this._chatMessages.length;
      this._addChat('ai', '⏳ 正在分析伤口照片，请稍候...');

      let result;
      try {
        result = await AI.diagnoseImage(base64);
      } catch (apiErr) {
        this._removeLastChat();
        this._addChat('ai', `⚠️ 图片识别需要支持Vision的模型。\n\n替代方案：\n1. 在设置中将模型切换为支持视觉的版本\n2. 或者<b>用文字描述伤口</b>——位置、大小、颜色、渗出物、疼痛程度——我会给出同样专业的分析。`);
        this._isProcessing = false;
        e.target.value = '';
        return;
      }

      this._removeLastChat();

      if (result.raw) {
        this._addChat('ai', result.raw);
      } else {
        this._renderDiagnosisCard(result);
      }
      await this._afterUse();
    } catch (err) {
      this._addChat('ai', `诊断失败：${err.message}`);
    }
    this._isProcessing = false;
    e.target.value = '';
  },

  /* ========== Gallery Upload (Image + Video) ========== */
  openGallery() {
    this.switchTab('ai');
    document.getElementById('gallery-input').click();
  },

  async handleGalleryUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { Utils.toast('文件不能超过50MB', 'error'); return; }
    if (!(await this._checkUsageLimit())) { this._showLimitReached(); e.target.value = ''; return; }

    this._isProcessing = true;
    const isVideo = file.type.startsWith('video/');

    try {
      if (isVideo) {
        this._addChat('user', '🎥 上传视频进行AI分析');
        this._addChat('ai', '⏳ 正在提取视频关键帧，请稍候...');
        const frames = await this._extractVideoFrames(file, 4);
        this._removeLastChat();
        this._addChat('ai', '⏳ 正在分析视频内容...');
        const result = await AI.diagnoseMultiImage(frames, '请分析这些宠物伤口视频截帧，综合判断伤口状况');
        this._removeLastChat();
        if (result.raw) {
          this._addChat('ai', result.raw);
        } else {
          this._renderDiagnosisCard(result);
        }
      } else {
        this._addChat('user', '🖼️ 上传图片进行AI诊断');
        this._addChat('ai', '⏳ 正在分析伤口照片，请稍候...');
        const base64 = await this._compress(file);
        const result = await AI.diagnoseImage(base64);
        this._removeLastChat();
        if (result.raw) {
          this._addChat('ai', result.raw);
        } else {
          this._renderDiagnosisCard(result);
        }
      }
      await this._afterUse();
    } catch (err) {
      this._removeLastChat();
      this._addChat('ai', `分析失败：${err.message}`);
    }
    this._isProcessing = false;
    e.target.value = '';
  },

  _extractVideoFrames(file, frameCount = 4) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;

      const frames = [];
      video.addEventListener('loadedmetadata', () => {
        const duration = video.duration;
        if (!duration || duration < 0.1) {
          URL.revokeObjectURL(url);
          reject(new Error('无法读取视频时长'));
          return;
        }
        // Capture frames at evenly spaced intervals
        const interval = duration / (frameCount + 1);
        const times = [];
        for (let i = 1; i <= frameCount; i++) times.push(interval * i);

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const captureNext = () => {
          if (times.length === 0) {
            URL.revokeObjectURL(url);
            resolve(frames);
            return;
          }
          const t = times.shift();
          video.currentTime = t;
        };

        video.addEventListener('seeked', () => {
          const maxDim = 768;
          let w = video.videoWidth, h = video.videoHeight;
          if (w > maxDim || h > maxDim) {
            const r = Math.min(maxDim / w, maxDim / h);
            w = Math.round(w * r);
            h = Math.round(h * r);
          }
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          frames.push(canvas.toDataURL('image/jpeg', 0.75));
          captureNext();
        });

        captureNext();
      });

      video.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        reject(new Error('视频加载失败'));
      });
    });
  },

  _renderDiagnosisCard(r) {
    const sevMap = { '轻微': 'teal', '中等': 'amber', '严重': 'rose', '紧急': 'rose' };
    const sevColor = sevMap[r.severity] || 'blue';
    let h = `<div style="font-size:13px;line-height:1.7">`;
    h += `<p style="font-weight:700;margin-bottom:8px">📋 AI 诊断结果</p>`;
    if (r.type && r.type !== '无法识别') h += `<div class="dx-field"><span class="dx-label">伤口类型</span><span class="dx-value">${r.type}</span></div>`;
    if (r.size) h += `<div class="dx-field"><span class="dx-label">大小估算</span><span class="dx-value">${r.size}</span></div>`;
    h += `<div class="dx-field"><span class="dx-label">严重程度</span><span class="dx-value"><span class="badge badge-${sevColor}">${r.severity || '未知'}</span></span></div>`;
    if (r.infection_signs) h += `<div class="dx-field"><span class="dx-label">感染迹象</span><span class="dx-value" style="font-size:12px">${r.infection_signs}</span></div>`;

    if (r.need_hospital) {
      h += `<div style="margin-top:8px;padding:10px;background:var(--rose-soft);border-radius:10px;font-size:12px"><b style="color:var(--rose)">⚠️ 建议立即就医</b><br>${r.hospital_reason || ''}</div>`;
    }

    if (r.care_suggestions?.length) {
      h += `<div style="margin-top:8px"><b style="font-size:12px">💡 护理建议</b>`;
      r.care_suggestions.forEach(s => { h += `<div style="font-size:12px;color:var(--ink-light);margin-top:2px">• ${s}</div>`; });
      h += `</div>`;
    }
    if (r.recommended_dressing) h += `<div class="dx-field"><span class="dx-label">推荐敷料</span><span class="dx-value">${r.recommended_dressing}</span></div>`;
    h += `<p style="font-size:10px;color:var(--ink-muted);margin-top:8px;border-top:1px solid var(--canvas-warm);padding-top:6px">⚠️ AI分析仅供参考，不能替代专业医疗诊断</p>`;
    h += `</div>`;

    const container = document.getElementById('chat-container');
    const div = document.createElement('div');
    div.className = 'flex gap-2';
    div.innerHTML = `<div class="chat-avatar" style="background:linear-gradient(135deg,var(--blue-deep),var(--blue));color:#fff"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity="0.3"/><path d="M12 6v6l4 2"/></svg></div><div class="chat-bubble ai" style="max-width:92%">${h}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    this._chatMessages.push({ role: 'ai', content: JSON.stringify(r), timestamp: new Date().toISOString() });
  },

  _removeLastChat() {
    this._chatMessages.pop();
    const container = document.getElementById('chat-container');
    if (container.lastElementChild) container.lastElementChild.remove();
  },

  _compress(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const max = 1024;
          let w = img.width, h = img.height;
          if (w > max || h > max) { const r = Math.min(max/w, max/h); w *= r; h *= r; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  /* ========== BLE ========== */
  async toggleBLE() {
    if (BLE.isConnected) {
      await BLE.disconnect();
      this._updateBLEUI(false);
      Utils.toast('蓝牙已断开');
    } else {
      try {
        this._updateBLEUI('connecting');
        BLE.setDataCallback((type, value) => this._onBLEData(type, value));
        await BLE.scanAndConnect();
        this._updateBLEUI(true);
        const data = await BLE.readAll();
        if (data.phVoltage) this._applyBLEData(data);
      } catch (err) {
        this._updateBLEUI(false);
        Utils.toast(err.message || '蓝牙连接失败', 'error');
        console.log('BLE不可用，使用模拟数据');
      }
    }
  },

  _updateBLEUI(state) {
    const indicator = document.getElementById('ble-indicator');
    const btn = document.getElementById('ble-connect-btn');
    const statusText = document.getElementById('ble-status-text');
    const deviceName = document.getElementById('ble-device-name');

    if (indicator) {
      if (state === true) {
        indicator.className = 'badge badge-teal badge-dot teal';
        indicator.textContent = '已连接';
        indicator.onclick = () => App.toggleBLE();
      } else if (state === 'connecting') {
        indicator.className = 'badge badge-amber';
        indicator.textContent = '连接中...';
      } else {
        indicator.className = 'badge badge-rose';
        indicator.textContent = '未连接';
        indicator.onclick = () => App.toggleBLE();
      }
    }

    if (btn) {
      if (state === true) {
        btn.textContent = '读取';
        btn.onclick = () => App._bleReadOnce();
      } else {
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> 连接';
        btn.onclick = () => App.toggleBLE();
      }
    }

    if (statusText) {
      statusText.textContent = state === true ? '实时监测中 · 数据自动同步' : '点击右侧按钮连接设备';
      statusText.style.color = state === true ? 'var(--teal)' : 'var(--ink-muted)';
    }

    const iconWrap = document.getElementById('ble-icon-wrap');
    if (iconWrap && state === true) {
      iconWrap.classList.add('ble-live', 'ble-live-bg');
    } else if (iconWrap) {
      iconWrap.classList.remove('ble-live', 'ble-live-bg');
    }

    const updateEl = document.getElementById('ble-last-update');
    if (updateEl) {
      if (state === true) updateEl.classList.remove('hidden');
      else updateEl.classList.add('hidden');
    }

    if (deviceName && state === true && BLE._device) {
      deviceName.textContent = BLE._device.name || '#A01';
    }
  },

  _onBLEData(type, value) {
    const now = new Date().toLocaleTimeString();

    if (type === 'phVoltage') {
      const el = document.getElementById('ph-voltage');
      if (el) { el.value = value.toFixed(1); el.classList.add('flash-update'); setTimeout(() => el.classList.remove('flash-update'), 600); }
    } else if (type === 'uaCurrent') {
      const el = document.getElementById('ua-current');
      if (el) { el.value = value.toFixed(2); el.classList.add('flash-update'); setTimeout(() => el.classList.remove('flash-update'), 600); }
    } else if (type === 'temperature') {
      ['ph-temp', 'ua-temp'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.value = value.toFixed(1); el.classList.add('flash-update'); setTimeout(() => el.classList.remove('flash-update'), 600); }
      });
      const homeTemp = document.getElementById('home-temp');
      if (homeTemp) { homeTemp.textContent = value.toFixed(1) + '℃'; homeTemp.classList.add('value-pop'); setTimeout(() => homeTemp.classList.remove('value-pop'), 350); }
    }

    this.calcPH();
    this.calcUA();

    const updateEl = document.getElementById('ble-last-update');
    if (updateEl) { updateEl.textContent = '最后更新: ' + now; updateEl.classList.remove('hidden'); }

    const iconWrap = document.getElementById('ble-icon-wrap');
    if (iconWrap) { iconWrap.classList.add('ble-live', 'ble-live-bg'); setTimeout(() => iconWrap.classList.remove('ble-live'), 2000); }
  },

  async _bleReadOnce() {
    try {
      const data = await BLE.readAll();
      if (data.phVoltage) this._applyBLEData(data);
      Utils.toast('数据已读取');
    } catch (err) {
      Utils.toast('读取失败', 'error');
    }
  },

  _applyBLEData(data) {
    if (data.phVoltage) {
      document.getElementById('ph-voltage').value = data.phVoltage.toFixed(1);
      this.calcPH();
    }
    if (data.uaCurrent) {
      document.getElementById('ua-current').value = data.uaCurrent.toFixed(2);
      this.calcUA();
    }
    if (data.temperature) {
      document.getElementById('ph-temp').value = data.temperature.toFixed(1);
      document.getElementById('ua-temp').value = data.temperature.toFixed(1);
      document.getElementById('home-temp').textContent = data.temperature.toFixed(1) + '℃';
    }
  },

  /* ========== Monitor ========== */
  calcPH() {
    const v = parseFloat(document.getElementById('ph-voltage').value);
    const t = parseFloat(document.getElementById('ph-temp').value);
    if (isNaN(v) || isNaN(t)) return;

    const r = Calculator.calculatePH(v, t);
    const risk = Calculator.analyzePHRisk(r);
    const container = document.getElementById('ph-result');
    const valueEl = document.getElementById('ph-value-display');

    container.classList.remove('hidden');
    valueEl.textContent = r.valid ? r.pHValue : '--';
    valueEl.style.color = `var(--${risk.color === 'danger' ? 'rose' : risk.color === 'warning' ? 'amber' : 'teal'})`;
    valueEl.classList.add('value-pop'); setTimeout(() => valueEl.classList.remove('value-pop'), 350);

    document.getElementById('ph-badge').textContent = risk.status;
    document.getElementById('ph-badge').className = `badge badge-${risk.color === 'danger' ? 'rose' : risk.color === 'warning' ? 'amber' : 'teal'}`;
    document.getElementById('ph-formula-display').textContent = r.formula || '';
    document.getElementById('ph-risk-text').textContent = risk.harm;
    document.getElementById('ph-suggestion-text').textContent = risk.suggestion;

    const homePh = document.getElementById('home-ph');
    if (homePh && r.valid) { homePh.textContent = r.pHValue; homePh.classList.add('value-pop'); setTimeout(() => homePh.classList.remove('value-pop'), 350); }
  },

  calcUA() {
    const c = parseFloat(document.getElementById('ua-current').value);
    const t = parseFloat(document.getElementById('ua-temp').value);
    if (isNaN(c) || isNaN(t)) return;

    const r = Calculator.calculateUA(c, t);
    const risk = Calculator.analyzeUARisk(r);
    const container = document.getElementById('ua-result');
    const valueEl = document.getElementById('ua-value-display');

    container.classList.remove('hidden');
    valueEl.textContent = r.valid ? r.uaValue : '--';
    valueEl.style.color = `var(--${risk.color === 'danger' ? 'rose' : risk.color === 'warning' ? 'amber' : 'teal'})`;
    valueEl.classList.add('value-pop'); setTimeout(() => valueEl.classList.remove('value-pop'), 350);

    document.getElementById('ua-badge').textContent = risk.status;
    document.getElementById('ua-badge').className = `badge badge-${risk.color === 'danger' ? 'rose' : risk.color === 'warning' ? 'amber' : 'teal'}`;
    document.getElementById('ua-formula-display').textContent = r.formula || '';
    document.getElementById('ua-risk-text').textContent = risk.harm;
    document.getElementById('ua-suggestion-text').textContent = risk.suggestion;

    const homeUa = document.getElementById('home-ua');
    if (homeUa && r.valid) { homeUa.textContent = r.uaValue; homeUa.classList.add('value-pop'); setTimeout(() => homeUa.classList.remove('value-pop'), 350); }
  },

  mockSensorRead() {
    if (BLE.isConnected) { this._bleReadOnce(); return; }
    const d = Utils.mockSensorData();
    document.getElementById('ph-voltage').value = (d.ph * 0.05989 + 0.3703).toFixed(1);
    document.getElementById('ph-temp').value = d.temperature;
    document.getElementById('ua-current').value = (d.uricAcid * 0.00313 + 2.07405).toFixed(2);
    document.getElementById('ua-temp').value = d.temperature;
    Utils.toast('模拟传感器数据已读取', 'success');
    this.calcPH();
    this.calcUA();
  },

  async loadMonitorCharts() {
    const records = await DB.getAll('records');
    const empty = document.getElementById('monitor-chart-empty');
    const canvas = document.getElementById('monitor-chart');
    if (records.length > 0) {
      if (empty) empty.style.display = 'none';
      if (canvas) canvas.parentElement.style.display = 'block';
      setTimeout(() => Charts.initTrendChart('monitor-chart', records), 100);
    } else {
      if (empty) empty.style.display = 'block';
      if (canvas) canvas.parentElement.style.display = 'none';
    }
  },

  /* ========== Records ========== */
  async loadWoundList() {
    const wounds = await DB.getWounds();
    const sel = document.getElementById('wound-selector');
    sel.innerHTML = '<option value="">选择宠物档案...</option>';
    wounds.forEach(w => {
      sel.innerHTML += `<option value="${w.id}">🐾 ${w.patientId} · ${Utils.locationText(w.location)} · ${Utils.typeText(w.type)}</option>`;
    });
  },

  async selectWound(id) {
    if (!id) {
      this._currentWound = null;
      document.getElementById('healing-section').classList.add('hidden');
      document.getElementById('records-list').innerHTML = '<p class="text-center caption py-8">选择宠物档案查看记录</p>';
      document.getElementById('records-count').textContent = '0 条记录';
      Charts.destroy('records-chart');
      const ce = document.getElementById('records-chart-empty');
      if (ce) ce.style.display = 'block';
      return;
    }
    this._currentWound = await DB.get('wounds', id);
    await this._loadRecords(id);
  },

  async _loadRecords(woundId) {
    const wound = await DB.get('wounds', woundId);
    if (!wound) return;
    this._currentWound = wound;

    document.getElementById('healing-section').classList.remove('hidden');
    document.getElementById('wound-info-text').textContent = `${wound.patientId} · ${Utils.locationText(wound.location)} · ${Utils.typeText(wound.type)}`;
    document.getElementById('wound-size-text').textContent = wound.size ? `初始大小: ${wound.size} cm²` : '';
    document.getElementById('wound-records-count').textContent = wound.desc || '';

    const records = await DB.getRecords(woundId);
    document.getElementById('records-count').textContent = `${records.length} 条记录`;

    const list = document.getElementById('records-list');
    if (records.length === 0) {
      list.innerHTML = '<p class="text-center caption py-8">暂无监测记录，点击右上角添加</p>';
      document.getElementById('records-chart-empty').style.display = 'block';
      Charts.destroy('records-chart');
      return;
    }

    list.innerHTML = records.map(r => {
      const phS = Utils.phStatus(r.ph);
      const uaS = Utils.uaStatus(r.uricAcid);
      const overall = (phS.color === 'danger' || uaS.color === 'danger') ? 'rose' :
                      (phS.color === 'warning' || uaS.color === 'warning') ? 'amber' : 'teal';
      const label = overall === 'teal' ? '良好' : overall === 'amber' ? '关注' : '警告';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--canvas-warm);border-radius:12px">
        <div>
          <p class="caption">${Utils.formatDate(r.date)}</p>
          <p style="font-weight:600;font-size:13px">pH ${r.ph?.toFixed(1)} · UA ${r.uricAcid}μM${r.temperature ? ` · ${r.temperature}℃` : ''}</p>
          <p class="caption">${r.nurse || ''} ${r.measures ? '· '+r.measures : ''}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge badge-${overall}">${label}</span>
          <button onclick="App._deleteRecord('${r.id}')" style="border:none;background:none;color:var(--ink-muted);cursor:pointer;font-size:14px;padding:4px">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>`;
    }).join('');

    document.getElementById('records-chart-empty').style.display = 'none';
    setTimeout(() => Charts.initReportChart('records-chart', records), 100);
    this._updateHealing(wound, records);
  },

  _updateHealing(wound, records) {
    const sorted = [...records].sort((a, b) => new Date(a.date) - new Date(b.date));
    const days = sorted.length > 1 ?
      (new Date(sorted[sorted.length-1].date) - new Date(sorted[0].date)) / 86400000 : 1;
    const pct = Math.min(95, Math.round(days * 5));
    const circ = 264;
    document.getElementById('healing-ring').style.strokeDashoffset = circ - (pct / 100) * circ;
    document.getElementById('healing-pct').textContent = `${pct}%`;
  },

  async _deleteRecord(id) {
    if (!confirm('确定删除此记录？')) return;
    await DB.deleteRecord(id);
    Utils.toast('记录已删除');
    if (this._currentWound) this._loadRecords(this._currentWound.id);
  },

  /* ========== Modals ========== */
  showAddWoundModal() { document.getElementById('wound-modal').classList.remove('hidden'); },
  showAddRecordModal() {
    if (!this._currentWound) { Utils.toast('请先选择宠物档案', 'warning'); return; }
    document.getElementById('r-date').value = new Date().toISOString().slice(0, 16);
    document.getElementById('record-modal').classList.remove('hidden');
  },
  showSettingsModal() { this._refreshSettingsUI(); document.getElementById('settings-modal').classList.remove('hidden'); },
  closeModal(id) { document.getElementById(id).classList.add('hidden'); },

  async saveWound(e) {
    e.preventDefault();
    await DB.saveWound({
      patientId: document.getElementById('w-patient-id').value,
      species: document.getElementById('w-species').value,
      location: document.getElementById('w-location').value,
      type: document.getElementById('w-type').value,
      size: parseFloat(document.getElementById('w-size').value) || null,
      category: 'pet',
      desc: document.getElementById('w-desc').value
    });
    this.closeModal('wound-modal');
    document.getElementById('wound-form').reset();
    Utils.toast('宠物档案已保存');
    this.loadWoundList();
    this.updateProfileStats();
  },

  async saveRecord(e) {
    e.preventDefault();
    await DB.saveRecord({
      woundId: this._currentWound.id,
      date: document.getElementById('r-date').value,
      nurse: document.getElementById('r-nurse').value,
      ph: parseFloat(document.getElementById('r-ph').value),
      uricAcid: parseInt(document.getElementById('r-ua').value),
      temperature: parseFloat(document.getElementById('r-temp').value) || null,
      measures: document.getElementById('r-measures').value
    });
    this.closeModal('record-modal');
    document.getElementById('record-form').reset();
    Utils.toast('监测记录已添加');
    this._loadRecords(this._currentWound.id);
    this.updateProfileStats();
  },

  /* ========== Knowledge Base ========== */
  openKnowledgeBase() { document.getElementById('knowledge-modal').classList.remove('hidden'); },

  /* ========== Report ========== */
  async generateReport() {
    if (!this._currentWound) {
      const wounds = await DB.getWounds();
      if (wounds.length === 0) { Utils.toast('请先创建宠物档案', 'warning'); return; }
      this._currentWound = wounds[0];
    }
    const records = await DB.getRecords(this._currentWound.id);
    if (records.length === 0) { Utils.toast('该伤口暂无监测记录', 'warning'); return; }

    const latest = records[0];
    let report = `╔══════════════════════════════════╗\n`;
    report += `║  愈见 YuJian · 宠物伤口综合评估报告  ║\n`;
    report += `╚══════════════════════════════════╝\n\n`;
    report += `宠物: ${this._currentWound.patientId}\n`;
    report += `伤口: ${Utils.locationText(this._currentWound.location)} · ${Utils.typeText(this._currentWound.type)}\n`;
    report += `日期: ${new Date().toLocaleDateString()}\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📊 最新指标\n`;
    report += `  pH值: ${latest.ph?.toFixed(1)} (${Utils.phStatus(latest.ph).text})\n`;
    report += `  尿酸: ${latest.uricAcid}μM (${Utils.uaStatus(latest.uricAcid).text})\n`;
    if (latest.temperature) report += `  温度: ${latest.temperature}℃\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📋 历史记录 (${records.length}条)\n`;
    records.forEach(r => {
      report += `  ${Utils.formatDate(r.date)} | pH ${r.ph?.toFixed(1)} | UA ${r.uricAcid}μM | ${r.nurse}\n`;
    });
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `⚠️ 本报告由愈见App自动生成，仅供参考\n`;

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `愈见报告_${this._currentWound.patientId}_${new Date().toISOString().slice(0,10)}.txt`;
    a.click(); URL.revokeObjectURL(url);
    Utils.toast('报告已生成并下载');
  },

  /* ========== Data ========== */
  async exportData() {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `愈见备份_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    Utils.toast('数据已导出');
  },

  importDataPrompt() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        await DB.importAll(JSON.parse(await f.text()));
        Utils.toast('数据导入成功');
        this.loadWoundList(); this.updateProfileStats();
      } catch { Utils.toast('数据格式不正确', 'error'); }
    };
    inp.click();
  },

  /* ========== Settings ========== */
  async _refreshSettingsUI() {
    try {
      const estimate = await navigator.storage?.estimate();
      if (estimate) {
        const mb = (estimate.usage / 1024 / 1024).toFixed(1);
        document.getElementById('cache-size').textContent = mb + ' MB';
      }
    } catch { document.getElementById('cache-size').textContent = '< 1 MB'; }

    const wounds = await DB.getWounds();
    document.getElementById('device-count').textContent = wounds.length + ' 台已绑定';

    const name = await DB.getSetting('profile_name');
    if (name) document.getElementById('profile-name-display').textContent = name;

    const lang = await DB.getSetting('language');
    const langMap = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', 'en': 'English', 'ja': '日本語' };
    if (lang) document.getElementById('lang-label').textContent = langMap[lang] || lang;

    const notif = await DB.getSetting('toggle_notification');
    document.getElementById('toggle-notification').classList.toggle('on', notif !== false);
    const reminder = await DB.getSetting('toggle_reminder');
    document.getElementById('toggle-reminder').classList.toggle('on', reminder !== false);
  },

  async editProfile() {
    // 填充编辑资料弹窗
    const nameInput = document.getElementById('edit-name');
    const phoneInput = document.getElementById('edit-phone');
    const avatarPreview = document.getElementById('edit-avatar-preview');

    if (nameInput) nameInput.value = (this._user && this._user.name) || (await DB.getSetting('profile_name')) || '';
    if (phoneInput) {
      if (this._user && this._user.phone) {
        phoneInput.value = this._user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
      } else {
        phoneInput.value = '未绑定';
      }
    }
    if (avatarPreview) {
      const name = nameInput?.value || '宠';
      avatarPreview.textContent = name.charAt(0).toUpperCase();
    }
    document.getElementById('edit-profile-modal').classList.remove('hidden');
  },

  changeAvatar() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { Utils.toast('图片不能超过5MB', 'error'); return; }
      try {
        const base64 = await this._compress(file);
        await DB.saveSetting('avatar', base64);
        const preview = document.getElementById('edit-avatar-preview');
        if (preview) {
          preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;border-radius:20px;object-fit:cover">`;
        }
        // 更新主页面头像
        const mainAvatar = document.getElementById('profile-avatar');
        if (mainAvatar) {
          mainAvatar.innerHTML = `<img src="${base64}" style="width:100%;height:100%;border-radius:16px;object-fit:cover">`;
        }
        Utils.toast('头像已更新', 'success');
      } catch { Utils.toast('头像上传失败', 'error'); }
    };
    inp.click();
  },

  async saveProfile() {
    const name = document.getElementById('edit-name')?.value.trim();
    if (!name) { Utils.toast('请输入昵称', 'error'); return; }

    await DB.saveSetting('profile_name', name);
    if (this._user) {
      this._user.name = name;
      await DB.saveSetting('auth_session', { token: Utils.uid(), user: this._user });
    }

    // 更新显示
    const displayName = document.getElementById('profile-display-name');
    if (displayName) displayName.textContent = name;
    const nameDisplay = document.getElementById('profile-name-display');
    if (nameDisplay) nameDisplay.textContent = name;
    const avatarPreview = document.getElementById('edit-avatar-preview');
    if (avatarPreview && !avatarPreview.querySelector('img')) avatarPreview.textContent = name.charAt(0);

    this.closeModal('edit-profile-modal');
    Utils.toast('资料已保存', 'success');
  },

  showNotificationCenter() {
    const list = document.getElementById('notification-list');
    if (!list) return;

    // 构建通知内容
    const notifications = [];

    // 检查是否有宠物档案需要提醒
    DB.getWounds().then(wounds => {
      if (wounds.length > 0) {
        notifications.push({
          icon: '🩹',
          title: '定时换药提醒',
          desc: `距离「${wounds[0].patientId}」下次换药还有2小时`,
          time: '刚刚',
          color: 'var(--amber)'
        });
      }

      return DB.getAll('records');
    }).then(records => {
      if (records.length > 0) {
        const latest = records.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        const risk = Utils.overallRisk(latest.ph, latest.uricAcid, latest.temperature);
        if (risk.color !== 'success') {
          notifications.push({
            icon: '⚠️',
            title: '伤口状态提醒',
            desc: '最近一次监测指标异常，请关注伤口状态',
            time: Utils.formatDate(latest.date),
            color: risk.color === 'danger' ? 'var(--rose)' : 'var(--amber)'
          });
        }
      }

      notifications.push({
        icon: '🎉',
        title: '欢迎使用愈见 YuJian',
        desc: '首次使用？试试AI拍照诊断功能吧',
        time: '系统',
        color: 'var(--blue)'
      });

      // 渲染
      if (notifications.length === 0) {
        list.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
          <p class="empty-state-title">暂无通知</p>
          <p class="empty-state-desc">护理提醒和系统消息将在此显示</p>
        </div>`;
      } else {
        list.innerHTML = notifications.map(n => `
          <div style="display:flex;gap:12px;padding:14px;background:var(--canvas-warm);border-radius:14px;border-left:3px solid ${n.color}">
            <div style="font-size:20px;flex-shrink:0;width:36px;height:36px;border-radius:10px;background:var(--surface);display:flex;align-items:center;justify-content:center">${n.icon}</div>
            <div style="flex:1;min-width:0">
              <p style="font-weight:600;font-size:14px;margin-bottom:2px">${n.title}</p>
              <p class="caption" style="line-height:1.5">${n.desc}</p>
              <p class="caption" style="margin-top:4px;opacity:0.6;font-size:11px">${n.time}</p>
            </div>
          </div>
        `).join('');
      }

      document.getElementById('notification-modal').classList.remove('hidden');

      // 隐藏通知红点
      const dot = document.getElementById('notif-dot');
      if (dot) dot.classList.add('hidden');
    });
  },

  showDeviceManager() {
    Utils.toast('设备管理：请在"记录"页管理已绑定的宠物档案', 'warning');
    this.closeModal('settings-modal');
    this.switchTab('records');
  },

  /* ========== 社区相关 ========== */
  async _initCommunity() {
    // 检查Supabase是否配置
    if (!SB.client) {
      const listEl = document.getElementById('post-list');
      if (listEl) {
        listEl.innerHTML = `<div class="community-empty">
          <div class="community-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <p class="community-empty-title">社区未配置</p>
          <p class="community-empty-desc">请先配置Supabase连接</p>
        </div>`;
      }
      return;
    }

    // 检查Supabase会话
    let { user } = await SB.auth.getUser();

    // 无Supabase会话但App已登录 → 尝试用本地身份同步到Supabase
    if (!user && this._isLoggedIn && this._user) {
      const u = this._user;
      let email = u.email;
      if (!email && u.phone) email = `${u.phone}@yujian.app`;
      if (!email && u.provider) email = `${u.provider}_${u.id?.slice(0, 12) || 'user'}@yujian.app`;

      if (email) {
        const sbUser = await Auth._ensureSupabaseUser(email, u.name || '宠物主人');
        if (sbUser) {
          this._user = { ...this._user, ...sbUser };
          await DB.saveSetting('auth_session', { token: sbUser.token || 'supabase', user: this._user });
          user = (await SB.auth.getUser()).user;
        }
      }
    }

    if (!user) {
      // 完全未登录 → 引导去登录
      const listEl = document.getElementById('post-list');
      if (listEl) {
        listEl.innerHTML = `<div class="community-empty">
          <div class="community-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <p class="community-empty-title">登录后可使用社区</p>
          <p class="community-empty-desc">发帖、点赞、评论和好友聊天</p>
          <button class="btn btn-primary btn-sm" style="margin-top:16px" onclick="App.showAuth()">去登录</button>
        </div>`;
      }
      return;
    }

    Community._currentUserId = user.id;
    await Community.init();
    await Friends.init();
  },

  showFriendsPage() {
    document.getElementById('page-community').style.display = 'none';
    document.getElementById('page-friends').style.display = 'block';
    Friends.loadFriends();
    Friends.loadRequests();
  },

  closeFriendsPage() {
    document.getElementById('page-friends').style.display = 'none';
    document.getElementById('page-community').style.display = 'block';
  },

  async toggleSetting(key) {
    const current = await DB.getSetting(`toggle_${key}`);
    const newVal = !current;
    await DB.saveSetting(`toggle_${key}`, newVal);
    const el = document.getElementById(`toggle-${key}`);
    if (el) el.classList.toggle('on', newVal);
    Utils.toast(newVal ? '已开启' : '已关闭');
  },

  async clearCache() {
    if (confirm('清除缓存不会删除宠物档案和监测记录，确定继续？')) {
      Charts.destroyAll();
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      document.getElementById('cache-size').textContent = '0 MB';
      Utils.toast('缓存已清除');
    }
  },

  showSecurityInfo() {
    const loginTime = localStorage.getItem('yujian_first_visit') || new Date().toISOString();
    localStorage.setItem('yujian_first_visit', loginTime);
    const modal = document.getElementById('info-modal');
    document.getElementById('info-modal-title').textContent = '账号安全';
    document.getElementById('info-modal-body').innerHTML = `
      <div class="dx-field"><span class="dx-label">首次使用</span><span class="dx-value">${Utils.formatDate(loginTime)}</span></div>
      <div class="dx-field"><span class="dx-label">数据存储</span><span class="dx-value" style="color:var(--teal)">本地加密存储</span></div>
      <div class="dx-field"><span class="dx-label">账号保护</span><span class="dx-value">设备绑定 · 离线数据</span></div>
      <div class="dx-field"><span class="dx-label">登录方式</span><span class="dx-value">本机免登录</span></div>
      <p class="caption" style="margin-top:12px">数据仅存储在本设备中，不会上传到云端。卸载App将丢失所有数据，请定期备份。</p>
    `;
    modal.classList.remove('hidden');
  },

  showLanguagePicker() {
    const langs = [
      { id: 'zh-CN', name: '简体中文', current: true },
      { id: 'zh-TW', name: '繁體中文', current: false },
      { id: 'en', name: 'English', current: false },
      { id: 'ja', name: '日本語', current: false }
    ];
    const modal = document.getElementById('info-modal');
    document.getElementById('info-modal-title').textContent = '选择语言';
    document.getElementById('info-modal-body').innerHTML = langs.map(l =>
      `<div onclick="App.setLanguage('${l.id}')" style="padding:14px;border-radius:12px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center${l.current ? ';background:var(--blue-soft);color:var(--blue);font-weight:600' : ';background:var(--canvas-warm)'}">
        ${l.name} ${l.current ? '<span class="badge badge-blue">当前</span>' : ''}
      </div>`
    ).join('');
    modal.classList.remove('hidden');
  },

  setLanguage(lang) {
    document.getElementById('lang-label').textContent = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', 'en': 'English', 'ja': '日本語' }[lang] || lang;
    DB.saveSetting('language', lang);
    document.getElementById('info-modal').classList.add('hidden');
    Utils.toast('语言已切换（部分内容需重启生效）');
  },

  showAbout() {
    const modal = document.getElementById('info-modal');
    document.getElementById('info-modal-title').textContent = '关于愈见';
    document.getElementById('info-modal-body').innerHTML = `
      <div style="text-align:center;margin-bottom:16px">
        <div class="brand-mark" style="margin:0 auto 12px;width:56px;height:56px;border-radius:16px;font-size:24px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" opacity="0.3"/><path d="M12 6v6l4 2"/></svg></div>
        <p class="display" style="font-size:22px">愈见 <span class="caption">YuJian</span></p>
        <p class="caption">v2.0.0 · 宠物智能伤口护理系统</p>
      </div>
      <div class="dx-field"><span class="dx-label">核心技术</span><span class="dx-value">柔性电化学传感</span></div>
      <div class="dx-field"><span class="dx-label">AI 模型</span><span class="dx-value">DeepSeek</span></div>
      <div class="dx-field"><span class="dx-label">支持平台</span><span class="dx-value">Android · iOS · Web</span></div>
      <div class="dx-field"><span class="dx-label">数据安全</span><span class="dx-value" style="color:var(--teal)">本地存储 · 不上传云端</span></div>
      <p class="caption" style="margin-top:14px;text-align:center">基于多轮动物实验验证的核心传感技术<br>拥有多项知识产权与赛事荣誉<br>致力于成为宠物智能伤口护理领域标杆品牌</p>
      <p class="caption" style="margin-top:8px;text-align:center">© 2026 愈见团队 · 沪ICP备XXXXXXXX号</p>
    `;
    modal.classList.remove('hidden');
  },

  showLegal(type) {
    const modal = document.getElementById('info-modal');
    const content = type === 'terms' ? {
      title: '用户协议',
      body: `<p style="font-weight:700;margin-bottom:8px">愈见 YuJian 用户服务协议</p>
<p class="caption" style="line-height:1.8">欢迎使用愈见宠物智能伤口护理系统。本协议是您与愈见团队之间关于使用愈见服务的法律协议。</p>
<p class="caption" style="line-height:1.8;margin-top:8px"><b>1. 服务说明：</b>愈见提供宠物伤口AI诊断、实时监测、护理指导等功能。AI诊断结果仅供参考，不构成兽医诊断。</p>
<p class="caption" style="line-height:1.8;margin-top:4px"><b>2. 免责声明：</b>本App提供的所有信息和建议均不能替代专业兽医诊断。如宠物出现严重症状，请立即就医。</p>
<p class="caption" style="line-height:1.8;margin-top:4px"><b>3. 数据隐私：</b>您的所有数据存储在本设备中，不会上传到云端服务器。数据安全由您自行负责，建议定期备份。</p>
<p class="caption" style="line-height:1.8;margin-top:4px"><b>4. 会员服务：</b>Pro会员享有无限AI使用等权益，具体以产品内说明为准。</p>`
    } : {
      title: '隐私政策',
      body: `<p style="font-weight:700;margin-bottom:8px">愈见 YuJian 隐私政策</p>
<p class="caption" style="line-height:1.8">我们极其重视您和宠物的隐私。</p>
<p class="caption" style="line-height:1.8;margin-top:8px"><b>1. 数据收集：</b>愈见仅在您主动输入时收集宠物伤口信息、监测数据和AI对话内容。我们不会主动收集个人身份信息。</p>
<p class="caption" style="line-height:1.8;margin-top:4px"><b>2. 数据存储：</b>所有数据仅存储在您的设备本地（IndexedDB），我们不会将数据上传到任何服务器。</p>
<p class="caption" style="line-height:1.8;margin-top:4px"><b>3. 相机权限：</b>拍照诊断功能需要相机权限，照片仅在您的设备上处理，不会上传到我们的服务器（直接发送至AI服务商）。</p>
<p class="caption" style="line-height:1.8;margin-top:4px"><b>4. 蓝牙权限：</b>连接智能创可贴设备需要蓝牙权限，仅用于接收传感器数据。</p>
<p class="caption" style="line-height:1.8;margin-top:4px"><b>5. 第三方服务：</b>AI对话功能通过DeepSeek API实现，您的提问内容会传输至DeepSeek服务器进行处理。</p>`
    };
    document.getElementById('info-modal-title').textContent = content.title;
    document.getElementById('info-modal-body').innerHTML = content.body;
    modal.classList.remove('hidden');
  },

  shareApp() {
    if (navigator.share) {
      navigator.share({ title: '愈见 YuJian', text: '推荐你试试愈见——宠物智能伤口护理App，AI拍照诊断+实时监测！', url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard.writeText('试试愈见 YuJian——宠物智能伤口护理App！AI拍照诊断+实时监测。').then(() => Utils.toast('链接已复制，分享给宠友吧')).catch(() => Utils.toast('分享功能暂不可用'));
    }
  },

  async loadSettings() {
    const key = await DB.getSetting('deepseek_api_key');
    const url = await DB.getSetting('api_url');
    const model = await DB.getSetting('model');
    if (key && !key.includes('deepseek')) AI.setApiKey(key);
    if (url && !url.includes('deepseek')) AI._baseURL = url;
    if (model && !model.includes('deepseek')) AI._model = model;
    this._isPro = !!(await DB.getSetting('is_pro'));
  },

  async saveSettings() {
    const key = document.getElementById('setting-api-key').value.trim();
    const url = document.getElementById('setting-api-url').value.trim();
    const model = document.getElementById('setting-model').value.trim();
    if (key) await DB.saveSetting('deepseek_api_key', key);
    if (url) await DB.saveSetting('api_url', url);
    if (model) await DB.saveSetting('model', model);
    AI.setApiKey(key);
    if (url) AI._baseURL = url;
    if (model) AI._model = model;
    Utils.toast('开发者配置已保存');
  },

  async clearAllData() {
    if (!confirm('确定删除所有数据？此操作不可恢复！')) return;
    await DB.clear('wounds'); await DB.clear('records'); await DB.clear('chatHistory');
    this._currentWound = null; this._chatMessages = [];
    Utils.toast('所有数据已清除');
    this.loadWoundList(); this.loadHomeData(); this.updateProfileStats();
    Charts.destroyAll();
  },

  /* ========== Logout ========== */
  async logout() {
    if (!confirm('确定退出登录？')) return;
    // 退出 Supabase 会话
    if (typeof SB !== 'undefined' && SB.client) {
      await SB.auth.signOut();
    }
    await DB.saveSetting('auth_session', null);
    this._isLoggedIn = false;
    this._user = null;
    Utils.toast('已退出登录');
    this.showAuth();
  },

  /* ========== Membership ========== */
  async doUpgrade() {
    await DB.setPro(true);
    await DB.saveSetting('pro_expiry', new Date(Date.now() + 30*86400000).toISOString());
    Utils.toast('已升级为愈见 Pro！无限畅用AI助手', 'success');
    this.updateProfileStats();
    this._refreshUsageUI();
  },

  /* ========== Profile Stats ========== */
  async updateProfileStats() {
    const [wounds, records, chats] = await Promise.all([
      DB.getAll('wounds'), DB.getAll('records'), DB.getAll('chatHistory')
    ]);
    document.getElementById('stat-wounds').textContent = wounds.length;
    document.getElementById('stat-records').textContent = records.length;
    document.getElementById('stat-chats').textContent = chats.length;

    // 更新用户信息展示
    if (this._user) {
      document.getElementById('profile-display-name').textContent = this._user.name || '宠物主人';
      document.getElementById('profile-display-phone').textContent = this._user.phone ? this._user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : (this._user.email || '--');
    }

    // 恢复头像
    const avatar = await DB.getSetting('avatar');
    if (avatar) {
      const mainAvatar = document.getElementById('profile-avatar');
      if (mainAvatar) mainAvatar.innerHTML = `<img src="${avatar}" style="width:100%;height:100%;border-radius:16px;object-fit:cover">`;
    }

    // 通知红点
    const notifDot = document.getElementById('notif-dot');
    if (notifDot) notifDot.classList.remove('hidden');

    const isPro = await DB.isPro();
    const tierEl = document.getElementById('member-tier');
    const upgradeCard = document.getElementById('upgrade-card');
    const subtitle = document.getElementById('member-subtitle');
    if (isPro) {
      if (tierEl) { tierEl.className = 'member-tier pro'; tierEl.textContent = '✦ PRO 会 员'; }
      if (upgradeCard) upgradeCard.style.display = 'none';
      if (subtitle) subtitle.textContent = '无限AI咨询 · 全部功能解锁';
    } else {
      if (tierEl) { tierEl.className = 'member-tier free'; tierEl.textContent = '免 费 会 员'; }
      if (upgradeCard) upgradeCard.style.display = 'block';
      if (subtitle) subtitle.textContent = '每日5次AI咨询';
    }
  },

  /* ========== Helpers ========== */
  _e(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML.replace(/\n/g, '<br>');
  }
};

/* ═══════════════════════════════════════════
   Auth Controller
   ═══════════════════════════════════════════ */

const Auth = {
  _countdownTimers: {},

  switchTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.auth === tab));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.toggle('active', f.id === `auth-${tab}`));
  },

  togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (btn) {
      btn.innerHTML = isPassword
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
  },

  _loginSuccess(user) {
    App._isLoggedIn = true;
    App._user = user;
    if (typeof AuthAnim !== 'undefined') AuthAnim.showSuccess(user.name);
    setTimeout(() => {
      App.hideAuth();
      App.loadHomeData();
      App.loadWoundList();
      App.loadChatHistory();
      App.updateProfileStats();
    }, 1200);
  },

  async sendCode(type) {
    const phoneId = type === 'login' ? 'login-phone' : type === 'reg' ? 'reg-phone' : 'forgot-phone';
    const btnId = type === 'login' ? 'login-send-code' : type === 'reg' ? 'reg-send-code' : 'forgot-send-code';
    const phone = document.getElementById(phoneId).value.trim();

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      const input = document.getElementById(phoneId);
      if (input && typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(input);
      Utils.toast('请输入有效的手机号码', 'error');
      return;
    }

    const btn = document.getElementById(btnId);
    btn.disabled = true;
    let seconds = 60;
    btn.textContent = `${seconds}s`;

    this._countdownTimers[type] = setInterval(() => {
      seconds--;
      if (seconds <= 0) {
        clearInterval(this._countdownTimers[type]);
        btn.disabled = false;
        btn.textContent = '获取验证码';
      } else {
        btn.textContent = `${seconds}s`;
      }
    }, 1000);

    Utils.toast('验证码已发送（演示模式：任意6位数字均可）', 'success');
  },

  /* ========== Supabase 通用登录 ========== */

  // 将任意身份标识映射为 Supabase 会话
  // email: 用于 Supabase 的标识邮箱（如 phone@yujian.app）
  // displayName: 用户昵称
  async _ensureSupabaseUser(email, displayName) {
    if (typeof SB === 'undefined' || !SB.client) return null;

    // 确定性密码：同一邮箱始终映射同一密码
    const password = 'yujian_' + btoa(email).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

    let { data, error } = await SB.auth.signIn(email, password);

    // 邮箱未确认 → 无法自动登录，返回null降级
    if (error && error.message?.includes('Email not confirmed')) {
      console.warn('⚠️ 邮箱未确认。请在 Supabase Dashboard → Authentication → Settings → 关闭 "Enable email confirmations"');
      return null;
    }

    // 账号不存在 → 自动注册
    if (error && (
      error.message?.includes('Invalid') ||
      error.message?.includes('invalid') ||
      error.message?.includes('credentials') ||
      error.status === 400
    )) {
      const { data: signUpData, error: signUpErr } = await SB.auth.signUp(email, password, displayName);
      if (signUpErr) {
        // 如果注册也失败（如邮箱格式被拒），返回null降级本地
        console.warn('Supabase 自动注册失败:', signUpErr.message);
        return null;
      }
      data = signUpData;

      // 注册成功但无session → 可能开启了邮箱确认
      // 直接再试一次登录
      if (!data.session && data.user) {
        const retry = await SB.auth.signIn(email, password);
        if (retry.data?.session) {
          data = retry.data;
        } else {
          console.warn('⚠️ Supabase 邮箱确认未关闭。请在 Supabase Dashboard → Authentication → Settings → 关闭 "Enable email confirmations" 以启用社区功能。');
        }
      }
    } else if (error) {
      console.warn('Supabase 登录失败:', error.message);
      return null;
    }

    if (data?.user) {
      // 确保 users 表有记录
      await SB.db.upsert('users', {
        id: data.user.id,
        email,
        name: displayName || email.split('@')[0],
        avatar_url: null
      });
      return {
        id: data.user.id,
        email,
        name: displayName || email.split('@')[0],
        token: data.session?.access_token || null
      };
    }
    return null;
  },

  async login() {
    const phone = document.getElementById('login-phone').value.trim();
    const code = document.getElementById('login-code').value.trim();
    const btn = document.getElementById('btn-login-phone');

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      const input = document.getElementById('login-phone');
      if (input && typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(input);
      Utils.toast('请输入有效的手机号码', 'error'); return;
    }
    if (!/^\d{6}$/.test(code)) {
      const input = document.getElementById('login-code');
      if (input && typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(input);
      Utils.toast('请输入6位验证码', 'error'); return;
    }

    if (typeof AuthAnim !== 'undefined' && btn) AuthAnim.setButtonLoading(btn, true);

    // 尝试通过 Supabase 建立会话
    const sbEmail = `${phone}@yujian.app`;
    const sbUser = await this._ensureSupabaseUser(sbEmail, '宠物主人');

    if (sbUser) {
      await DB.saveSetting('auth_session', { token: sbUser.token || Utils.uid(), user: sbUser });
      if (typeof AuthAnim !== 'undefined' && btn) AuthAnim.setButtonLoading(btn, false);
      this._loginSuccess(sbUser);
    } else {
      // Supabase 不可用时降级为本地登录
      await new Promise(r => setTimeout(r, 600));
      const user = { phone, name: '宠物主人', id: Utils.uid() };
      await DB.saveSetting('auth_session', { token: Utils.uid(), user });
      if (typeof AuthAnim !== 'undefined' && btn) AuthAnim.setButtonLoading(btn, false);
      this._loginSuccess(user);
    }
  },

  async loginWithPassword() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('btn-login');

    if (!email) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('login-email')); Utils.toast('请输入邮箱', 'error'); return; }
    if (!password) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('login-password')); Utils.toast('请输入密码', 'error'); return; }

    if (typeof AuthAnim !== 'undefined' && btn) AuthAnim.setButtonLoading(btn, true);

    // 使用 Supabase 真实登录
    if (typeof SB !== 'undefined' && SB.client) {
      const { data, error } = await SB.auth.signIn(email, password);
      if (typeof AuthAnim !== 'undefined' && btn) AuthAnim.setButtonLoading(btn, false);
      if (error) { Utils.toast(error.message || '登录失败', 'error'); return; }

      // 从 users 表获取用户资料
      const { data: profile } = await SB.db.select('users', { eq: { id: data.user.id } });
      const user = {
        id: data.user.id,
        email,
        name: profile?.[0]?.name || email.split('@')[0],
        avatar_url: profile?.[0]?.avatar_url
      };
      await DB.saveSetting('auth_session', { token: data.session?.access_token || Utils.uid(), user });
      this._loginSuccess(user);
    } else {
      // Supabase 未配置，降级为本地登录
      await new Promise(r => setTimeout(r, 600));
      const user = { email, name: email.split('@')[0], id: Utils.uid() };
      await DB.saveSetting('auth_session', { token: Utils.uid(), user });
      this._loginSuccess(user);
    }
  },

  async register() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const btn = document.getElementById('btn-register');

    if (!name) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('reg-name')); Utils.toast('请输入昵称', 'error'); return; }
    if (!email) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('reg-email')); Utils.toast('请输入邮箱', 'error'); return; }
    if (password.length < 6) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('reg-password')); Utils.toast('密码至少6位', 'error'); return; }

    if (typeof AuthAnim !== 'undefined' && btn) AuthAnim.setButtonLoading(btn, true);

    // 使用 Supabase 真实注册
    if (typeof SB !== 'undefined' && SB.client) {
      const { data, error } = await SB.auth.signUp(email, password, name);
      if (typeof AuthAnim !== 'undefined' && btn) AuthAnim.setButtonLoading(btn, false);
      if (error) { Utils.toast(error.message || '注册失败', 'error'); return; }

      let session = data.session;
      // 注册成功但无session → 可能开启了邮箱确认，再试一次登录
      if (!session && data.user) {
        const retry = await SB.auth.signIn(email, password);
        if (retry.data?.session) session = retry.data.session;
      }

      const user = { id: data.user.id, email, name };
      await DB.saveSetting('auth_session', { token: session?.access_token || Utils.uid(), user });
      this._loginSuccess(user);
    } else {
      // Supabase 未配置，降级为本地注册
      await new Promise(r => setTimeout(r, 800));
      const user = { email, name, id: Utils.uid() };
      await DB.saveSetting('auth_session', { token: Utils.uid(), user });
      this._loginSuccess(user);
    }
  },

  async registerWithPhone() {
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const code = document.getElementById('reg-code').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!name) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('reg-name')); Utils.toast('请输入昵称', 'error'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('reg-phone')); Utils.toast('请输入有效的手机号码', 'error'); return; }
    if (!/^\d{6}$/.test(code)) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('reg-code')); Utils.toast('请输入6位验证码', 'error'); return; }
    if (password.length < 6) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('reg-password')); Utils.toast('密码至少6位', 'error'); return; }

    // 通过 Supabase 建立会话
    const sbEmail = `${phone}@yujian.app`;
    const sbUser = await this._ensureSupabaseUser(sbEmail, name);

    if (sbUser) {
      await DB.saveSetting('auth_session', { token: sbUser.token || Utils.uid(), user: sbUser });
      this._loginSuccess(sbUser);
    } else {
      // Supabase 不可用时降级
      await new Promise(r => setTimeout(r, 600));
      const user = { phone, name, id: Utils.uid() };
      await DB.saveSetting('auth_session', { token: Utils.uid(), user });
      this._loginSuccess(user);
    }
  },

  async resetPassword() {
    const phone = document.getElementById('forgot-phone').value.trim();
    const code = document.getElementById('forgot-code').value.trim();
    const newPass = document.getElementById('forgot-new-pass').value;

    if (!/^1[3-9]\d{9}$/.test(phone)) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('forgot-phone')); Utils.toast('请输入有效的手机号码', 'error'); return; }
    if (!/^\d{6}$/.test(code)) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('forgot-code')); Utils.toast('请输入6位验证码', 'error'); return; }
    if (newPass.length < 6) { if (typeof AuthAnim !== 'undefined') AuthAnim.shakeInput(document.getElementById('forgot-new-pass')); Utils.toast('密码至少6位', 'error'); return; }

    Utils.toast('密码重置成功，请登录', 'success');
    this.switchTab('login');
  },

  async socialLogin(provider) {
    const names = { wechat: '微信用户', apple: 'Apple用户', qq: 'QQ用户' };
    const displayName = names[provider] || '用户';
    const uid = Utils.uid().slice(0, 12);
    const sbEmail = `${provider}_${uid}@yujian.app`;

    const sbUser = await this._ensureSupabaseUser(sbEmail, displayName);

    if (sbUser) {
      await DB.saveSetting('auth_session', { token: sbUser.token || Utils.uid(), user: { ...sbUser, provider } });
      this._loginSuccess({ ...sbUser, provider });
    } else {
      const user = { name: displayName, id: Utils.uid(), provider };
      await DB.saveSetting('auth_session', { token: Utils.uid(), user });
      this._loginSuccess(user);
    }
  }
};

/* ========== Bootstrap ========== */
document.addEventListener('DOMContentLoaded', () => App.init());

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
