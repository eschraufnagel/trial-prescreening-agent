import { type FormEvent, useEffect, useState } from "react";
import {
  type ConnectionResult,
  getLocalModels,
  getSettings,
  type LocalModels,
  removeKey,
  type SettingsView,
  saveKey,
  testConnection,
  updateSettings,
} from "./api.js";
import { dollars, NOT_TESTED, overCap, SCRIPTED_SETTINGS, SETTINGS_NOTE } from "./logic.js";

type ProviderKey = SettingsView["choice"]["provider"];

/**
 * Settings (slice 0017): which model the agent and the trial reader use, its
 * key, and what a screening may spend. The key field is never filled in from
 * the server, which never sends a key back; the page only ever sees whether
 * one is saved and its last four characters.
 */
export function SettingsPage({ onChanged }: { onChanged: () => void }) {
  const [view, setView] = useState<SettingsView | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [picked, setPicked] = useState<ProviderKey | undefined>();
  const [model, setModel] = useState<string>("");
  const [local, setLocal] = useState<LocalModels | undefined>();

  useEffect(() => {
    getSettings().then(
      (v) => {
        setView(v);
        setPicked(v.choice.provider);
        setModel(v.choice.model);
      },
      (e: unknown) => setError(String(e)),
    );
    getLocalModels().then(setLocal, () => setLocal(undefined));
  }, []);

  const act = async (step: () => Promise<SettingsView>, after?: () => void) => {
    setError(undefined);
    try {
      setView(await step());
      after?.();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (view === undefined) {
    return (
      <main className="page">
        {error === undefined ? <p className="dim">Loading…</p> : <p className="error">{error}</p>}
      </main>
    );
  }

  const provider = picked ?? view.choice.provider;
  const hosted = view.providers.find((p) => p.provider === provider);
  const chosenModel =
    provider === "omlx"
      ? model || view.local.model
      : hosted?.models.some((m) => m.model === model)
        ? model
        : (hosted?.models.find((m) => m.cheapest)?.model ?? "");
  const inUse = view.choice.provider === provider && view.choice.model === chosenModel;
  const hasKey =
    provider === "omlx"
      ? view.local.keySaved || view.local.keyFromEnv
      : (hosted?.keySaved ?? false);
  const estimate = view.estimates[`${provider}:${chosenModel}`];

  const pick = (next: ProviderKey) => {
    setPicked(next);
    setModel(
      next === view.choice.provider
        ? view.choice.model
        : next === "omlx"
          ? view.local.model
          : (view.providers.find((p) => p.provider === next)?.models.find((m) => m.cheapest)
              ?.model ?? ""),
    );
  };

  return (
    <main className="page settings">
      <div className="page-head">
        <h1>Settings</h1>
        <p className="sub">
          Choose the model that asks the questions and reads each trial's rules. The local model is
          free and keeps everything on this computer; a hosted one needs a key and costs a little
          per screening.
        </p>
      </div>
      {view.mode === "scripted" && <p className="note warn">{SCRIPTED_SETTINGS}</p>}
      <p className="card settings-note">{SETTINGS_NOTE}</p>
      {error !== undefined && <p className="error">{error}</p>}

      <section className="stack" aria-labelledby="model-h">
        <h2 id="model-h">Model</h2>
        <fieldset className="provider-list">
          <legend className="visually-hidden">Provider</legend>
          <ProviderOption
            value="omlx"
            name="Local model"
            detail={
              view.local.keySaved
                ? `Key saved (${view.local.keyHint})`
                : view.local.keyFromEnv
                  ? "Key from .env"
                  : "No key"
            }
            picked={provider}
            inUse={view.choice.provider === "omlx"}
            onPick={pick}
          />
          {view.providers.map((p) => (
            <ProviderOption
              key={p.provider}
              value={p.provider}
              name={p.name}
              detail={p.keySaved ? `Key saved (${p.keyHint})` : "No key"}
              picked={provider}
              inUse={view.choice.provider === p.provider}
              onPick={pick}
            />
          ))}
        </fieldset>

        <div className="card stack settings-detail">
          {provider === "omlx" ? (
            <LocalFields
              view={view}
              local={local}
              model={chosenModel}
              onModel={setModel}
              onSave={(patch) => act(() => updateSettings({ local: patch }))}
            />
          ) : (
            hosted !== undefined && (
              <label className="field">
                <span>Model</span>
                <select value={chosenModel} onChange={(e) => setModel(e.target.value)}>
                  {hosted.models.map((m) => (
                    <option key={m.model} value={m.model}>
                      {modelOption(m, view.estimates[`${provider}:${m.model}`]?.screeningUsd)}
                    </option>
                  ))}
                </select>
                {hosted.models.find((m) => m.model === chosenModel)?.tested === null && (
                  <span className="help">{NOT_TESTED}.</span>
                )}
                {overCap(estimate?.screeningUsd, view.caps.screeningUsd) && (
                  <span className="help warn">
                    One screening is estimated at about {dollars(estimate?.screeningUsd ?? 0)}, more
                    than your {dollars(view.caps.screeningUsd)} limit.
                  </span>
                )}
              </label>
            )
          )}

          <KeyField
            provider={provider}
            saved={provider === "omlx" ? view.local.keySaved : (hosted?.keySaved ?? false)}
            hint={provider === "omlx" ? view.local.keyHint : (hosted?.keyHint ?? null)}
            onSave={(key, done) => act(() => saveKey(provider, key), done)}
            onRemove={() => act(() => removeKey(provider))}
          />

          <TestButton provider={provider} model={chosenModel} disabled={!hasKey} />

          <div className="actions">
            <button
              type="button"
              disabled={inUse || !hasKey || chosenModel === ""}
              onClick={() =>
                act(() => updateSettings({ choice: { provider, model: chosenModel } }))
              }
            >
              {inUse ? "In use" : "Use this model"}
            </button>
            {!hasKey && <span className="help">Save a key first.</span>}
          </div>
        </div>
      </section>

      <Limits view={view} onSave={(caps) => act(() => updateSettings({ caps }))} />
    </main>
  );
}

function modelOption(
  m: SettingsView["providers"][number]["models"][number],
  screeningUsd: number | undefined,
): string {
  const parts = [m.model, `$${m.inputPerMillion} in / $${m.outputPerMillion} out per million`];
  if (screeningUsd !== undefined) {
    parts.push(`about ${dollars(screeningUsd)} a screening`);
  }
  if (m.tested === null) {
    parts.push("not yet tested");
  }
  return parts.join(" · ");
}

function ProviderOption(props: {
  value: ProviderKey;
  name: string;
  detail: string;
  picked: ProviderKey;
  inUse: boolean;
  onPick: (value: ProviderKey) => void;
}) {
  const id = `provider-${props.value}`;
  return (
    <label
      htmlFor={id}
      className={props.picked === props.value ? "card provider picked" : "card provider"}
    >
      <input
        id={id}
        type="radio"
        name="provider"
        value={props.value}
        checked={props.picked === props.value}
        onChange={() => props.onPick(props.value)}
      />
      <span className="provider-name">
        {props.name}
        {props.inUse && <span className="tag">In use</span>}
      </span>
      <span className="help">{props.detail}</span>
    </label>
  );
}

function LocalFields(props: {
  view: SettingsView;
  local: LocalModels | undefined;
  model: string;
  onModel: (model: string) => void;
  onSave: (patch: { baseUrl?: string; model?: string }) => Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState(props.view.local.baseUrl);
  const listed = props.local?.reachable === true && props.local.models.length > 0;
  return (
    <>
      <label className="field">
        <span>Address</span>
        <input type="text" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <span className="help">
          {props.local?.reachable
            ? "The local server answered."
            : `No answer from the local server${props.local?.problem ? `: ${props.local.problem}` : ""}.`}
        </span>
      </label>
      <div className="field">
        <label htmlFor="local-model">Model</label>
        {listed ? (
          <select
            id="local-model"
            value={props.model}
            onChange={(e) => props.onModel(e.target.value)}
          >
            {[...new Set([props.model, ...(props.local?.models ?? [])])].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            id="local-model"
            type="text"
            value={props.model}
            onChange={(e) => props.onModel(e.target.value)}
          />
        )}
      </div>
      <div className="actions">
        <button
          type="button"
          className="secondary"
          onClick={() => props.onSave({ baseUrl, model: props.model })}
        >
          Save address and model
        </button>
      </div>
    </>
  );
}

function KeyField(props: {
  provider: ProviderKey;
  saved: boolean;
  hint: string | null;
  onSave: (key: string, done: () => void) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await props.onSave(key, () => setKey(""));
  };
  return (
    <form className="field" onSubmit={submit}>
      <label htmlFor={`key-${props.provider}`}>Key</label>
      <div className="add-row">
        <input
          id={`key-${props.provider}`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={
            props.saved ? `Saved (${props.hint}). Paste a new one to replace it.` : "Paste your key"
          }
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button type="submit" className="secondary" disabled={key.trim() === ""}>
          Save key
        </button>
        {props.saved && (
          <button type="button" className="quiet" onClick={() => props.onRemove()}>
            Remove key
          </button>
        )}
      </div>
      <span className="help">
        {props.saved ? `Key saved (${props.hint}).` : "No key saved."} It stays on this computer.
      </span>
    </form>
  );
}

function TestButton(props: { provider: ProviderKey; model: string; disabled: boolean }) {
  const [result, setResult] = useState<ConnectionResult | "busy" | undefined>();
  // A new provider or model hasn't been tested yet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the choice is the trigger, not an input
  useEffect(() => setResult(undefined), [props.provider, props.model]);
  const run = async () => {
    setResult("busy");
    try {
      setResult(await testConnection({ provider: props.provider, model: props.model }));
    } catch (e) {
      setResult({ ok: false, problem: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <div className="actions">
      <button
        type="button"
        className="secondary"
        disabled={props.disabled || result === "busy"}
        onClick={run}
      >
        {props.provider === "omlx" ? "Test" : "Test (one call, under 1¢)"}
      </button>
      {result === "busy" && <span className="help">Asking one made-up question…</span>}
      {result !== undefined && result !== "busy" && (
        <output className={result.ok ? "help ok" : "help warn"}>
          {result.ok
            ? `It works: ${result.servedModel} answered in the agent's format${result.usd > 0 ? `, for ${dollars(result.usd)}` : ""}.`
            : `It didn't work: ${result.problem}`}
        </output>
      )}
    </div>
  );
}

function Limits(props: {
  view: SettingsView;
  onSave: (caps: { screeningUsd: number; trialUsd: number }) => Promise<void>;
}) {
  const [screening, setScreening] = useState(String(props.view.caps.screeningUsd));
  const [trial, setTrial] = useState(String(props.view.caps.trialUsd));
  const estimate = props.view.estimates[`${props.view.choice.provider}:${props.view.choice.model}`];
  return (
    <section className="stack" aria-labelledby="limits-h">
      <h2 id="limits-h">Limits</h2>
      <div className="card stack">
        <p className="help">
          What a hosted model may spend. A screening or a trial read stops at its limit, keeping
          what it has so far. The local model costs nothing.
        </p>
        <label className="field">
          <span>One screening, up to (dollars)</span>
          <input
            type="number"
            min="0.05"
            max="5"
            step="0.05"
            value={screening}
            onChange={(e) => setScreening(e.target.value)}
          />
          {estimate !== undefined && (
            <span className="help">
              On the model in use, about {dollars(estimate.screeningUsd)}.
            </span>
          )}
        </label>
        <label className="field">
          <span>Reading one trial's rules, up to (dollars)</span>
          <input
            type="number"
            min="0.05"
            max="5"
            step="0.05"
            value={trial}
            onChange={(e) => setTrial(e.target.value)}
          />
          {estimate !== undefined && (
            <span className="help">On the model in use, about {dollars(estimate.trialUsd)}.</span>
          )}
        </label>
        <div className="actions">
          <button
            type="button"
            className="secondary"
            onClick={() =>
              props.onSave({ screeningUsd: Number(screening), trialUsd: Number(trial) })
            }
          >
            Save limits
          </button>
        </div>
      </div>
    </section>
  );
}
