import type { Metadata } from "next";
import Link from "next/link";

import { LiveConversation } from "@/components/live/LiveConversation";

export const metadata: Metadata = {
  title: "Oralign · Live 对话",
  description: "用 Gemini Live 进行实时英语对话。",
};

export default function LivePage() {
  if (process.env.NODE_ENV !== "development") {
    return (
      <main className="workspace">
        <Link href="/" className="quiet-button">← 返回练习</Link>
        <section className="panel" style={{ marginTop: 24, padding: 32 }}>
          <p className="eyebrow">LIVE</p>
          <h1>Live 对话暂未开放</h1>
          <p>当前版本只允许在本地开发环境使用。账号、持久化配额与访问控制接入后才会开放。</p>
        </section>
      </main>
    );
  }
  return <LiveConversation />;
}
