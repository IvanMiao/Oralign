"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { useLiveAudio } from "@/hooks/useLiveAudio";
import { apiRequest } from "@/lib/client-api";
import type { GeminiLiveCredential } from "@/lib/live/gemini-token";
import { LiveSessionController, type LiveSessionView } from "@/lib/live/live-session";
import styles from "./LiveConversation.module.css";

interface RoomIdentity {
  id: string;
  originMs: number;
}

function initialView(id: string): LiveSessionView {
  return {
    session: {
      id, scenarioId: null, feedbackPreference: "after_turn",
      createdAt: "", connection: "idle", interaction: "paused",
      audioRetention: "session_only",
    },
    transcript: [], interimInput: "", error: null, notice: null,
    inputLevel: 0, busy: false, hasResumptionHandle: false,
  };
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1_000));
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
    String(seconds % 60).padStart(2, "0");
}

function LiveRoom({ identity, onNewSession }: { identity: RoomIdentity; onNewSession: () => void }) {
  const controllerRef = useRef<LiveSessionController | null>(null);
  const [view, setView] = useState<LiveSessionView>(() => initialView(identity.id));
  const [elapsedMs, setElapsedMs] = useState(0);
  const audio = useLiveAudio({
    sessionId: identity.id,
    sessionOriginMs: identity.originMs,
    onInputChunk: (base64) => controllerRef.current?.sendAudio(base64),
    onError: (message) => controllerRef.current?.reportAudioError(message),
  });

  useEffect(() => {
    const controller = new LiveSessionController({
      sessionId: identity.id,
      sessionOriginMs: identity.originMs,
      audio: {
        start: audio.start,
        stop: audio.stop,
        playAssistantAudio: audio.playAssistantAudio,
        interruptAssistant: audio.interruptAssistant,
        getUserTrack: audio.getUserTrack,
      },
      fetchCredential: () => apiRequest<GeminiLiveCredential>("/api/live/token", { method: "POST" }),
      onChange: setView,
    });
    controllerRef.current = controller;
    return () => {
      controllerRef.current = null;
      controller.dispose();
    };
  }, [
    identity.id, identity.originMs, audio.start, audio.stop, audio.playAssistantAudio,
    audio.interruptAssistant, audio.getUserTrack,
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsedMs(performance.now() - identity.originMs), 1_000);
    return () => window.clearInterval(timer);
  }, [identity.originMs]);

  const connection = view.session.connection;
  const interaction = view.session.interaction;
  const active = connection === "connected" && interaction !== "paused";
  const statusText = connection === "connecting" ? "正在连接"
    : connection === "reconnecting" ? "正在恢复"
    : connection === "failed" ? "连接失败"
    : connection === "ended" ? "已结束"
    : connection === "connected" ? (interaction === "paused" ? "已连接 · 麦克风关闭"
      : interaction === "speaking" ? "Gemini 正在回应" : "正在聆听")
      : "未连接";

  return (
    <>
      <section className={styles.hero}>
        <div>
          <p className="eyebrow">LIVE CONVERSATION</p>
          <h1>自然地说，接着聊下去</h1>
          <p>与 Gemini 实时交谈。你可以随时停下、继续，或在它说话时插话。</p>
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.timer} aria-label="会话时长">{formatElapsed(elapsedMs)}</span>
          <span className={styles.localBadge}>本地体验</span>
        </div>
      </section>

      <div className={styles.layout}>
        <section className={styles.conversation} aria-label="Live 对话">
          <div className={styles.conversationHeader}>
            <div>
              <p className="eyebrow">SESSION</p>
              <h2>对话记录</h2>
            </div>
            <span className={styles.status} data-state={connection} role="status">
              <span className={styles.statusDot} aria-hidden="true" />{statusText}
            </span>
          </div>

          <div className={styles.feed} aria-live="off">
            {view.transcript.length === 0 ? (
              <div className={styles.empty}>
                <span className={styles.emptyMark} aria-hidden="true">◎</span>
                <h3>从一句话开始</h3>
                <p>连接后开启麦克风。可以聊今天发生的事，或试着解释一个工作中的想法。</p>
              </div>
            ) : view.transcript.map((line) => (
              <article className={styles.turn} data-speaker={line.speaker} key={line.id}>
                <div className={styles.turnMeta}>
                  <strong>{line.speaker === "user" ? "你" : line.speaker === "assistant" ? "Gemini" : "系统"}</strong>
                  <time>{formatElapsed(line.atMs)}</time>
                  {line.status === "interrupted" ? <span>已打断</span> : null}
                </div>
                <p>{line.text || "正在回应…"}</p>
              </article>
            ))}
            {view.interimInput && active ? (
              <div className={styles.interim}><strong>你 · 正在识别</strong><p>{view.interimInput}</p></div>
            ) : null}
          </div>
        </section>

        <aside className={styles.controls} aria-label="Live 控制">
          <div className={styles.controlHeading}>
            <p className="eyebrow">YOUR SPACE</p>
            <h2>{active ? (interaction === "speaking" ? "现在也可以插话" : "麦克风正在聆听") : "准备好开始了吗？"}</h2>
            <p>{active ? "保持自然语速。暂停会关闭麦克风和声音播放。" : "声音只在当前页面内存中缓冲；结束或离开页面后即释放。"}</p>
          </div>

          <div className={styles.micVisual} data-active={active} aria-hidden="true">
            <div className={styles.micCore}>{active ? "●" : "○"}</div>
          </div>
          <div className={styles.levelRow}>
            <span>输入音量</span>
            <div className={styles.levelTrack} role="progressbar" aria-label="麦克风输入音量"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.inputLevel * 100)}>
              <span style={{ width: Math.round(view.inputLevel * 100) + "%" }} />
            </div>
          </div>

          {view.error ? <div className={styles.error} role="alert">{view.error}</div> : null}
          {view.notice && !view.error ? <div className={styles.notice} role="status">{view.notice}</div> : null}

          <div className={styles.actions}>
            {(connection === "idle" || connection === "failed") ? (
              <button type="button" className="primary-button" disabled={view.busy}
                onClick={() => { void controllerRef.current?.connect(); }}>
                {view.busy ? "连接中…" : connection === "failed" ? "重新建立会话" : "连接 Gemini Live"}
              </button>
            ) : null}
            {connection === "connected" && interaction === "paused" ? (
              <button type="button" className="primary-button" disabled={view.busy}
                onClick={() => { void controllerRef.current?.resume(); }}>
                {view.busy ? "正在开启…" : view.transcript.some((line) => line.speaker === "user") ? "继续说话" : "开启麦克风"}
              </button>
            ) : null}
            {active ? (
              <button type="button" className="secondary-button" disabled={view.busy}
                onClick={() => { void controllerRef.current?.pause(); }}>暂停对话</button>
            ) : null}
            {active && interaction === "speaking" ? (
              <button type="button" className="quiet-button"
                onClick={() => controllerRef.current?.stopResponse()}>停止当前语音</button>
            ) : null}
            {connection !== "ended" ? (
              <button type="button" className="quiet-button"
                onClick={() => { void controllerRef.current?.end(); }}>结束对话</button>
            ) : (
              <button type="button" className="secondary-button" onClick={onNewSession}>开始新对话</button>
            )}
          </div>

          <p className={styles.finePrint}>当前提供实时对话与转写。声音证据分析和练习反馈将在后续版本接入。</p>
        </aside>
      </div>
    </>
  );
}

export function LiveConversation() {
  const [identity, setIdentity] = useState<RoomIdentity | null>(null);

  return (
    <>
      <a className="skip-link" href="#live-main">跳到 Live 对话</a>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="返回 Oralign 首页">Oralign</Link>
        <nav aria-label="主导航"><Link href="/" className={styles.backLink}>← 单段练习</Link></nav>
      </header>
      <main id="live-main" className={styles.page}>
        {identity ? (
          <LiveRoom key={identity.id} identity={identity}
            onNewSession={() => setIdentity({ id: crypto.randomUUID(), originMs: performance.now() })} />
        ) : (
          <section className={styles.welcome}>
            <p className="eyebrow">GEMINI LIVE · LOCAL PREVIEW</p>
            <h1>把练习变成一场对话</h1>
            <p>这里是 Oralign 的实时对话体验。连接成功后，再点击开启麦克风，就能连续交谈；你可以暂停、继续，也可以在 Gemini 回应时插话。</p>
            <button type="button" className="primary-button"
              onClick={() => setIdentity({ id: crypto.randomUUID(), originMs: performance.now() })}>
              进入 Live 对话
            </button>
            <div className={styles.welcomeNotes}>
              <span>01 · 实时收发语音</span><span>02 · 同步显示转写</span><span>03 · 随时暂停和结束</span>
            </div>
            <p className={styles.finePrint}>仅供本地开发验收。请使用耳机以减少回声；浏览器会请求麦克风权限。</p>
          </section>
        )}
      </main>
    </>
  );
}
