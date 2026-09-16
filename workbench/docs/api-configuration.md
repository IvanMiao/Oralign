# Gemini API 与 ElevenLabs 配置

更新日期：2026-09-16

本工作台所有供应商请求都由本地 Node.js 服务端发出。API 密钥不会发送到浏览器。研究模式、真人标注、JSON 导出及重说 Judge 已删除。

## 1. 创建本地环境文件

在 `workbench` 目录运行：

```bash
cp .env.example .env.local
chmod 600 .env.local
```

Next.js 会在本地自动读取 `.env.local`；该文件已被 `.gitignore` 排除。不要把真实密钥写入 `.env.example`、客户端组件、截图或提示词。

## 2. 配置 Gemini API

### 创建和限制密钥

1. 在 [Google AI Studio 的 API Keys 页面](https://aistudio.google.com/app/apikey) 创建或选择一个项目。
2. 按当前 API Keys 页面指引创建与限制密钥，确认有权调用所配置模型。
3. 若录音涉及真实工作信息，使用绑定有效 billing 的项目，并确认组织的数据处理要求。Gemini Paid Services 的内容不用于改进 Google 产品；免费层和地区规则需要单独核对。
4. 给项目设置预算和告警。2026 年 3 月 2 日后开通的新账户不能用 Google Cloud Welcome / Free Trial credits 支付 Gemini API；其他 Cloud credits 也只有在明确适用时才能抵扣。Prepay 账户需要先建立正的预付余额。

额度类型、建议分配和单会话调用预算见 [credits 使用方案](./credit-plan.md)。

参考：[Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)、[Gemini 计费](https://ai.google.dev/gemini-api/docs/billing)、[数据保留说明](https://ai.google.dev/gemini-api/docs/zdr)。

### 写入 `.env.local`

推荐：

```dotenv
GOOGLE_API_KEY=你的密钥
GEMINI_MODEL=gemini-3.7-flash
```

也支持 `GEMINI_API_KEY`。如果两个变量都存在，工作台优先读取 `GOOGLE_API_KEY`。

### 独立验证密钥

先在当前 shell 临时设置变量，再运行：

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent" \
  -H "x-goog-api-key: $GOOGLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Return the word ready."}]}]}'
```

收到 `candidates` 即表示密钥、模型和配额基本可用。`401/403` 通常是密钥、API 限制或项目权限问题；`429` 表示速率或额度限制。

### 工作台如何调用 Gemini

- 接口：`generateContent`；
- 输入：文本 rubric、Scribe 转写、词级时间信息和小于请求上限的内联音频；
- Coach：`temperature: 0.1`，按 JSON Schema 返回质量门控和最多 8 条候选；PRD 的 3 条上限尚待收敛；
- 动作示范：同一 Gemini 配置用于规划目标动作及独立检查生成音频，不用于评判用户重说；
- 音频不使用 Gemini Files API，因此工作台没有需要额外删除的 Gemini 文件对象。

Gemini 官方建议总请求小于 20 MB 时可以使用内联音频；工作台默认限制单次上传音频为 12 MB，以预留 base64 和提示词开销。当前无 A/B 上传接口。参考：[音频理解](https://ai.google.dev/gemini-api/docs/audio)、[结构化输出](https://ai.google.dev/gemini-api/docs/structured-output)。

## 3. 配置 ElevenLabs

### 创建受限 API Key

1. 在 ElevenLabs Workspace 的 API Keys 页面创建新密钥。
2. 只开放工作台需要的 Speech-to-Text、Text-to-Speech 和读取 Voice 的权限。
3. 为密钥设置独立的 credit quota。若部署到固定出口 IP，再增加 IP allowlist。
4. 在 `Terms and privacy → Data use` 关闭 `Improve the models for everyone`。这只影响关闭后的新数据。
5. 不使用声音克隆；选择一个已有的清楚英语参考声音即可。

ElevenLabs 明确要求 API key 只能放在服务端，不能暴露在浏览器代码中。参考：[API Authentication](https://elevenlabs.io/docs/api-reference/authentication)、[数据使用设置](https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models)。

### 验证 API Key 和额度

```bash
curl "https://api.elevenlabs.io/v1/user/subscription" \
  -H "xi-api-key: $ELEVENLABS_API_KEY"
```

响应会包含当前 tier、用量和额度状态。参考：[Get user subscription](https://elevenlabs.io/docs/api-reference/user/subscription/get)。

### 选择 Voice ID

```bash
curl "https://api.elevenlabs.io/v2/voices?page_size=20&voice_type=default" \
  -H "xi-api-key: $ELEVENLABS_API_KEY"
```

从响应的 `voices[].voice_id` 选择一个声音。不要把某种声音描述成“标准英语”；练习期间保持同一个 Voice ID，帮助用户比较示范中的动作。

参考：[List voices](https://elevenlabs.io/docs/api-reference/voices/search)。

### 写入 `.env.local`

```dotenv
ELEVENLABS_API_KEY=你的密钥
ELEVENLABS_VOICE_ID=选择的_voice_id
ELEVENLABS_STT_MODEL=scribe_v2
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_ZERO_RETENTION=false
```

`ELEVENLABS_VOICE_ID` 只影响参考音频。没有 Voice ID 时，Scribe 转写和 Gemini 分析仍可工作，界面会把 TTS 标记为待配置。

### 动作示范配置与支持范围

无需新增密钥。`/api/tts` 同时需要 Gemini key、ElevenLabs key 和 Voice ID，流程为规划 → 生成 → 听生成音频检查。默认 `eleven_flash_v2_5` 支持指定短停顿、连续意群尝试及内容表达示范；不提供受控重音或音素级指导。

只有显式将 `ELEVENLABS_TTS_MODEL` 设置为 `eleven_v3` 时才尝试重音控制。模型权限、Voice ID 兼容性和实际生成效果需要在账户中确认，系统不会自动切换。所有输出都经过 AI 检查后才提供播放；该检查不代表真人验证。

检查不通过显示“暂时无法示范”，保留原音与动作提示。一次成功示范增加两次 Gemini 和一次 TTS；检查阶段失败不会自动重新生成。具体边界见 [动作示范说明](./action-reference.md)。

### Zero Retention

`ELEVENLABS_ZERO_RETENTION=true` 会给 STT 和 TTS 请求附加 `enable_logging=false`。只有已获准的 Enterprise 账户可以使用；普通账户请保持 `false`，否则请求可能失败。即使不开启 Zero Retention，也应关闭模型改进数据共享并只提交获得同意的用户本人音频。

参考：[ElevenLabs Zero Retention Mode](https://elevenlabs.io/docs/eleven-api/resources/zero-retention-mode)。

## 4. 启动并检查状态

```bash
npm run dev
```

打开 `http://127.0.0.1:4173`。页面可载入静态示例；配置状态通过下面的接口检查。

也可以检查不含秘密的状态接口：

```bash
curl "http://127.0.0.1:4173/api/config"
```

该接口只确认变量是否存在，不会向供应商发送请求。真正的权限、模型和额度会在第一次分析或生成参考音频时验证。

## 5. 常见错误

| 状态 / 错误 | 常见原因 | 处理方式 |
|---|---|---|
| `CONFIG_MISSING` | `.env.local` 缺少密钥或 Voice ID | 对照 `.env.example`，修改后重启服务 |
| Gemini `401/403` | 密钥失效、Standard Key 未限制、项目无权限 | 创建 Auth Key 或修正 API restriction |
| ElevenLabs `401/403` | 密钥错误、scope 或 IP allowlist 不允许 | 检查 key scope 和来源 IP |
| `429` | 额度、credit quota 或速率限制 | 查看供应商用量；等待或提高明确限额 |
| `AUDIO_TOO_LARGE` | 单段音频超过限制 | 压缩或缩短到 30–60 秒 |
| `INVALID_GEMINI_JSON` | 模型未遵守结构化契约 | 保留输入作为回归样本，检查模型与提示版本 |
| `unsupported_action` | 当前模型无法示范该动作 | 回听原音、继续按提示试说；不要把普通朗读当作精准示范 |
| `check_failed` / `check_unavailable` | 示范未通过声音检查或检查失败 | 不播放未检查音频；可明确重新生成 |

## 6. 密钥轮换与泄露处理

1. 在供应商控制台立即禁用泄露密钥；
2. 创建权限更小、额度更低的新密钥；
3. 更新本地 `.env.local` 并重启；
4. 检查供应商用量与账单；
5. 确认密钥未进入 Git 历史、日志或浏览器 Network 响应。

工作台的错误响应不会返回供应商原始错误详情或密钥；详细供应商错误只写到本地服务端终端。
