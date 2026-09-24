# D04：Gemini Live 会话与页面

D04 将 D01 会话状态、D02 短期令牌/WebSocket 和 D03 浏览器音频层接入 /live 页面。首页开发环境有 Live 对话入口；现有单段录音练习仍保留。

## 使用与生命周期

1. 在 workbench/.env.local 配置 GOOGLE_API_KEY 或 GEMINI_API_KEY，运行 npm run dev，访问 http://127.0.0.1:4173/live。
2. 点击“进入 Live 对话”与“连接 Gemini Live”。连接成功后页面显示“已连接 · 麦克风关闭”。此时尚未采集声音。
3. 点击“开启麦克风”并允许本地站点访问麦克风。16 kHz PCM 同时进入 Gemini 和会话用户音轨；输入音量与转写随对话更新，24 kHz 的 Gemini 音频按顺序播放。
4. “暂停对话”停止麦克风、播放并保留当前 WebSocket；“继续说话”重新启动采集并续接同一会话的两条音轨。“停止当前语音”立即清掉本地播放队列，并丢弃这轮后续音频，直到模型结束或被打断。用户说话触发的供应商 interrupted 事件也会清队列。
5. “结束对话”先刷新麦克风尾块，再关闭 WebSocket、释放音频资源。离开页面也会清理连接和音频。

意外断线时，如果 Gemini 已给出恢复句柄且令牌未过期，页面自动尝试恢复上下文；恢复后麦克风保持关闭，用户点击继续说话。没有句柄或恢复失败时，页面明确提示重新建立会话。重新建立会话会保留本页已有文字供查看，但不会把旧文字自动提交给新 Gemini 会话。

Gemini 的最终输入转写按用户行显示；输出转写按当前 AI 回应拼接，打断的行标记为已打断。用户音轨范围只是根据转写到达时的帧位置估计，不能直接当作经过核实的声音证据。D07/D08 将从真实用户 PCM、VAD 和转写对齐重算证据边界。

## 本地访问边界

/api/live/token 只在 development 且请求为本地回环主机、同端口同协议的本地 Origin 时签发短期受约束令牌。localhost 与 127.0.0.1 视为等价回环源。服务端本地身份接入点为 local-dev，并以进程内配额限制每小时 12 次令牌签发；超过返回 429 与 Retry-After。生产构建的令牌端点返回 403，生产 /live 页面只显示未开放说明。开发 CSP 仅额外允许 wss://generativelanguage.googleapis.com；生产 CSP 保持原限制。

这不是外部试用的身份和持久化配额。D06 必须替换 lib/live/live-access.ts 的本地策略，增加真实用户身份、持久化配额与归属控制，才能开放生产 Live。

## 验收

自动化测试覆盖连接与音频生命周期、转写更新、打断后旧音频抑制、断线句柄恢复、无句柄重新开始、Origin/配额/生产拒绝，以及麦克风权限悬而未决时结束会话。执行 npm test、npm run lint、npm run typecheck、npm run build。2026-09-23 在本地浏览器完成真实 Gemini 无音频握手并看到“已连接 · 麦克风关闭”；独立生产进程实测令牌端点返回 403，生产 CSP 未开放 Gemini WebSocket。真人麦克风和可听回复由使用者自行测试，目前不标记为通过。

真人验收建议按顺序检查：连续说两至三轮英语，确认用户字幕、AI 字幕与声音对应；在 AI 说话时插话，确认旧音频停止且不会补播；暂停时检查浏览器麦克风指示灯关闭，继续后再说一轮；结束后确认麦克风关闭。另测拒绝权限、断网和浏览器返回首页。当前没有独立声学分析或证据卡，不能把供应商转写当作发音诊断。

协议依据：[Gemini Live 会话恢复](https://ai.google.dev/gemini-api/docs/live-api/session-management)、[转写事件语义](https://ai.google.dev/api/live)、[短期令牌](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)。
