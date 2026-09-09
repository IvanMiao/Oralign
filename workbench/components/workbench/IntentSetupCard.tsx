"use client";

import type { Intent, IntentMode } from "@/lib/types";
import { useLocale } from "./LocaleContext";

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
  const { c } = useLocale();
  function updateField(field: Exclude<keyof Intent, "mode">, value: string) {
    onChange({ ...intent, [field]: value });
  }

  function updateMode(mode: IntentMode) {
    onChange({ ...intent, mode });
  }

  return (
    <aside className="panel setup-card">
      <p className="eyebrow">{c.testMethod}</p>
      <fieldset className="mode-picker">
        <legend className="visually-hidden">{c.testMethod}</legend>
        <ModeOption
          checked={intent.mode === "quick"}
          description={c.quickDescription}
          label={c.quick}
          mode="quick"
          onSelect={updateMode}
        />
        <ModeOption
          checked={intent.mode === "research"}
          description={c.researchDescription}
          label={c.researchMode}
          mode="research"
          onSelect={updateMode}
        />
      </fieldset>

      {intent.mode === "quick" ? (
        <div className="quick-context">
          <label htmlFor="intent-takeaway">
            {c.oneLineGoal} <span>{c.optional}</span>
            <input
              id="intent-takeaway"
              maxLength={600}
              value={intent.takeaway}
              onChange={(event) => updateField("takeaway", event.target.value)}
              placeholder="例如：I need a launch decision today."
            />
          </label>
          <p>{c.quickCaveat}</p>
        </div>
      ) : (
        <div className="research-fields">
          <p>{c.groundTruth}</p>
          <label htmlFor="intent-progress">
            {c.progress} <span>{c.required}</span>
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
            {c.blocker} <span>{c.required}</span>
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
            {c.request} <span>{c.required}</span>
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
