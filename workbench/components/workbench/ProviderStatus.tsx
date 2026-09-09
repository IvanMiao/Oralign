import type { PublicConfig } from "@/lib/types";
import { useLocale } from "./LocaleContext";

interface ProviderStatusProps {
  config: PublicConfig | null;
}

interface StatusItemProps {
  label: string;
  ready: boolean | null;
}

function StatusItem({ label, ready }: StatusItemProps) {
  const { c } = useLocale();
  let statusText = c.checking;
  let dotClass = "neutral";
  if (ready === true) {
    statusText = c.configured;
    dotClass = "high";
  } else if (ready === false) {
    statusText = c.setupNeeded;
    dotClass = "warning";
  }
  return <span><i className={`status-dot ${dotClass}`} aria-hidden="true" />{label} {statusText}</span>;
}

export function ProviderStatus({ config }: ProviderStatusProps) {
  const { c } = useLocale();
  return (
    <div className="provider-status" aria-label={c.serviceStatus}>
      <StatusItem label="Gemini" ready={config?.providers.gemini ?? null} />
      <StatusItem label="Scribe" ready={config?.providers.elevenLabsStt ?? null} />
      <StatusItem label="TTS" ready={config?.providers.elevenLabsTts ?? null} />
    </div>
  );
}
