"use client";

import type { Intent, IntentMode } from "@/lib/types";

interface IntentSetupCardProps {
  intent: Intent;
  onChange: (intent: Intent) => void;
}

interface ModeOptionProps {
  checked: boolean;
  description: string;
  label: string;
  mode: IntentMode;
  onSelect: (mode: IntentMode) => void;
}

function ModeOption({ checked, description, label, mode, onSelect }: ModeOptionProps) {
  return (
    <label className={checked ? "selected" : ""}>
      <input
        type="radio"
        name="intent-mode"
        value={mode}
        checked={checked}
        onChange={() => onSelect(mode)}
      />
      <span>
        <b>{label}</b>
        <small>{description}</small>
      </span>
    </label>
  );
}

export function IntentSetupCard({ intent, onChange }: IntentSetupCardProps) {
  function updateField(field: Exclude<keyof Intent, "mode">, value: string) {
    onChange({ ...intent, [field]: value });
  }

  function updateMode(mode: IntentMode) {
    onChange({ ...intent, mode });
  }

  return (
    <aside className="panel setup-card">
      <p className="eyebrow">测试方式</p>
      <fieldset className="mode-picker">
        <legend className="visually-hidden">选择测试方式</legend>
        <ModeOption
          checked={intent.mode === "quick"}
          description="录音即可，适合检查流程和反馈质量"
          label="快速体验"
          mode="quick"
          onSelect={updateMode}
        />
        <ModeOption
          checked={intent.mode === "research"}
          description="填写三项基准，适合测量意图复述率"
          label="研究模式"
          mode="research"
          onSelect={updateMode}
        />
      </fieldset>

      {intent.mode === "quick" ? (
        <div className="quick-context">
          <label htmlFor="intent-takeaway">
            一句话目标 <span>可选</span>
            <input
              id="intent-takeaway"
              maxLength={600}
              value={intent.takeaway}
              onChange={(event) => updateField("takeaway", event.target.value)}
              placeholder="例如：I need a launch decision today."
            />
          </label>
          <p>留空时只评估录音本身的听者费力，不能据此证明预定意图是否被准确传达。</p>
        </div>
      ) : (
        <div className="research-fields">
          <p>三项是研究测量的 ground truth，不用于评价工作内容。</p>
          <label htmlFor="intent-progress">
            进展 <span>必填</span>
            <textarea
              id="intent-progress"
              rows={2}
              maxLength={600}
              required
              value={intent.progress}
              onChange={(event) => updateField("progress", event.target.value)}
              placeholder="The payment page is finished."
            />
          </label>
          <label htmlFor="intent-blocker">
            阻塞 <span>必填</span>
            <textarea
              id="intent-blocker"
              rows={2}
              maxLength={600}
              required
              value={intent.blocker}
              onChange={(event) => updateField("blocker", event.target.value)}
              placeholder="The security review is pending."
            />
          </label>
          <label htmlFor="intent-request">
            请求 <span>必填</span>
            <textarea
              id="intent-request"
              rows={2}
              maxLength={600}
              required
              value={intent.request}
              onChange={(event) => updateField("request", event.target.value)}
              placeholder="Please confirm the launch date today."
            />
          </label>
        </div>
      )}
    </aside>
  );
}
