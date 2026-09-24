# D01/D02：会话契约与 Gemini Live 接入

更新日期：2026-09-23。Gemini Live 已确定为 Live 供应商；本阶段实现接入基础，尚未实现浏览器麦克风采集与播放界面。

D01：
- lib/session/contracts.ts 定义会话、音频资产、轮次、声学证据、练习目标、重说与分析作业契约。音频范围统一采用资产内采样帧的半开区间，并记录资产在会话时钟上的起点。
- lib/session/reducer.ts 使用事件 ID 去重；校验轮次与音轨归属；转写版本更新会撤回旧证据并清空相应练习比较。目标只能绑定已核实的匹配证据；重要原意未保留时不能判目标改善。
- 当前纯内存状态供 D03/D07 接入。持久化、音频切片与声学测量还未实现。

D02：
- 固定使用 Gemini Live，默认模型 gemini-3.8-live。GEMINI_LIVE_MODEL 可单独配置，避免改变现有录音分析的 GEMINI_MODEL。
- lib/live/gemini-token.ts 在服务端调用 v1beta/auth_tokens，签发一次使用、短期生效的令牌，并锁定 Live 模型、音频输出与转写配置。永久密钥不返回浏览器。
- app/api/live/token/route.ts 提供本地开发用令牌端点。仅在 development 且本地主机名下工作，并检查同源 Origin。公开部署前必须增加用户身份、配额与收费调用限制。
- lib/live/gemini-live.ts 使用浏览器原生 WebSocket 直连受约束端点；发送 Live setup 和 PCM16 单声道 16 kHz 音频；将转写、音频、打断和轮次结束分为不同事件。二进制 JSON 帧按顺序解码。D03 将负责实际麦克风音频转码、发送节奏与 AI 音频播放。
- 令牌超时后需重新申请。已预留会话恢复句柄事件，但自动恢复属于 D03/D04。

生产安全检查：启动生产构建后，POST /api/live/token 返回 403。

真实验证：使用本机配置的 Gemini 密钥，只创建短期令牌并连接 WebSocket，没有发送语音。2026-09-23 收到 setupComplete，就绪后主动关闭连接。没有验证连续通话、音质、延迟、音频证据或诊断准确性。第一次调用的令牌指南示例与接口不符：liveConnectConstraints 被拒绝；当前有效的 REST 请求使用顶层 bidiGenerateContentSetup，客户端连接 BidiGenerateContentConstrained。二进制帧解析也由这次真实握手发现并修正。

官方依据：
- https://ai.google.dev/api/live
- https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket
- https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens

下一步集成：D03 将同一份用户 PCM 音轨同时送往 Gemini Live 与会话音频资产缓存；D07 从缓存分析真实语音，证据绑定轮次与采样范围。届时重新测量抢话、打断、延迟及成本。
