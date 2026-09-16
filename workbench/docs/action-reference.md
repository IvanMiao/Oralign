# 针对练习动作的声音示范

更新日期：2026-09-16。实现说明，不代表真实样本准确性或学习效果已经验证。

## 为什么修改

原接口只朗读 `suggested_version`，没有收到练习动作，也不检查声音是否呈现目标。现在每次生成都绑定一条建议，且失败时不以普通朗读替代成功示范。

## 请求与响应

`POST /api/tts` 输入：

```json
{
  "locale": "zh",
  "target": {
    "id": "friction-1",
    "focus": "pause",
    "original_excerpt": "I need your approval before Friday.",
    "suggested_version": "I need your approval before Friday.",
    "observation": "请求与时间条件挤在一起。",
    "listener_effect": "听者可能不容易抓住截止时间。",
    "practice_cue": "在 approval 后稍停，再说截止时间。"
  }
}
```

这是接口示例，不是对某条真实录音的诊断。字段必须为有长度限制的非空字符串，`focus` 为 pronunciation/pause/wording/organization。目标文本拒绝尖括号和方括号控制标记；缺少具体动作不发起普通 TTS 兜底。

- `ready`：`targetId`、`kind`、`text`、`expectedChange`、`verification: model_checked`、`speech: {mimeType, base64, words}`、`versions`。
- `unavailable`：`targetId`、`reason`、`versions`，无音频。
- `reason` 为 `unsupported_action`、`check_failed` 或 `check_unavailable`。
- 配置、输入、规划或 TTS 请求错误使用正常 API 错误响应。检查服务失败返回 `check_unavailable`，不能发布未经检查的生成音频。
- `versions` 记录 planner/check 提示版本、Gemini 与 TTS 模型。不存在真人验证标签。

## 操作与能力控制

Planner 输出受限操作、起止词索引和“听什么变化”。服务端依据目标原句/建议句重建合成文本，拒绝越界索引、目标类型冲突、末尾无后续语句的停顿等无效方案。

- `pause`：在指定词后加入一处短停顿。Flash v2/v2.5、Multilingual v2、Turbo v2/v2.5 使用服务端固定的 0.5 秒 break；Eleven v3 使用 `[short pause]`，不混用 SSML。实际持续时间与效果仍需听辨。
- `connected`：使用原词句，去掉选定意群内部的尾随逗号、省略号等停顿标点；不改数字、否定或词汇。生成后核对意群是否连续，不能保证没有任何停顿。
- `stress`：仅 `eleven_v3` 尝试大写目标词提示重音；默认 Flash v2.5 不支持这条路径，不自动更换模型。
- `wording`：针对用词/组织动作使用现有建议文本，再检查内容、原意和目标。没有逐字保意的程序保证，模型可能误判。
- `unavailable`：不能示范的音素/舌位指导、含混原意、泛泛提示、不支持的控制。不能擅自把音素纠正转换为重音练习。

官方依据：[停顿控制](https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/how-can-i-add-pauses)、[v3 强调与音频标签](https://elevenlabs.io/blog/v3-audiotags)、[带时间戳的语音生成接口](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps)。这些接口能力不构成教学效果保证。

## 声音检查

独立 Gemini 调用接收生成音频，以及待核对的原句、预期内容和动作。要求分别返回严格布尔值：

1. 实际声音与预期内容相符，未读出控制标记，未增加或遗漏重要内容；
2. 保留原句事实、数字、否定、主体、不确定性及请求强度；
3. 确实听到所要求的动作，不能只从目标描述推断成功。

三项都通过才返回音频。检查不接收用户重说，不证明原音诊断准确；同模型家族和文字提示仍可能带来偏差。这是自动质量过滤，发布能力前仍需真实生成音频的人工回听。没有声学测量或音素级评估。

优先使用规范化词时间，处理数字展开；供应商对齐若包含语音控制标签，关闭词级导航，仅保留整段播放，避免显示/定位控制标记。

## 交互与成本

- 结果卡和重说页均显示当前动作、“留意这个变化”、生成音频和 AI 检查局限。
- 同一目标、语言和会话复用音频；重新生成是明确的付费动作，不自动循环重试。
- 失败时保留原音回听与动作提示，用户可继续试说或结束。
- 一次成功生成通常增加两次 Gemini（方案 + 听生成音频）和一次 ElevenLabs TTS。默认每次供应商调用超时 45 秒，串行总等待可能更长；尚无端到端实测承诺。
- 结束会话释放缓存，供应商取消尽力而为，不承诺退费或即时第三方删除。

## 验证范围

契约测试覆盖词句保持、模型控制兼容、注入标记、索引越界、能力拒绝、检查收到实际音频、检查失败不返回音频和无自动重生成。真实音质、动作听辨准确率与学习效果仍待音频样本验证。
