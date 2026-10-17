/**
 * Turns the capture's recording into the README's demo (slice 0016).
 *
 *   npm run demo                  docs/images/demo.gif, from e2e/.out/capture/cuts.json
 *   npm run demo -- --offset 0.3  shift every cut later by 0.3 s, if the video lags the marks
 *
 * `npm run screenshots` records the demo and writes the cut list: the moments
 * the page waits on the model are sped up so each lasts a fraction of a
 * second, and everything else plays as recorded. This trims, speeds and joins
 * those pieces with `ffmpeg`, then makes a looping GIF with its own palette.
 * If the GIF is over 5 MB it tries a lower frame rate, then a narrower width.
 *
 * `ffmpeg` is a system tool, not a dependency, and is needed for this only.
 * No network, no model.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** A piece of the recording, in seconds, played back `speed` times faster. */
export interface Cut {
  from: number;
  to: number;
  speed: number;
}

/** A moment the capture noted, in seconds from the start of the recording. */
export interface Mark {
  at: number;
  label: "wait-start" | "wait-end";
}

/** How long a sped-up wait lasts in the demo, in seconds. */
export const WAIT_SECONDS = 0.6;
export const MAX_BYTES = 5 * 1024 * 1024;
export const ATTEMPTS = [
  { fps: 12, width: 960 },
  { fps: 10, width: 960 },
  { fps: 10, width: 800 },
] as const;

const CUTS_FILE = fileURLToPath(new URL("../e2e/.out/capture/cuts.json", import.meta.url));
const OUT = fileURLToPath(new URL("../docs/images/demo.gif", import.meta.url));

/**
 * The cut list for a recording of `end` seconds: as recorded outside the
 * waits, and each wait sped up to last `WAIT_SECONDS`. Marks come in pairs,
 * a start then an end; anything else is an error in the capture.
 */
export function cutsFromMarks(marks: Mark[], end: number): Cut[] {
  const cuts: Cut[] = [];
  let at = 0;
  for (let i = 0; i < marks.length; i += 2) {
    const start = marks[i];
    const stop = marks[i + 1];
    if (start?.label !== "wait-start" || stop?.label !== "wait-end" || stop.at < start.at) {
      throw new Error(`marks ${i} and ${i + 1} aren't a wait's start and end`);
    }
    if (start.at > at) {
      cuts.push({ from: at, to: start.at, speed: 1 });
    }
    const length = stop.at - start.at;
    if (length > 0) {
      cuts.push({ from: start.at, to: stop.at, speed: Math.max(1, length / WAIT_SECONDS) });
    }
    at = stop.at;
  }
  if (end > at) {
    cuts.push({ from: at, to: end, speed: 1 });
  }
  return cuts;
}

/** The `ffmpeg` filter graph that cuts, speeds, joins and paints the GIF. */
export function filterGraph(cuts: Cut[], fps: number, width: number, offset = 0): string {
  const round = (n: number) => Number(n.toFixed(3));
  const pieces = cuts.map(
    (c, i) =>
      `[0:v]trim=start=${round(Math.max(0, c.from + offset))}:end=${round(c.to + offset)},` +
      `setpts=(PTS-STARTPTS)/${round(c.speed)}[v${i}]`,
  );
  const inputs = cuts.map((_, i) => `[v${i}]`).join("");
  return [
    ...pieces,
    `${inputs}concat=n=${cuts.length}:v=1:a=0,fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b]`,
    "[a]palettegen=stats_mode=diff[p]",
    "[b][p]paletteuse=dither=bayer:bayer_scale=4",
  ].join(";");
}

function requireFfmpeg(): void {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg isn't on the path. Install it (brew install ffmpeg) and try again.");
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const at = args.indexOf("--offset");
  const offset = at === -1 ? 0 : Number(args[at + 1]);
  if (!Number.isFinite(offset)) {
    throw new Error("--offset takes a number of seconds");
  }
  requireFfmpeg();
  const { video, cuts } = JSON.parse(readFileSync(CUTS_FILE, "utf8")) as {
    video: string;
    cuts: Cut[];
  };
  for (const attempt of ATTEMPTS) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        video,
        "-filter_complex",
        filterGraph(cuts, attempt.fps, attempt.width, offset),
        "-loop",
        "0",
        OUT,
      ],
      { stdio: "inherit" },
    );
    const bytes = statSync(OUT).size;
    const mb = (bytes / 1024 / 1024).toFixed(2);
    console.log(`${OUT}: ${mb} MB at ${attempt.fps} fps, ${attempt.width} px wide`);
    if (bytes <= MAX_BYTES) {
      return;
    }
  }
  throw new Error("Still over 5 MB at the smallest setting. Shorten the demo in the capture.");
}

if (import.meta.main) {
  main();
}
