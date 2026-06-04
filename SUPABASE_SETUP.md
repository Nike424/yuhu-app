# 愈见App - Supabase 配置指南

## 1. 注册 Supabase

1. 打开 [supabase.com](https://supabase.com)
2. 点击 **Start your project**
3. 使用 GitHub 账号登录（或注册新账号）

## 2. 创建项目

1. 点击 **New Project**
2. 填写项目信息：
   - Name: `yujian`（或其他名称）
   - Database Password: 设置一个安全的密码（记住它）
   - Region: 选择离你最近的区域（如 `Northeast Asia (Tokyo)`）
3. 点击 **Create new project**
4. 等待项目创建完成（约1-2分钟）

## 3. 创建数据表

1. 在项目面板左侧点击 **SQL Editor**
2. 点击 **New query**
3. 复制以下SQL并粘贴，点击 **Run**：

```sql
-- 用户表
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 帖子表
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  images TEXT[],
  category TEXT DEFAULT 'general',
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 点赞表
CREATE TABLE likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- 评论表
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 好友关系表
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_user_id, to_user_id)
);

-- 聊天消息表
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_likes_user_id ON likes(user_id);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_friendships_from ON friendships(from_user_id);
CREATE INDEX idx_friendships_to ON friendships(to_user_id);
CREATE INDEX idx_messages_from ON messages(from_user_id);
CREATE INDEX idx_messages_to ON messages(to_user_id);
```

## 4. 配置 RLS（行级安全）策略

在 SQL Editor 中继续执行：

```sql
-- 启用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 公开读取策略
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Public read posts" ON posts FOR SELECT USING (true);
CREATE POLICY "Public read likes" ON likes FOR SELECT USING (true);
CREATE POLICY "Public read comments" ON comments FOR SELECT USING (true);
CREATE POLICY "Public read friendships" ON friendships FOR SELECT USING (true);

-- 消息只能查看自己相关的
CREATE POLICY "Read own messages" ON messages FOR SELECT USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);

-- 写入策略
CREATE POLICY "Insert own posts" ON posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Insert own likes" ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Insert own comments" ON comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Insert own friendships" ON friendships FOR INSERT WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "Insert own messages" ON messages FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- 更新策略（仅自己的数据）
CREATE POLICY "Update own posts" ON posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Update own profile" ON users FOR UPDATE USING (auth.uid() = id);

-- 删除策略
CREATE POLICY "Delete own posts" ON posts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Delete own likes" ON likes FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Delete own comments" ON comments FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Delete own friendships" ON friendships FOR DELETE USING (
  auth.uid() = from_user_id OR auth.uid() = to_user_id
);
```

## 5. 创建 Storage Bucket（用于图片上传）

1. 在左侧面板点击 **Storage**
2. 点击 **New bucket**
3. 名称填 `posts`
4. 选择 **Public bucket**（这样图片可以被公开访问）
5. 点击 **Create bucket**

然后在 **Policies** 中添加策略：

```sql
-- 允许登录用户上传文件
CREATE POLICY "Allow upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'posts' AND auth.role() = 'authenticated');

-- 允许公开读取
CREATE POLICY "Allow public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'posts');

-- 允许删除自己的文件
CREATE POLICY "Allow delete own" ON storage.objects
  FOR DELETE USING (bucket_id = 'posts' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## 6. 配置认证方式

### 邮箱+密码（推荐用于测试）

1. 左侧面板 → **Authentication** → **Providers**
2. 确保 **Email** 已启用
3. 关闭 **Confirm email**（开发阶段可以关闭，生产环境建议开启）

### 手机号+验证码（需要付费或配置Twilio）

Supabase 免费版不支持短信发送。如需手机号登录：
1. 注册 [Twilio](https://www.twilio.com) 账号
2. 在 Supabase → Authentication → Providers → Phone 中配置 Twilio 凭据

**开发替代方案**：可以在 `supabase.js` 中使用演示模式，跳过真实短信验证。

## 7. 获取项目凭据

1. 左侧面板 → **Settings** → **API**
2. 复制以下两个值：
   - **Project URL**: 形如 `https://xxxxx.supabase.co`
   - **anon public key**: 一长串字符串

## 8. 配置到项目中

打开 `app/js/supabase.js`，修改以下两行：

```javascript
const SUPABASE_CONFIG = {
  url: 'https://xxxxx.supabase.co',           // 替换为你的 Project URL
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...' // 替换为你的 anon key
};
```

## 9. 重新部署

把更新后的 `app/` 文件夹重新部署到 Netlify：

1. 打开 [app.netlify.com](https://app.netlify.com)
2. 进入你的站点
3. 拖拽上传更新后的文件

## 10. 测试流程

1. 手机打开你的 Netlify 地址
2. 注册新账号（邮箱+密码）
3. 进入社区，发布第一条帖子
4. 添加好友、聊天

---

## 常见问题

### Q: 注册时提示 "User already registered"
A: 该邮箱已注册，直接登录即可。

### Q: 发帖时提示权限错误
A: 检查 RLS 策略是否正确配置。

### Q: 图片上传失败
A: 检查 Storage bucket 是否创建，且策略是否正确。

### Q: 实时聊天收不到消息
A: 检查 Supabase 是否启用了 Realtime：Settings → Database → Replication → 开启 posts 和 messages 表的 Realtime。

---

## Supabase 免费额度

- 500MB 数据库
- 1GB 文件存储
- 50,000 月活用户
- 500MB/月 带宽

对于演示和小规模使用完全够用。
