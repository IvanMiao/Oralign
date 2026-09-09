# Oralign 口语练习

默认流程：说一段 → 看重点 → 重说与对比。浏览器原始录音和重说均支持最长 180 秒，到时自动停止；上传文件继续受 12 MB（可配置）限制。首页研究工具入口保留原有真人标注与 JSON 导出。

结果页优先展示 Top-1 建议，其他建议及全文转写按需展开。比较前在浏览器裁切选中原句，转为单声道 WAV，与重说比较；片段比较不使用整段意图槽评分。切换目标或重新录音会清除旧比较结果。完成练习会清空当前内存会话。

示例为静态反馈，不含录音，因此不支持真实音频比较。真实录音和结果仅保留在当前页面内存，刷新不会恢复。

## 已实现

- 默认“快速体验”：录音即可分析，可选填一句话目标；
- 可选“研究模式”：进展、阻塞、请求三个意图槽作为复述率测量基准；
- 浏览器录音和本地音频上传；
- ElevenLabs Scribe v2 词级时间戳转写；
- Gemini 音频 + 转写联合分析，输出 0–3 个结构化摩擦候选；
- 每个候选的真人同意 / 部分同意 / 不同意标注；
- 按需生成 ElevenLabs Flash v2.5 参考音频；
- 重说片段与原版的随机 A/B Gemini Judge；
- 共评结果导出为不含音频字节和 API 密钥的 JSON；
- 无密钥演示模式、错误状态和服务配置状态。

## 本地运行

要求 Node.js 20.9 或更高版本。

```bash
cd workbench
npm install
cp .env.example .env.local
# 按 docs/api-configuration.md 填写 .env.local
npm run dev
```

打开 `http://127.0.0.1:4173`。没有 API 密钥时也可以点击“载入演示”检查完整共评界面。

第一次检查流程时直接使用默认“快速体验”。只有在需要测量真人或 Judge 是否准确复述预定内容时，才切换到“研究模式”并填写三个意图槽。

## 代码结构

```text
app/                       Next.js 页面、全局样式与 Route Handlers
components/workbench/      按产品职责拆分的 Client Components
hooks/useAudioCapture.ts   MediaRecorder 与 Blob 生命周期
lib/providers.ts           Gemini / ElevenLabs 服务端适配器
lib/schemas.ts             运行时输入与模型输出校验
lib/types.ts               共享领域类型
tests/                     供应商契约与校验单元测试
```

页面组件不读取密钥，供应商请求仅从 `app/api/**/route.ts` 进入服务端模块。

## 验证

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

## 文档

- [Gemini 与 ElevenLabs 配置](./docs/api-configuration.md)
- [Gemini 与 ElevenLabs credits 使用方案](./docs/credit-plan.md)
- [架构、信任边界与数据流](./docs/architecture.md)
- [产品 PRD](../prd.md)

## 重要边界

- 当前版本仅面向本地研究，不包含账户、持久数据库或公网鉴权。
- 音频在浏览器内存和单次 Next.js Route Handler 请求中处理，不写入工作台磁盘。
- Automatic Judge 是即时练习信号，不能替代目标听者盲评。
- 参考语音是一种清楚表达，不代表标准口音。
