/* ═══════════════════════════════════════════
   愈见 YuJian — 好友与聊天逻辑
   ═══════════════════════════════════════════ */

const Friends = {
  _friends: [],
  _requests: [],
  _currentFriend: null,
  _messages: [],
  _messageChannel: null,

  /* ========== 初始化 ========== */
  async init() {
    await this.loadFriends();
    await this.loadRequests();
    this._subscribeMessages();
  },

  /* ========== 加载好友列表 ========== */
  async loadFriends() {
    const { user } = await SB.auth.getUser();
    if (!user) return;

    try {
      // 查询我发出的好友请求（已接受的）
      const { data: sent, error: sentErr } = await SB.db.query('friendships')
        .select('*, to_user:users!friendships_to_user_id_fkey(id, name, avatar_url)')
        .eq('from_user_id', user.id)
        .eq('status', 'accepted');

      // 查询我收到的好友请求（已接受的）
      const { data: received, error: recvErr } = await SB.db.query('friendships')
        .select('*, from_user:users!friendships_from_user_id_fkey(id, name, avatar_url)')
        .eq('to_user_id', user.id)
        .eq('status', 'accepted');

      if (sentErr || recvErr) throw sentErr || recvErr;

      // 合并好友列表
      this._friends = [
        ...(sent || []).map(f => ({ ...f.to_user, friendshipId: f.id })),
        ...(received || []).map(f => ({ ...f.from_user, friendshipId: f.id }))
      ];

      this._renderFriendsList();
    } catch (err) {
      console.error('加载好友失败:', err);
    }
  },

  _renderFriendsList() {
    const listEl = document.getElementById('friends-list');
    if (!listEl) return;

    if (this._friends.length === 0) {
      listEl.innerHTML = `<div class="community-empty">
        <div class="community-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <p class="community-empty-title">还没有好友</p>
        <p class="community-empty-desc">搜索用户添加好友吧</p>
      </div>`;
      return;
    }

    listEl.innerHTML = this._friends.map(friend => `
      <div class="friend-item" data-friend-id="${friend.id}">
        <div class="friend-avatar">
          ${friend.avatar_url
            ? `<img src="${friend.avatar_url}" alt="">`
            : (friend.name?.[0] || '?')}
        </div>
        <div class="friend-info">
          <div class="friend-name">${this._escapeHtml(friend.name)}</div>
          <div class="friend-status">在线</div>
        </div>
        <button class="friend-action chat" onclick="Friends.openChat('${friend.id}', '${this._escapeHtml(friend.name)}')">
          聊天
        </button>
        <button class="friend-action reject" onclick="Friends.removeFriend('${friend.id}', '${friend.friendshipId}')">
          删除
        </button>
      </div>
    `).join('');
  },

  /* ========== 加载好友申请 ========== */
  async loadRequests() {
    const { user } = await SB.auth.getUser();
    if (!user) return;

    try {
      const { data, error } = await SB.db.query('friendships')
        .select('*, from_user:users!friendships_from_user_id_fkey(id, name, avatar_url)')
        .eq('to_user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      this._requests = data || [];
      this._renderRequests();
      this._updateBadge();
    } catch (err) {
      console.error('加载申请失败:', err);
    }
  },

  _renderRequests() {
    const listEl = document.getElementById('friend-requests');
    if (!listEl) return;

    if (this._requests.length === 0) {
      listEl.style.display = 'none';
      return;
    }

    listEl.style.display = 'block';
    listEl.innerHTML = `
      <div class="friends-section-title">好友申请 (${this._requests.length})</div>
      ${this._requests.map(req => `
        <div class="friend-item">
          <div class="friend-avatar">
            ${req.from_user.avatar_url
              ? `<img src="${req.from_user.avatar_url}" alt="">`
              : (req.from_user.name?.[0] || '?')}
          </div>
          <div class="friend-info">
            <div class="friend-name">${this._escapeHtml(req.from_user.name)}</div>
            <div class="friend-status">${this._timeAgo(req.created_at)}</div>
          </div>
          <button class="friend-action accept" onclick="Friends.acceptRequest('${req.id}')">接受</button>
          <button class="friend-action reject" onclick="Friends.rejectRequest('${req.id}')">拒绝</button>
        </div>
      `).join('')}
    `;
  },

  _updateBadge() {
    const badge = document.getElementById('friends-badge');
    if (badge) {
      badge.textContent = this._requests.length;
      badge.style.display = this._requests.length > 0 ? 'block' : 'none';
    }
  },

  /* ========== 搜索用户 ========== */
  async searchUsers(query) {
    if (!query.trim()) {
      Utils.toast('请输入搜索内容', 'warning');
      return;
    }

    const resultsEl = document.getElementById('search-results');
    resultsEl.innerHTML = '<div class="loading-spinner"></div>';

    try {
      const { data, error } = await SB.db.query('users')
        .select('id, name, avatar_url, email')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;

      const { user: currentUser } = await SB.auth.getUser();

      if (data.length === 0) {
        resultsEl.innerHTML = '<p style="text-align:center;color:var(--ink-muted);padding:20px">未找到用户</p>';
        return;
      }

      // 过滤掉自己和已是好友的用户
      const friendIds = this._friends.map(f => f.id);
      const filtered = data.filter(u => u.id !== currentUser.id && !friendIds.includes(u.id));

      if (filtered.length === 0) {
        resultsEl.innerHTML = '<p style="text-align:center;color:var(--ink-muted);padding:20px">没有可添加的用户</p>';
        return;
      }

      resultsEl.innerHTML = filtered.map(u => `
        <div class="search-result-item friend-item">
          <div class="friend-avatar">
            ${u.avatar_url
              ? `<img src="${u.avatar_url}" alt="">`
              : (u.name?.[0] || '?')}
          </div>
          <div class="friend-info">
            <div class="friend-name">${this._escapeHtml(u.name)}</div>
            <div class="friend-status">${u.email || ''}</div>
          </div>
          <button class="friend-action add" onclick="Friends.sendRequest('${u.id}')">添加</button>
        </div>
      `).join('');
    } catch (err) {
      resultsEl.innerHTML = '<p style="text-align:center;color:var(--rose);padding:20px">搜索失败</p>';
    }
  },

  /* ========== 发送好友申请 ========== */
  async sendRequest(toUserId) {
    const { user } = await SB.auth.getUser();
    if (!user) return;

    try {
      const { error } = await SB.db.insert('friendships', {
        from_user_id: user.id,
        to_user_id: toUserId,
        status: 'pending'
      });

      if (error) throw error;
      Utils.toast('申请已发送', 'success');
      document.getElementById('search-results').innerHTML = '';
    } catch (err) {
      if (err.message.includes('duplicate')) {
        Utils.toast('已经发送过申请', 'warning');
      } else {
        Utils.toast('发送失败: ' + err.message, 'error');
      }
    }
  },

  /* ========== 接受好友申请 ========== */
  async acceptRequest(friendshipId) {
    try {
      const { error } = await SB.db.update('friendships', friendshipId, {
        status: 'accepted'
      });

      if (error) throw error;
      Utils.toast('已添加好友', 'success');
      await this.loadRequests();
      await this.loadFriends();
    } catch (err) {
      Utils.toast('操作失败', 'error');
    }
  },

  /* ========== 拒绝好友申请 ========== */
  async rejectRequest(friendshipId) {
    try {
      const { error } = await SB.db.delete('friendships', friendshipId);
      if (error) throw error;
      await this.loadRequests();
    } catch (err) {
      Utils.toast('操作失败', 'error');
    }
  },

  /* ========== 删除好友 ========== */
  async removeFriend(friendId, friendshipId) {
    if (!confirm('确定删除该好友吗？')) return;

    try {
      const { error } = await SB.db.delete('friendships', friendshipId);
      if (error) throw error;
      Utils.toast('已删除好友', 'success');
      await this.loadFriends();
    } catch (err) {
      Utils.toast('操作失败', 'error');
    }
  },

  /* ========== 聊天功能 ========== */
  async openChat(friendId, friendName) {
    this._currentFriend = { id: friendId, name: friendName };

    // 切换到聊天页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-chat').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'none';

    // 设置聊天头部
    document.querySelector('.chat-header-name').textContent = friendName;

    // 加载聊天记录
    await this._loadMessages(friendId);

    // 订阅消息
    this._subscribeMessages();
  },

  async _loadMessages(friendId) {
    const { user } = await SB.auth.getUser();
    if (!user) return;

    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
      // 查询双向消息
      const { data, error } = await SB.db.query('messages')
        .select('*')
        .or(`and(from_user_id.eq.${user.id},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${user.id})`)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) throw error;
      this._messages = data || [];
      this._renderMessages();

      // 标记已读
      await SB.db.query('messages')
        .update({ read: true })
        .eq('from_user_id', friendId)
        .eq('to_user_id', user.id)
        .eq('read', false);

    } catch (err) {
      container.innerHTML = '<p style="text-align:center;color:var(--rose);padding:20px">加载消息失败</p>';
    }
  },

  async _renderMessages() {
    const container = document.getElementById('chat-messages');
    const { user } = await SB.auth.getUser();

    if (this._messages.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--ink-muted);padding:40px">开始聊天吧</p>';
      return;
    }

    container.innerHTML = this._messages.map(msg => {
      const isSent = msg.from_user_id === user.id;
      return `
        <div class="msg-bubble ${isSent ? 'sent' : 'received'}">
          ${this._escapeHtml(msg.content)}
          <div class="msg-time">${this._formatTime(msg.created_at)}</div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  },

  async sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content) return;

    const { user } = await SB.auth.getUser();
    if (!user || !this._currentFriend) return;

    try {
      const { error } = await SB.db.insert('messages', {
        from_user_id: user.id,
        to_user_id: this._currentFriend.id,
        content
      });

      if (error) throw error;

      input.value = '';
      this._messages.push({
        from_user_id: user.id,
        to_user_id: this._currentFriend.id,
        content,
        created_at: new Date().toISOString()
      });
      this._renderMessages();
    } catch (err) {
      Utils.toast('发送失败', 'error');
    }
  },

  _subscribeMessages() {
    if (this._messageChannel) {
      SB.realtime.unsubscribe(this._messageChannel);
    }

    SB.auth.getUser().then(({ user }) => {
      if (!user) return;

      this._messageChannel = SB.realtime.subscribeMessages(user.id, (payload) => {
        const newMsg = payload.new;

        // 如果是在聊天页面且是当前对话
        if (this._currentFriend &&
            (newMsg.from_user_id === this._currentFriend.id ||
             newMsg.to_user_id === this._currentFriend.id)) {
          this._messages.push(newMsg);
          this._renderMessages();
        }

        // 更新好友申请badge
        this.loadRequests();
      });
    });
  },

  closeChat() {
    this._currentFriend = null;
    document.getElementById('page-chat').classList.remove('active');
    document.getElementById('page-community').classList.add('active');
    document.querySelector('.bottom-nav').style.display = '';
  },

  /* ========== 工具函数 ========== */
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  _timeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now - date) / 1000;

    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 604800) return Math.floor(diff / 86400) + '天前';
    return date.toLocaleDateString('zh-CN');
  },

  _formatTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
};
