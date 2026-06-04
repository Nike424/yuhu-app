/* ═══════════════════════════════════════════
   愈见 YuJian — 社区逻辑
   ═══════════════════════════════════════════ */

const Community = {
  _posts: [],
  _currentCategory: 'all',
  _currentPage: 0,
  _pageSize: 20,
  _loading: false,
  _hasMore: true,
  _imageFiles: [],
  _selectedCategory: 'general',

  /* ========== 初始化 ========== */
  async init() {
    await this.loadPosts();
    this._bindEvents();
  },

  _bindEvents() {
    // 分类切换
    document.querySelectorAll('.community-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        document.querySelectorAll('.community-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        this._currentCategory = e.target.dataset.category;
        this._currentPage = 0;
        this._hasMore = true;
        this.loadPosts();
      });
    });
  },

  /* ========== 加载帖子 ========== */
  async loadPosts(append = false) {
    if (this._loading || !this._hasMore) return;
    this._loading = true;

    const listEl = document.getElementById('post-list');
    if (!append) {
      listEl.innerHTML = '<div class="loading-spinner"></div>';
    }

    try {
      let query = SB.db.query('posts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(this._currentPage * this._pageSize, (this._currentPage + 1) * this._pageSize - 1);

      if (this._currentCategory !== 'all') {
        query = query.eq('category', this._currentCategory);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data.length < this._pageSize) {
        this._hasMore = false;
      }

      const posts = append ? [...this._posts, ...data] : (data || []);

      // 并行加载用户信息、点赞数、评论数
      const enriched = await Promise.all(posts.map(async (post) => {
        const result = { ...post, likes: [], comments: [] };

        try {
          const { data: users } = await SB.db.query('users')
            .select('id, name, avatar_url')
            .eq('id', post.user_id)
            .limit(1);
          result.users = users?.[0] || { name: '匿名用户', avatar_url: null };
        } catch {
          result.users = { name: '匿名用户', avatar_url: null };
        }

        try {
          const { data: likesData } = await SB.db.query('likes')
            .select('user_id')
            .eq('post_id', post.id);
          result.likes = likesData || [];
        } catch {}

        try {
          const { data: commentsData } = await SB.db.query('comments')
            .select('id')
            .eq('post_id', post.id);
          result.comments = commentsData || [];
        } catch {}

        return result;
      }));

      this._posts = enriched;
      this._renderPosts();
      this._currentPage++;
    } catch (err) {
      console.error('加载帖子失败:', err);
      listEl.innerHTML = `<div class="community-empty">
        <div class="community-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p class="community-empty-title">加载失败</p>
        <p class="community-empty-desc">${err.message}</p>
      </div>`;
    }

    this._loading = false;
  },

  /* ========== 渲染帖子列表 ========== */
  _renderPosts() {
    const listEl = document.getElementById('post-list');

    if (this._posts.length === 0) {
      listEl.innerHTML = `<div class="community-empty">
        <div class="community-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <p class="community-empty-title">还没有帖子</p>
        <p class="community-empty-desc">成为第一个分享的人吧</p>
      </div>`;
      return;
    }

    listEl.innerHTML = this._posts.map(post => this._renderPostCard(post)).join('');

    // 绑定帖子事件
    this._posts.forEach(post => {
      this._bindPostEvents(post);
    });
  },

  _renderPostCard(post) {
    const user = post.users || { name: '匿名用户', avatar_url: null };
    const likesCount = Array.isArray(post.likes) ? post.likes.length : (post.likes?.[0]?.count || 0);
    const commentsCount = Array.isArray(post.comments) ? post.comments.length : (post.comments?.[0]?.count || 0);
    const isLiked = post.likes?.some(l => l.user_id === this._currentUserId);

    const categoryLabels = {
      general: '日常',
      tips: '经验',
      question: '求助',
      showcase: '展示'
    };

    const imagesHtml = post.images?.length
      ? `<div class="post-images grid-${Math.min(post.images.length, 3)}">
          ${post.images.map(img => `<img src="${img}" alt="帖子图片" onclick="Community.previewImage('${img}')">`).join('')}
        </div>`
      : '';

    return `
      <div class="post-card" data-post-id="${post.id}">
        <div class="post-header">
          <div class="post-avatar">
            ${user.avatar_url
              ? `<img src="${user.avatar_url}" alt="">`
              : (user.name?.[0] || '?')}
          </div>
          <div class="post-user-info">
            <div class="post-username">${this._escapeHtml(user.name)}</div>
            <div class="post-time">${this._timeAgo(post.created_at)}</div>
          </div>
          <span class="post-category ${post.category}">${categoryLabels[post.category] || '日常'}</span>
        </div>
        <div class="post-content">${this._escapeHtml(post.content)}</div>
        ${imagesHtml}
        <div class="post-actions">
          <button class="post-action like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            <span class="like-count">${likesCount}</span>
          </button>
          <button class="post-action comment-btn" data-post-id="${post.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span>${commentsCount}</span>
          </button>
        </div>
      </div>
    `;
  },

  _bindPostEvents(post) {
    const card = document.querySelector(`[data-post-id="${post.id}"]`);
    if (!card) return;

    // 点赞
    const likeBtn = card.querySelector('.like-btn');
    likeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleLike(post.id);
    });

    // 评论（打开详情）
    const commentBtn = card.querySelector('.comment-btn');
    commentBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showPostDetail(post.id);
    });

    // 点击帖子卡片也打开详情
    card.addEventListener('click', () => {
      this.showPostDetail(post.id);
    });
  },

  /* ========== 点赞/取消点赞 ========== */
  async toggleLike(postId) {
    const { user } = await SB.auth.getUser();
    if (!user) {
      Utils.toast('请先登录', 'warning');
      return;
    }

    const btn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
    const countEl = btn?.querySelector('.like-count');
    const isLiked = btn?.classList.contains('liked');

    // 乐观更新
    if (isLiked) {
      btn.classList.remove('liked');
      countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
    } else {
      btn.classList.add('liked');
      countEl.textContent = parseInt(countEl.textContent) + 1;
    }

    try {
      if (isLiked) {
        // 取消点赞
        await SB.db.query('likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
      } else {
        // 点赞
        await SB.db.insert('likes', {
          post_id: postId,
          user_id: user.id
        });
      }
    } catch (err) {
      // 回滚
      if (isLiked) {
        btn.classList.add('liked');
        countEl.textContent = parseInt(countEl.textContent) + 1;
      } else {
        btn.classList.remove('liked');
        countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
      }
      Utils.toast('操作失败', 'error');
    }
  },

  /* ========== 发帖弹窗 ========== */
  showCreatePost() {
    this._imageFiles = [];
    this._selectedCategory = 'general';

    const modal = document.getElementById('post-modal');
    const textarea = modal.querySelector('.post-textarea');
    const imageArea = modal.querySelector('.image-upload-area');
    const categoryOptions = modal.querySelectorAll('.category-option');

    textarea.value = '';
    imageArea.innerHTML = `
      <div class="image-upload-btn" onclick="Community.addImage()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
    `;

    categoryOptions.forEach(opt => {
      opt.classList.toggle('active', opt.dataset.category === 'general');
      opt.onclick = () => {
        categoryOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        this._selectedCategory = opt.dataset.category;
      };
    });

    modal.classList.remove('hidden');
  },

  /* ========== 添加图片 ========== */
  addImage() {
    if (this._imageFiles.length >= 3) {
      Utils.toast('最多上传3张图片', 'warning');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) {
        Utils.toast('图片不能超过10MB', 'error');
        return;
      }
      this._imageFiles.push(file);
      this._renderImagePreviews();
    };
    input.click();
  },

  _renderImagePreviews() {
    const area = document.querySelector('#post-modal .image-upload-area');
    const previews = this._imageFiles.map((file, i) => {
      const url = URL.createObjectURL(file);
      return `
        <div class="image-preview">
          <img src="${url}" alt="">
          <button class="remove-btn" onclick="Community.removeImage(${i})">&times;</button>
        </div>
      `;
    }).join('');

    const uploadBtn = this._imageFiles.length < 3
      ? `<div class="image-upload-btn" onclick="Community.addImage()">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
        </div>`
      : '';

    area.innerHTML = previews + uploadBtn;
  },

  removeImage(index) {
    this._imageFiles.splice(index, 1);
    this._renderImagePreviews();
  },

  /* ========== 发布帖子 ========== */
  async submitPost() {
    const textarea = document.querySelector('#post-modal .post-textarea');
    const content = textarea.value.trim();

    if (!content && this._imageFiles.length === 0) {
      Utils.toast('请输入内容或上传图片', 'warning');
      return;
    }

    const { user } = await SB.auth.getUser();
    if (!user) {
      Utils.toast('请先登录', 'warning');
      return;
    }

    const submitBtn = document.querySelector('#post-modal .btn-primary');
    submitBtn.disabled = true;
    submitBtn.textContent = '发布中...';

    try {
      // 上传图片
      const imageUrls = [];
      for (const file of this._imageFiles) {
        const { data, error } = await SB.storage.uploadImage(file);
        if (error) throw error;
        imageUrls.push(data.publicUrl);
      }

      // 创建帖子
      const { data, error } = await SB.db.insert('posts', {
        user_id: user.id,
        content,
        images: imageUrls.length > 0 ? imageUrls : null,
        category: this._selectedCategory
      });

      if (error) throw error;

      Utils.toast('发布成功', 'success');
      document.getElementById('post-modal').classList.add('hidden');
      this._currentPage = 0;
      this._hasMore = true;
      await this.loadPosts();
    } catch (err) {
      console.error('发布失败:', err);
      Utils.toast('发布失败: ' + err.message, 'error');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = '发布';
  },

  /* ========== 帖子详情 ========== */
  async showPostDetail(postId) {
    const post = this._posts.find(p => p.id === postId);
    if (!post) return;

    const modal = document.getElementById('post-detail-modal');
    const contentEl = modal.querySelector('.post-detail-content');
    const commentsEl = modal.querySelector('.comment-list');

    // 渲染帖子内容
    const user = post.users || { name: '匿名用户', avatar_url: null };
    contentEl.innerHTML = this._renderPostCard(post);

    // 加载评论
    await this._loadComments(postId, commentsEl);

    // 绑定评论发送
    const sendBtn = modal.querySelector('.comment-send');
    const input = modal.querySelector('.comment-input');
    sendBtn.onclick = () => this._submitComment(postId, input.value, commentsEl);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._submitComment(postId, input.value, commentsEl);
      }
    };

    modal.classList.remove('hidden');
  },

  async _loadComments(postId, container) {
    container.innerHTML = '<div class="loading-spinner"></div>';

    try {
      // 先加载评论
      const { data: comments, error } = await SB.db.query('comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      if (!comments || comments.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:var(--ink-muted);font-size:13px;padding:20px">暂无评论</p>';
        return;
      }

      // 并行加载每条评论的用户信息
      const enrichedComments = await Promise.all(comments.map(async (comment) => {
        const result = { ...comment };
        try {
          const { data: users } = await SB.db.query('users')
            .select('id, name, avatar_url')
            .eq('id', comment.user_id)
            .limit(1);
          result.users = users?.[0] || { name: '匿名用户', avatar_url: null };
        } catch {
          result.users = { name: '匿名用户', avatar_url: null };
        }
        return result;
      }));

      container.innerHTML = enrichedComments.map(comment => {
        const user = comment.users || { name: '匿名用户', avatar_url: null };
        return `
          <div class="comment-item">
            <div class="comment-avatar">
              ${user.avatar_url
                ? `<img src="${user.avatar_url}" alt="">`
                : (user.name?.[0] || '?')}
            </div>
            <div class="comment-body">
              <div class="comment-username">${this._escapeHtml(user.name)}</div>
              <div class="comment-text">${this._escapeHtml(comment.content)}</div>
              <div class="comment-time">${this._timeAgo(comment.created_at)}</div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      container.innerHTML = '<p style="text-align:center;color:var(--rose);font-size:13px;padding:20px">加载评论失败</p>';
    }
  },

  async _submitComment(postId, content, container) {
    if (!content.trim()) return;

    const { user } = await SB.auth.getUser();
    if (!user) {
      Utils.toast('请先登录', 'warning');
      return;
    }

    try {
      const { error } = await SB.db.insert('comments', {
        post_id: postId,
        user_id: user.id,
        content: content.trim()
      });

      if (error) throw error;

      // 刷新评论列表
      const input = document.querySelector('#post-detail-modal .comment-input');
      input.value = '';
      await this._loadComments(postId, container);
      Utils.toast('评论成功', 'success');
    } catch (err) {
      Utils.toast('评论失败: ' + err.message, 'error');
    }
  },

  /* ========== 图片预览 ========== */
  previewImage(url) {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(0,0,0,0.9);
      z-index: 10000; display: flex; align-items: center; justify-content: center;
      cursor: pointer;
    `;
    overlay.innerHTML = `<img src="${url}" style="max-width: 95%; max-height: 95%; object-fit: contain;">`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  },

  /* ========== 加载更多 ========== */
  loadMore() {
    if (this._hasMore && !this._loading) {
      this.loadPosts(true);
    }
  },

  /* ========== 工具函数 ========== */
  _escapeHtml(text) {
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
  }
};
