import type { PublicConfig } from "@/lib/types";

interface ProviderStatusProps {
  config: PublicConfig | null;
}

interface StatusItemProps {
  label: string;
  ready: boolean | null;
}

function StatusItem({ label, ready }: StatusItemProps) {
  let statusText = "检查中";
  let dotClass = "neutral";
  if (ready === true) {
    statusText = "已配置";
    dotClass = "high";
  } else if (ready === false) {
    statusText = "待配置";
    dotClass = "warning";
  }
  return <span><i className={`status-dot ${dotClass}`} aria-hidden="true" />{label} {statusText}</span>;
}

export function ProviderStatus({ config }: ProviderStatusProps) {
  return (
    <div className="provider-status" aria-label="服务状态">
      <StatusItem label="Gemini" ready={config?.providers.gemini ?? null} />
      <StatusItem label="Scribe" ready={config?.providers.elevenLabsStt ?? null} />
      <StatusItem label="TTS" ready={config?.providers.elevenLabsTts ?? null} />
    </div>
  );
}
