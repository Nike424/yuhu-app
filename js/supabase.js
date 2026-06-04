/* ═══════════════════════════════════════════
   愈见 YuJian — Supabase 客户端封装
   ═══════════════════════════════════════════ */

// 配置区 - 已替换为你的 Supabase 项目信息
const SUPABASE_CONFIG = {
  url: 'https://ncwrllypinhiexirehii.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5jd3JsbHlwaW5oaWV4aXJlaGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1NDQyMDgsImV4cCI6MjA5NjEyMDIwOH0.YzZgUJsChmUR7SOSQCvCzXtsKy5glfSdUwwYEaAB9Vg'
};

// Supabase 客户端封装（使用全局变量，因为通过CDN引入）
const SB = {
  _client: null,

  // 初始化客户端
  init() {
    if (typeof supabase === 'undefined') {
      console.error('Supabase SDK 未加载');
      return false;
    }
    this._client = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
    return true;
  },

  // 获取客户端
  get client() {
    if (!this._client) {
      this.init();
    }
    return this._client;
  },

  /* ========== Auth 相关 ========== */
  auth: {
    // 邮箱+密码注册
    async signUp(email, password, name) {
      const { data, error } = await SB.client.auth.signUp({
        email,
        password,
        options: {
          data: { name: name || email.split('@')[0] }
        }
      });
      if (error) return { error };

      // 创建用户资料
      if (data.user) {
        await SB.db.upsert('users', {
          id: data.user.id,
          email,
          name: name || email.split('@')[0],
          avatar_url: null
        });
      }
      return { data };
    },

    // 邮箱+密码登录
    async signIn(email, password) {
      const { data, error } = await SB.client.auth.signInWithPassword({
        email,
        password
      });
      return { data, error };
    },

    // 手机号+验证码登录（需要配置Twilio或付费）
    async signInWithPhone(phone) {
      const { data, error } = await SB.client.auth.signInWithOtp({
        phone,
        options: { channel: 'sms' }
      });
      return { data, error };
    },

    // 验证手机验证码
    async verifyPhoneOtp(phone, token) {
      const { data, error } = await SB.client.auth.verifyOtp({
        phone,
        token,
        type: 'sms'
      });
      return { data, error };
    },

    // 获取当前用户
    async getUser() {
      const { data: { user }, error } = await SB.client.auth.getUser();
      return { user, error };
    },

    // 获取当前会话
    async getSession() {
      const { data: { session }, error } = await SB.client.auth.getSession();
      return { session, error };
    },

    // 登出
    async signOut() {
      const { error } = await SB.client.auth.signOut();
      return { error };
    },

    // 监听认证状态
    onAuthStateChange(callback) {
      return SB.client.auth.onAuthStateChange(callback);
    },

    // 更新用户资料
    async updateProfile(updates) {
      const { user } = await this.getUser();
      if (!user) return { error: new Error('未登录') };

      const { data, error } = await SB.client
        .from('users')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      return { data, error };
    }
  },

  /* ========== 数据库操作 ========== */
  db: {
    // 查询
    async select(table, query = {}) {
      let q = SB.client.from(table).select('*');

      if (query.eq) {
        Object.entries(query.eq).forEach(([key, val]) => {
          q = q.eq(key, val);
        });
      }
      if (query.order) {
        q = q.order(query.order.column, { ascending: query.order.ascending ?? false });
      }
      if (query.limit) {
        q = q.limit(query.limit);
      }
      if (query.range) {
        q = q.range(query.range.from, query.range.to);
      }

      const { data, error } = await q;
      return { data, error };
    },

    // 插入
    async insert(table, values) {
      const { data, error } = await SB.client
        .from(table)
        .insert(values)
        .select()
        .single();
      return { data, error };
    },

    // 更新
    async update(table, id, values) {
      const { data, error } = await SB.client
        .from(table)
        .update(values)
        .eq('id', id)
        .select()
        .single();
      return { data, error };
    },

    // Upsert（插入或更新）
    async upsert(table, values) {
      const { data, error } = await SB.client
        .from(table)
        .upsert(values)
        .select()
        .single();
      return { data, error };
    },

    // 删除
    async delete(table, id) {
      const { error } = await SB.client
        .from(table)
        .delete()
        .eq('id', id);
      return { error };
    },

    // 自定义查询
    query(table) {
      return SB.client.from(table);
    },

    // RPC调用（存储过程）
    async rpc(fn, params) {
      const { data, error } = await SB.client.rpc(fn, params);
      return { data, error };
    }
  },

  /* ========== 存储 ========== */
  storage: {
    // 上传图片
    async uploadImage(file, bucket = 'posts') {
      const { user } = await SB.auth.getUser();
      if (!user) return { error: new Error('未登录') };

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { data, error } = await SB.client.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) return { error };

      // 获取公开URL
      const { data: { publicUrl } } = SB.client.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return { data: { path: data.path, publicUrl } };
    },

    // 删除图片
    async deleteImage(path, bucket = 'posts') {
      const { error } = await SB.client.storage
        .from(bucket)
        .remove([path]);
      return { error };
    }
  },

  /* ========== 实时订阅 ========== */
  realtime: {
    // 订阅帖子更新
    subscribePosts(callback) {
      return SB.client
        .channel('posts-changes')
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'posts' },
          callback
        )
        .subscribe();
    },

    // 订阅聊天消息
    subscribeMessages(userId, callback) {
      return SB.client
        .channel('messages')
        .on('postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `to_user_id=eq.${userId}`
          },
          callback
        )
        .subscribe();
    },

    // 取消订阅
    unsubscribe(channel) {
      SB.client.removeChannel(channel);
    }
  }
};

// 全局初始化（页面加载时）
document.addEventListener('DOMContentLoaded', () => {
  if (typeof supabase !== 'undefined') {
    SB.init();
  }
});
