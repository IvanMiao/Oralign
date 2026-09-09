# Gemini 与 ElevenLabs credits 使用方案

更新日期：2026-09-06

## 结论

不要把 credits 平均摊给所有功能。优先花在“系统判断是否接近真人”这一未知风险上；参考语音只在用户主动选择一个建议后生成，避免把额度消耗在装饰性体验上。

## 先确认 credits 类型

### Gemini

在 Google AI Studio 的 Billing 页面确认 credits 属于哪一类：

- AI Studio 预付 credits：可直接用于 Gemini API；
- Google Cloud Welcome / Free Trial credits：2026 年 3 月 2 日后开通的新账户不能用于 Gemini API 或 AI Studio；
- 其他 promotional Cloud credits：只有标明适用于 Gemini API 的额度才可使用；Prepay 账户还需要先建立正的预付余额，符合条件的 Cloud credits 才会开始抵扣。

在 API Keys 页面确认所用项目显示为 `Paid`，再用配置文档中的最小 `generateContent` 请求做验证。不要只根据 Cloud Console 的总余额推断 Gemini API 可用额度。

参考：[Gemini API Billing](https://ai.google.dev/gemini-api/docs/billing)、[Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)。

### ElevenLabs

ElevenLabs API key 消耗所在 workspace 的 credits。给工作台创建独立的受限 key，并为该 key 设置 credit quota；这个 quota 是止损上限，不是额外赠送额度。

用 `/v1/user/subscription` 检查当前套餐、已用量和剩余额度。参考：[API Keys](https://elevenlabs.io/docs/overview/administration/workspaces/api-keys)、[Get user subscription](https://elevenlabs.io/docs/api-reference/user/subscription/get)。

## 推荐分配

以下比例针对首轮 50–100 条英语工作更新样本，先按比例而不是固定金额执行。

### Gemini credits

| 用途 | 建议占比 | 原因 |
|---|---:|---|
| Coach 候选与提示版本对照 | 60% | 首要验证“能否找到真人认可的摩擦” |
| 隔离上下文的 A/B Judge | 30% | 验证重说是否更清楚，并观察模型自我偏好 |
| 固定回归集与失败复现 | 10% | 每次改提示或模型后重跑相同样本 |

默认使用 `gemini-3.7-flash`。只有当 Flash 在真人标注样本上持续漏掉同一类高影响摩擦时，才用更强模型做小规模对照；同一批实验不要中途换模型。导出的 `versions` 字段会记录实际模型和提示版本。

### ElevenLabs credits

| 用途 | 建议占比 | 原因 |
|---|---:|---|
| Scribe v2 原版与重说版转写 | 80% | 转写和词级时间戳是所有分析的共同输入 |
| Flash v2.5 参考语音 | 15% | 仅为最终选中的建议按需生成 |
| 复测与异常样本储备 | 5% | 留给低音质、格式兼容和配额边界排查 |

不要为每个 Coach 候选自动生成 TTS，也不要用 Eleven v3 批量替代 Flash；研究阶段的目标是验证反馈，不是最大化声音质感。

## 单个会话的调用预算

| 用户动作 | ElevenLabs | Gemini |
|---|---:|---:|
| 载入演示 | 0 | 0 |
| 分析原始录音 | 1 次 STT | 1 次 Coach |
| 生成一个参考音频 | 1 次 TTS | 0 |
| 运行重说 A/B | 1 次 STT | 1 次 Judge |

一个完整会话的默认上限应是 `2 × STT + 1 × TTS + 2 × Gemini`。当前工作台不做供应商错误的自动重试，避免网络错误或 429 造成隐性重复扣费。

## 止损规则

- 原始录音最长 60 秒；重说最长 30 秒；A/B 两段音频合计不超过 12 MB；
- ElevenLabs key 设置独立 credit quota，只开 STT、TTS 和读取 Voice 权限；
- Gemini 项目设置预算告警，并在 AI Studio Dashboard 按日查看调用量；
- 参考音频由用户按需触发，默认只生成 Top-1 建议；
- 遇到 `429` 不自动循环重试，先检查额度和速率限制；
- 每完成 20 条样本就计算一次与真人评测的一致率，若没有改善趋势，暂停继续消耗 credits，先调整 rubric 或提示词。

## 首轮实验建议

1. 先用无密钥演示确认工作台流程和导出格式；
2. 取 10 条已有人类标注的录音做 smoke batch；
3. 固定模型、提示版本和 ElevenLabs Voice ID，完成 30 条 Coach 对照；
4. 只对真人确认的 Top-1 摩擦做重说与 A/B；
5. 比较 Coach precision、真人理解复述、A/B 改善率和 `cannot_judge` 比例；
6. 达到 Roadmap 的退出门槛后再扩大到 50–100 条，而不是因为还有 credits 就继续跑。
