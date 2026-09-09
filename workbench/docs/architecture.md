# 共评工作台架构

更新日期：2026-09-09

## 目标

工作台不是普通口语评分器，而是一个研究工具：把同一段录音上的 Scribe 转写、Gemini Coach、真人标注和 Gemini A/B Judge 放到同一份可导出记录中，找出它们的一致与分歧。

## 数据流

```text
浏览器：快速体验（仅录音）或研究模式（三项声明）+ 录音/上传
  │
  ├─ POST /api/analyze
  │    ├─ ElevenLabs Scribe v2 → 转写 + 词级时间戳
  │    └─ Gemini Coach ← 原始音频 + 转写 + 意图
  │         └─ 质量门控 + 0–3 个结构化候选
  │
  ├─ POST /api/tts（用户按需触发）
  │    └─ ElevenLabs Flash v2.5 → 短参考音频
  │
  └─ POST /api/judge
       ├─ ElevenLabs Scribe v2 → 重说版转写
       └─ Gemini Judge ← 随机顺序的原版/重说版 + 意图
            └─ 更清楚 / 无明显变化 / 无法判断

浏览器：研究模式记录真人复述；两种模式均支持候选标注 + JSON 导出
```

## 信任边界

### 浏览器

- 保留当前会话的 `Blob` 和播放用 Object URL；
- 把音频编码为 base64，仅用于同源 API 请求；
- 不接收 Gemini 或 ElevenLabs 密钥；
- 导出结果只包含文本、结构化判断、模型版本和音频元数据，不包含音频字节。

### 本地 Next.js 服务端

- Route Handlers 从 `.env.local` 读取密钥；
- 按模式校验意图字段：快速体验允许零声明，研究模式要求进展、阻塞和请求；
- 校验 MIME、base64、大小和供应商输出；
- 只在当前请求内存中持有音频 Buffer；
- 不写音频、转写或供应商响应到文件；
- 使用同源策略、CSP、`X-Frame-Options` 和 `Permissions-Policy`；
- 对浏览器隐藏供应商原始错误详情。

## 代码边界

- `app/page.tsx` 保持为轻量 Server Component，只挂载工作台；
- `components/workbench/` 负责界面和用户交互，不接触密钥；
- `hooks/useAudioCapture.ts` 独立管理录音、MediaStream、计时器与 Object URL 生命周期；
- `app/api/**/route.ts` 只做请求编排，校验和供应商协议分别放在 `lib/schemas.ts`、`lib/providers.ts`；
- `lib/types.ts` 是浏览器与服务端共享的领域契约。

### 外部供应商

- ElevenLabs 获取音频用于 STT 或按需 TTS；
- Gemini 获取音频、转写和当前模式下的可选或结构化意图用于 Coach/Judge；
- 数据处理和实际保留仍受所选账户、地区、合同与供应商设置约束；“工作台不落盘”不等于供应商 Zero Retention。

## 端点

| 端点 | 方法 | 作用 | 外部调用 |
|---|---|---|---|
| `/api/config` | GET | 返回布尔配置状态、模型和限制，不返回密钥 | 无 |
| `/api/demo` | GET | 返回不含真实音频的演示会话 | 无 |
| `/api/analyze` | POST | 转写并生成 Coach 候选 | ElevenLabs STT + Gemini |
| `/api/tts` | POST | 为已选建议生成参考音频 | ElevenLabs TTS |
| `/api/judge` | POST | 转写重说版并随机 A/B 盲评 | ElevenLabs STT + Gemini |

## 模型隔离

- Coach prompt：`coach-v1.3.0`；
- Judge prompt：`judge-v1.1.0`；
- 两者使用不同上下文和 JSON Schema；
- Judge 在服务端随机交换 A/B，浏览器只看到映射后的结果；
- 导出文件保留原版的隐藏标签和 raw decision，便于复现实验；
- 即使两个角色使用同一 Gemini 模型，真人结果仍是有效性基准。

## 结构化契约

供应商 JSON 在进入 UI 前必须通过运行时校验。Coach 每个候选至少包含：

- 起止时间；
- 摩擦类别和意图槽；
- 原始片段、听者影响与建议表达；
- `audio/text/timing/context/asr_disagreement` 中至少一个证据来源；
- `high` 或 `medium` 证据等级；
- 是否只是可选风格。

低证据候选和非法结构不会直接显示给评测者。

## 当前限制

- 本地单用户，无鉴权和持久数据库；
- 不保存评测历史，需主动导出 JSON；
- 已在浏览器裁切原始片段用于 A/B；片段边界仍依赖 Coach 和转写时间信息；
- 浏览器 MediaRecorder 的容器格式因平台而异；
- base64 会增加约三分之一请求体积，因此限制比 Gemini 官方内联上限更保守；
- 未接入独立真人听者招募和盲测分发；
- 快速体验没有预先声明的 ground truth，只能用于检查摩擦候选和相对费力度，不能计算意图复述率；
- 未部署公网。公网使用前必须增加身份验证、服务端存储策略、删除任务、速率限制和供应商数据处理评审。

## Coach v1.3 与参考音频时间戳

Coach 固定规则通过 Gemini systemInstruction 传入，意图和带 logprob 的词时间线作为独立 JSON 数据。新版候选必须包含 observation（具体观察）和 practice_cue（单一练习动作）；旧记录中这两个字段可缺省。运行时拒绝非布尔质量标记和零长度片段，并隐藏不可用音频或纯风格候选。保留事实、数字和否定的规则已加入 prompt，但仍需真人样本核验，不能视为程序化语义保证。

TTS 使用 `/text-to-speech/{voice_id}/with-timestamps`，返回 `{ mimeType, base64, words, characterCost }`。优先使用 normalized_alignment，与实际读出的数字等展开文本一致；其次使用 alignment。缺失或非法对齐降级为完整音频播放，不发起第二次付费生成。播放器支持同步词高亮、单词回听及 0.8× 慢速；同一已挂载卡片不会重复生成，离开卡片后不承诺缓存。

新增测试涵盖指令与用户证据隔离、未知 ASR logprob、练习字段校验、词对齐及音频响应异常。此轮未更改 Judge 判定流程，未进行真实供应商音质或学习效果评测。
