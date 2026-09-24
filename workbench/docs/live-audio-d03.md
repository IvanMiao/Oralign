# D03：实时音频采集、缓冲与播放

D03 提供浏览器音频层，供 D04 的 Live 会话调用；当前尚未增加 Live 页面，因此不能仅从现有首页完成真人语音往返验收。

## 接口与数据流

- hooks/useLiveAudio.ts 导出 useLiveAudio({ sessionId, sessionOriginMs, onInputChunk, onError })。sessionOriginMs 必须是创建会话时记录的 performance.now()，同一会话暂停后恢复时保持不变。
- start() 取得麦克风权限，加载 /worklets/pcm-capture.js，从实际 AudioContext.sampleRate 连续重采样成单声道 16 kHz、小端序 PCM16。Worklet 以 1024 个输入帧为一块传到主线程；最后不足一块的音频由 stop() 刷新。
- 每个转换后的字节块先复制到用户 PcmTrackBuffer，同一块再经 onInputChunk(base64, range) 交给 D02 的 GeminiLiveConnection.sendAudio(base64)。没有重新编码或另录一份供分析使用。
- playAssistantAudio(base64, mimeType) 接收 Gemini 返回的单声道 24 kHz PCM16，按顺序排入 Web Audio 播放队列。interruptAssistant() 立即停止全部排队节点，只把已播放的帧写入独立的 AI 音轨。
- getUserTrack() 与 getAssistantTrack() 返回 { asset, segments, pcm }。asset.sessionOffsetMs 和每个半开帧区间可映射到 D01 的会话时间轴；暂停造成的空白在 PCM 中以静音占位，segments 仅标识实际音频。PcmTrackBuffer.clip(range) 可直接交给 D07 分析。
- stop() 停止麦克风轨道、刷新尾块、停止播放、断开节点并关闭 AudioContext。用同一 sessionId 与 sessionOriginMs 再次 start() 会续接原有两条音轨；新会话会新建音轨。每条音轨最多 30 分钟，超出时通过 onError 报告。

浏览器请求关闭噪声抑制与自动增益，以减少声学测量的处理偏差；请求开启回声消除以降低 AI 播放回灌。实际是否生效由浏览器决定，AudioAsset.processing 会记录 getSettings() 报告的状态，供 D07 判断证据质量。AI 音轨只记录实际播放的部分；播放中尚未结束的片段要在打断或停止后才能从快照取得。

D04 的接线顺序：先建立 Gemini Live 连接，再 await start()；把 onInputChunk 传给 sendAudio；把供应商的 audio 事件传给 playAssistantAudio，interrupted 事件传给 interruptAssistant；结束时先 await stop()，再关闭 Live 连接，以便尾块发送成功。页面要捕获 start()/playAssistantAudio() 的异常并展示 onError。

## 验证

已通过 npm test、npm run lint、npm run typecheck、npm run build。测试覆盖 Worklet 分块和尾块、静音输出、跨块重采样、PCM16 编码、共享时间轴、暂停后音轨续接、AI 播放顺序与打断清队列。真人麦克风和扬声器的浏览器端到端测试须在 D04 页面接入后进行；D02 只完成过真实无音频 Gemini 握手，不等于语音往返已验收。

协议依据：[Gemini Live 原始 WebSocket 音频格式](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket)、[Gemini Live 音频输出 24 kHz 规格](https://ai.google.dev/gemini-api/docs/live-api/capabilities)、[MDN AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)。
