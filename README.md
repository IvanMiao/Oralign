# Oralign

探索一个 AI-native 口语产品：它不追求纠正所有语法、口音或措辞，而是识别那些会让听者停顿、费力或误解的瞬间，并帮助用户以更低的沟通成本表达同一件事。

## 当前状态

- 阶段：概念验证 / MVP 定义
- 已完成：[想法反思](./discovery.md)、[PRD](./prd.md)、[Roadmap](./roadmap.md)、[人机共评工作台](./workbench/README.md)
- Credits 方案：[Gemini 与 ElevenLabs credits 使用方案](./workbench/docs/credit-plan.md)
- 下一步：配置 Gemini 与 ElevenLabs，围绕“英语工作更新”收集带明确表达意图的样本并建立真人标注基线
- 原始材料：[ChatGPT 分享对话](https://chatgpt.com/share/6a903a71-971c-83eb-9baa-b3523ba05d3f?ogimg=plain)

## 暂定一句话定位

面向已经“能说”但仍会让目标听者费力的外语使用者，找出一段真实口语中最影响一次听懂的少数瞬间，并给出可立即重说和对比的改进方式。

## 当前验证切口

- 用户：中文母语、英语 B1–C1 的成年人；
- 场景：用 30–60 秒说明工作进展、阻塞与请求；
- 结果：目标听者能否在只听一次后正确复述核心意图；
- 方法：先建立真人听者基线，再验证 Gemini 与 ElevenLabs 辅助流程能否接近该基线。
