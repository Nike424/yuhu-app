/* ═══════════════════════════════════════════
   愈见 YuJian — Qwen3.7-Plus AI Integration (宠物版)
   ═══════════════════════════════════════════ */

const AI = {
  _apiKey: null,
  _baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
  _model: 'qwen3.7-plus',
  _defaultKey: 'sk-4c621251c13d48c181c7cceba54a573b',

  /* 宠物伤口护理助手 Prompt */
  SYSTEM_PROMPT: `你是"愈见AI"（YuJian AI），愈见宠物智能伤口护理系统的专业AI助手。你专精于宠物（犬、猫为主，兼顾兔、仓鼠等小型宠物）的伤口评估与护理指导。

【核心能力】
1. 伤口评估：根据位置、大小、深度、颜色、渗出物、气味、周围毛发皮肤状态给出专业判断
2. 感染识别：综合pH值（正常6.5-7.8）、尿酸浓度（150-416μM）、局部温度判断感染阶段
3. 护理方案：提供清洁→消毒→敷料→包扎→防舔咬的分步指导
4. 风险分级：🟢可居家护理 → 🟡建议咨询兽医 → 🔴立即就医
5. 品种差异：犬猫伤口愈合特点不同（猫易形成脓肿，犬易肉芽增生）

【宠物伤口特殊注意事项】
- 宠物会用舌头舔伤口，必须建议佩戴伊丽莎白圈
- 爪部伤口需限制活动，保持敷料干燥
- 多宠家庭需隔离受伤宠物，防止互舔
- 猫对某些消毒剂敏感（禁用含酚类产品）
- 小型宠物代谢快，用药剂量需精确

【回答格式要求】
- 先给结论（1-2句话），再分点展开
- 每次回答200字以内
- 风险判断标注🟢🟡🔴等级
- 就医建议加粗强调

【安全红线——以下情况必须明确建议立即就医】
- 伤口深度超过皮肤全层、可见肌肉或骨骼
- 持续性出血按压10分钟不止
- 大面积组织坏死、发黑、恶臭
- 宠物精神萎靡、拒食、发热（>39.5℃）
- 咬伤（猫狗互咬、野生动物咬伤，需评估狂犬病风险）
- 猫的抓咬伤（巴斯德菌感染风险高）
- 蛇咬伤、毒虫蜇伤

【交互原则】
- 优先询问宠物种类、体重、伤口原因和时间
- 信息不足时追问关键信息再做判断
- 每轮结尾附："⚠️ AI建议仅供参考，不能替代兽医诊断。如情况严重请立即就医。"
- 语气温暖专业，像一位有经验的宠物医生`,

  /* 拍照诊断 Prompt（宠物版） */
  DIAGNOSIS_PROMPT: `你是宠物伤口护理专家，请分析这张宠物伤口照片。仅返回JSON格式（不要markdown代码块）：

{
  "species_guess": "犬/猫/兔/仓鼠/鸟/其他",
  "type": "擦伤|割伤|咬伤|抓伤|烧伤|手术切口|皮肤溃疡|趾间炎|其他",
  "size_category": "小(<1cm)|中(1-3cm)|大(>3cm)",
  "color": "描述伤口及周围组织颜色",
  "exudate": "无|浆液性|脓性|血性|混合性，描述量和性状",
  "infection_signs": "描述红肿热痛、脓液、坏死、异味、周围脱毛等",
  "severity": "轻微|中等|严重|紧急",
  "risk_level": "🟢可居家护理|🟡建议咨询兽医|🔴需立即就医",
  "need_hospital": true或false,
  "hospital_reason": "就医原因",
  "care_plan": ["步骤1：剃除周围毛发+清洁", "步骤2：消毒+敷料", "步骤3：包扎+防舔咬"],
  "recommended_dressing": "推荐敷料类型",
  "e_collar_needed": true或false,
  "follow_up": "建议复查时间"
}

要求：
- 关注宠物特有体征（毛发遮挡、舔舐痕迹、爪部损伤）
- 猫的伤口特别注意脓肿风险
- 图片模糊或非宠物伤口时type设为"无法识别"`,

  async init() {
    // 强制使用 Qwen3.7-Plus，清除旧的 deepseek 配置
    this._apiKey = this._defaultKey;

    const savedKey = await DB.getSetting('deepseek_api_key');
    const savedUrl = await DB.getSetting('api_url');
    const savedModel = await DB.getSetting('model');

    // 清除旧配置（只清一次）
    if (savedUrl?.includes('deepseek')) await DB.saveSetting('api_url', '');
    if (savedModel?.includes('deepseek')) await DB.saveSetting('model', '');
    if (savedKey?.includes('468c27c49eba')) await DB.saveSetting('deepseek_api_key', '');

    await DB.saveSetting('api_url', this._baseURL);
    await DB.saveSetting('model', this._model);
  },

  setApiKey(key) { this._apiKey = key; },

  async chat(messages, opts = {}) {
    if (!this._apiKey) this._apiKey = this._defaultKey;
    if (!this._apiKey) throw new Error('API Key未配置，请在设置中配置。');

    const body = {
      model: this._model,
      messages: [
        { role: 'system', content: opts.systemPrompt || this.SYSTEM_PROMPT },
        ...messages
      ],
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 1200,
      stream: false
    };

    const res = await fetch(this._baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('API Key无效，请检查设置');
      if (res.status === 429) throw new Error('请求过于频繁，请稍后再试');
      throw new Error(err.error?.message || err.message || `请求失败 (${res.status})`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '无法获取回复';
  },

  async woundChat(userMsg, ctx = {}) {
    let prefix = '';
    if (ctx.ph || ctx.uricAcid || ctx.temperature) {
      prefix = '[当前监测数据] ';
      if (ctx.ph) prefix += `pH=${ctx.ph} `;
      if (ctx.uricAcid) prefix += `尿酸=${ctx.uricAcid}μM `;
      if (ctx.temperature) prefix += `温度=${ctx.temperature}℃ `;
      prefix += '\n';
    }
    if (ctx.woundType) prefix += `[伤口信息] 类型:${Utils.typeText(ctx.woundType)} 位置:${Utils.locationText(ctx.woundLocation || '')}\n`;
    if (ctx.species) prefix += `[宠物信息] 品种:${Utils.speciesText(ctx.species)}\n`;
    return this.chat([{ role: 'user', content: prefix + userMsg }]);
  },

  async diagnoseImage(base64) {
    return this.diagnoseMultiImage([base64], '请分析这张宠物伤口照片');
  },

  async diagnoseMultiImage(base64Array, textPrompt = '请分析这些宠物伤口照片') {
    if (!this._apiKey) this._apiKey = this._defaultKey;

    const content = [];
    for (const b64 of base64Array) {
      content.push({ type: 'image_url', image_url: { url: b64 } });
    }
    content.push({ type: 'text', text: textPrompt });

    const body = {
      model: this._model,
      messages: [
        { role: 'system', content: this.DIAGNOSIS_PROMPT },
        { role: 'user', content }
      ],
      temperature: 0.3,
      max_tokens: 1000
    };

    const res = await fetch(this._baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this._apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || err.message || `诊断失败 (${res.status})`);
    }

    const data = await res.json();
    const content2 = data.choices?.[0]?.message?.content || '';
    try {
      const m = content2.match(/\{[\s\S]*\}/);
      return m ? JSON.parse(m[0]) : { raw: content2 };
    } catch {
      return { raw: content2 };
    }
  },

  async interpretReport(records) {
    const summary = records.map(r =>
      `[${Utils.formatDate(r.date)}] pH=${r.ph} UA=${r.uricAcid}μM`
    ).join('\n');
    return this.chat([{
      role: 'user',
      content: `请分析以下宠物伤口监测数据趋势并给出护理建议：\n${summary}`
    }], {
      systemPrompt: '你是宠物伤口数据分析专家。从趋势变化、异常指标、愈合速度三个维度分析，给出3条以内可操作的护理优化建议。',
      maxTokens: 600
    });
  }
};
