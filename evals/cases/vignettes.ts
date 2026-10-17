import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLabelSet } from "./load.js";
import type {
  ExpectedOutcome,
  ExpectedReport,
  LabelSet,
  Vignette,
  VignetteBehavior,
  VignetteFact,
  VignetteProvenance,
} from "./types.js";
import { VignetteError } from "./types.js";

/**
 * Reads vignettes and refuses anything the grader could not trust.
 *
 * Every rule here closes a way for a vignette to look fine while measuring the
 * wrong thing: a `patient` label with no fact (a hard criterion quietly left
 * out), an expected outcome on a `clinical` fact (grading a determination the
 * agent is forbidden to make), a decline with an answer attached. Problems are
 * collected rather than thrown one at a time, as in `load.ts`.
 */
const DEFAULT_VIGNETTES_DIR = fileURLToPath(new URL("./vignettes", import.meta.url));
const DEFAULT_LABELS_DIR = fileURLToPath(new URL("./labels", import.meta.url));

/** The one subdirectory whose vignettes are never scored. */
export const DEV_DIR = "dev";

const BEHAVIORS: readonly VignetteBehavior[] = [
  "cooperative",
  "vague",
  "volunteers",
  "contradicts",
  "declines",
];
const OUTCOMES: readonly ExpectedOutcome[] = ["holds", "does-not-hold", "unresolved", "defer"];
const REPORTS: readonly ExpectedReport[] = ["holds", "does-not-hold", "unknown"];

export interface VignetteDirs {
  vignettesDir?: string;
  labelsDir?: string;
}

/** SHA-256 of a label file's bytes, which is what `labelSetSha` pins. */
export function labelFileSha(nctId: string, labelsDir: string = DEFAULT_LABELS_DIR): string {
  const bytes = readFileSync(join(labelsDir, `${nctId}.json`));
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Every vignette, scored and dev, sorted by id.
 *
 * Scored vignettes live in one directory per study; the dev vignette lives in
 * `dev/`. Callers that score filter on `dev`.
 */
export function loadVignettes(dirs: VignetteDirs = {}): Vignette[] {
  const root = dirs.vignettesDir ?? DEFAULT_VIGNETTES_DIR;
  if (!existsSync(root)) {
    return [];
  }

  const vignettes: Vignette[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const dir = join(root, entry.name);
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      vignettes.push(loadVignette(join(dir, name), dirs));
    }
  }

  return vignettes.sort((a, b) => a.id.localeCompare(b.id));
}

export function loadVignette(path: string, dirs: VignetteDirs = {}): Vignette {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new VignetteError(`Cannot read vignette ${path}`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const dev = basename(join(path, "..")) === DEV_DIR;
  const nctId = asRecord(parsed)?.["nctId"];
  const labelsDir = dirs.labelsDir ?? DEFAULT_LABELS_DIR;

  let labels: LabelSet | undefined;
  let sha: string | undefined;
  if (typeof nctId === "string") {
    try {
      labels = loadLabelSet(nctId, labelsDir);
      sha = labelFileSha(nctId, labelsDir);
    } catch (error) {
      throw new VignetteError(`Invalid vignette ${path}`, [
        `cannot load labels for ${nctId}: ${error instanceof Error ? error.message.split("\n")[0] : ""}`,
      ]);
    }
  }

  return validateVignette(parsed, {
    source: path,
    fileName: basename(path, ".json"),
    dev,
    ...(labels === undefined ? {} : { labels }),
    ...(sha === undefined ? {} : { labelSetSha: sha }),
  });
}

export interface ValidateContext {
  source: string;
  /** The file's name without extension, which must equal the id. */
  fileName?: string;
  dev: boolean;
  labels?: LabelSet;
  /** The label file's actual sha, to compare against the vignette's. */
  labelSetSha?: string;
}

export function validateVignette(value: unknown, context: ValidateContext): Vignette {
  const record = asRecord(value);
  if (record === undefined) {
    throw new VignetteError(`Invalid vignette ${context.source}`, [
      "file does not contain a JSON object",
    ]);
  }

  const problems: string[] = [];

  const nctId = record["nctId"];
  if (typeof nctId !== "string" || !/^NCT\d{8}$/.test(nctId)) {
    problems.push("nctId is missing or not an NCT id");
  }

  const id = record["id"];
  const idPattern = context.dev ? /^NCT\d{8}-dev$/ : /^NCT\d{8}-v\d+$/;
  if (typeof id !== "string" || !idPattern.test(id)) {
    problems.push(
      `id ${describe(id)} does not match ${context.dev ? "<nctId>-dev" : "<nctId>-v<N>"}`,
    );
  } else {
    if (typeof nctId === "string" && !id.startsWith(`${nctId}-`)) {
      problems.push(`id ${id} does not belong to ${nctId}`);
    }
    if (context.fileName !== undefined && context.fileName !== id) {
      problems.push(`file is named ${context.fileName} but the vignette is ${id}`);
    }
  }

  const sha = record["labelSetSha"];
  if (typeof sha !== "string" || !/^[0-9a-f]{64}$/.test(sha)) {
    problems.push("labelSetSha is missing or not a sha-256 hex digest");
  } else if (context.labelSetSha !== undefined && sha !== context.labelSetSha) {
    problems.push(
      "labelSetSha does not match the label file: the labels changed after this vignette was " +
        "written. Re-read every fact against the current labels rather than updating the hash.",
    );
  }

  const behavior = record["behavior"];
  if (typeof behavior !== "string" || !BEHAVIORS.includes(behavior as VignetteBehavior)) {
    problems.push(`behavior ${describe(behavior)} is not one of ${BEHAVIORS.join(", ")}`);
  }

  const persona = record["persona"];
  if (typeof persona !== "string" || persona.trim().length === 0) {
    problems.push("persona is missing or empty");
  }

  const provenance = readProvenance(record["provenance"], problems);
  const facts = readFacts(record["facts"], context.labels, problems);

  if (problems.length > 0) {
    throw new VignetteError(`Invalid vignette ${context.source}`, problems);
  }

  return {
    id: id as string,
    nctId: nctId as string,
    labelSetSha: sha as string,
    behavior: behavior as VignetteBehavior,
    persona: persona as string,
    facts,
    provenance: provenance as VignetteProvenance,
    dev: context.dev,
  };
}

function readFacts(
  value: unknown,
  labels: LabelSet | undefined,
  problems: string[],
): VignetteFact[] {
  if (!Array.isArray(value)) {
    problems.push("facts is missing or not an array");
    return [];
  }

  const types = new Map(labels?.criteria.map((l) => [l.id, l.type]) ?? []);
  const seen = new Set<string>();
  const out: VignetteFact[] = [];

  value.forEach((entry, index) => {
    const record = asRecord(entry);
    if (record === undefined) {
      problems.push(`facts[${index}] is not an object`);
      return;
    }

    const label = record["label"];
    const where = typeof label === "string" ? `fact ${label}` : `facts[${index}]`;
    const before = problems.length;

    if (typeof label !== "string" || label.length === 0) {
      problems.push(`${where}: label is missing`);
      return;
    }
    if (seen.has(label)) {
      problems.push(`${where}: duplicate fact for this label`);
    }
    seen.add(label);

    const type = types.get(label);
    if (labels !== undefined && type === undefined) {
      problems.push(`${where}: no such label in ${labels.nctId}`);
    }
    if (type === "protocol" || type === "definitional") {
      problems.push(
        `${where}: ${type} criteria are never put to a participant, so a fact for one ` +
          "measures nothing",
      );
    }

    const says = record["says"];
    const laterSays = record["laterSays"];
    const declines = record["declines"];
    const expected = record["expected"];
    const reported = record["reported"];

    if (says !== null && (typeof says !== "string" || says.trim().length === 0)) {
      problems.push(`${where}: says must be a non-empty string, or null when declining`);
    }
    if (declines !== undefined && typeof declines !== "boolean") {
      problems.push(`${where}: declines is not a boolean`);
    }
    if (laterSays !== undefined && (typeof laterSays !== "string" || laterSays.trim() === "")) {
      problems.push(`${where}: laterSays is not a non-empty string`);
    }

    if (declines === true) {
      if (says !== null) {
        problems.push(`${where}: a declined fact has nothing to say; set says to null`);
      }
      if (laterSays !== undefined) {
        problems.push(`${where}: a declined fact cannot also be contradicted`);
      }
    } else if (says === null) {
      problems.push(`${where}: says is null but the fact does not decline`);
    }

    if (type === "patient") {
      if (typeof expected !== "string" || !OUTCOMES.includes(expected as ExpectedOutcome)) {
        problems.push(`${where}: a patient fact needs expected, one of ${OUTCOMES.join(", ")}`);
      } else if ((declines === true || laterSays !== undefined) && expected !== "unresolved") {
        problems.push(
          `${where}: a declined or contradicted answer settles nothing; expected must be unresolved`,
        );
      }
      if (reported !== undefined) {
        problems.push(`${where}: reported belongs on clinical facts; use expected`);
      }
    }

    if (type === "clinical") {
      if (expected !== undefined) {
        problems.push(
          `${where}: a clinical criterion is never settled by the participant (spec D2); ` +
            "use reported, not expected",
        );
      }
      if (reported !== undefined && !REPORTS.includes(reported as ExpectedReport)) {
        problems.push(
          `${where}: reported ${describe(reported)} is not one of ${REPORTS.join(", ")}`,
        );
      }
      if (reported !== undefined && (declines === true || laterSays !== undefined)) {
        problems.push(`${where}: a declined or contradicted clinical fact has no gradeable report`);
      }
    }

    if (problems.length > before) {
      return;
    }

    out.push({
      label,
      says: says as string | null,
      ...(typeof laterSays === "string" ? { laterSays } : {}),
      ...(declines === true ? { declines: true } : {}),
      ...(typeof expected === "string" ? { expected: expected as ExpectedOutcome } : {}),
      ...(typeof reported === "string" ? { reported: reported as ExpectedReport } : {}),
    });
  });

  // The rule that stops a hard criterion being quietly left out.
  if (labels !== undefined) {
    const missing = labels.criteria
      .filter((l) => l.type === "patient" && !seen.has(l.id))
      .map((l) => l.id);
    if (missing.length > 0) {
      problems.push(`every patient label needs a fact; missing ${missing.join(", ")}`);
    }
  }

  return out;
}

function readProvenance(value: unknown, problems: string[]): VignetteProvenance | undefined {
  const record = asRecord(value);
  if (record === undefined) {
    problems.push("provenance is missing or not an object");
    return undefined;
  }

  const drafter = record["drafter"];
  const guide = record["guide"];
  const sawAgentPrompt = record["sawAgentPrompt"];
  const note = record["note"];

  if (typeof drafter !== "string" || drafter.length === 0) {
    problems.push("provenance.drafter is missing or not a non-empty string");
  }
  if (typeof guide !== "string" || guide.length === 0) {
    problems.push("provenance.guide is missing or not a non-empty string");
  }
  if (typeof sawAgentPrompt !== "boolean") {
    problems.push("provenance.sawAgentPrompt is missing or not a boolean");
  }
  if (note !== undefined && typeof note !== "string") {
    problems.push("provenance.note is not a string");
  }

  if (
    typeof drafter !== "string" ||
    typeof guide !== "string" ||
    typeof sawAgentPrompt !== "boolean"
  ) {
    return undefined;
  }

  return { drafter, guide, sawAgentPrompt, ...(typeof note === "string" ? { note } : {}) };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function describe(value: unknown): string {
  return value === undefined ? "(absent)" : JSON.stringify(value);
}
