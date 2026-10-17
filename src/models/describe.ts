import type { ModelDescriptor } from "./types.js";

/**
 * The generation settings, in words, for a person reading a run's output.
 *
 * One function so every script says the same thing about a setting that
 * couldn't be sent: `null` printed as "null" reads like a bug, and a seed
 * printed without "best effort" reads like a guarantee.
 */
export function describeSettings(d: ModelDescriptor): string {
  const temperature =
    d.temperature === null
      ? `temperature not settable${d.unset?.temperature ? ` (${d.unset.temperature})` : ""}`
      : `temperature ${d.temperature}`;
  const seed =
    d.seed === null
      ? `seed none${d.unset?.seed ? ` (${d.unset.seed})` : ""}`
      : `seed ${d.seed}${d.seedGuarantee === "best-effort" ? " (best effort)" : ""}`;
  return `${temperature}, ${seed}, thinking ${d.thinking ?? "default"}`;
}

/**
 * The descriptor's optional explanations, for spreading onto a recorded run.
 * Absent fields stay absent, so a local run records exactly what it did
 * before slice 0008.
 */
export function unsetReasons(d: ModelDescriptor): Pick<ModelDescriptor, "unset" | "seedGuarantee"> {
  return {
    ...(d.unset === undefined ? {} : { unset: d.unset }),
    ...(d.seedGuarantee === undefined ? {} : { seedGuarantee: d.seedGuarantee }),
  };
}
