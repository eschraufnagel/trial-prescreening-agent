import { describe, expect, it } from "vitest";
import { cutsFromMarks, filterGraph, WAIT_SECONDS } from "../../scripts/make-demo.js";

describe("the demo's cut list (slice 0016)", () => {
  it("plays the recording as it was, with each wait sped up to a fraction of a second", () => {
    const cuts = cutsFromMarks(
      [
        { at: 4, label: "wait-start" },
        { at: 34, label: "wait-end" },
        { at: 40, label: "wait-start" },
        { at: 46, label: "wait-end" },
      ],
      55,
    );
    expect(cuts).toEqual([
      { from: 0, to: 4, speed: 1 },
      { from: 4, to: 34, speed: 30 / WAIT_SECONDS },
      { from: 34, to: 40, speed: 1 },
      { from: 40, to: 46, speed: 6 / WAIT_SECONDS },
      { from: 46, to: 55, speed: 1 },
    ]);
  });

  it("never slows a wait shorter than its sped-up length", () => {
    const cuts = cutsFromMarks(
      [
        { at: 1, label: "wait-start" },
        { at: 1.2, label: "wait-end" },
      ],
      2,
    );
    expect(cuts[1]?.speed).toBe(1);
  });

  it("refuses marks that aren't start-end pairs", () => {
    expect(() => cutsFromMarks([{ at: 1, label: "wait-end" }], 2)).toThrow();
    expect(() =>
      cutsFromMarks(
        [
          { at: 3, label: "wait-start" },
          { at: 2, label: "wait-end" },
        ],
        4,
      ),
    ).toThrow();
  });
});

describe("the demo's filter graph (slice 0016)", () => {
  it("trims and speeds each cut, joins them, and paints the GIF from its own palette", () => {
    const graph = filterGraph(
      [
        { from: 0, to: 4, speed: 1 },
        { from: 4, to: 34, speed: 50 },
      ],
      12,
      960,
    );
    expect(graph).toBe(
      [
        "[0:v]trim=start=0:end=4,setpts=(PTS-STARTPTS)/1[v0]",
        "[0:v]trim=start=4:end=34,setpts=(PTS-STARTPTS)/50[v1]",
        "[v0][v1]concat=n=2:v=1:a=0,fps=12,scale=960:-1:flags=lanczos,split[a][b]",
        "[a]palettegen=stats_mode=diff[p]",
        "[b][p]paletteuse=dither=bayer:bayer_scale=4",
      ].join(";"),
    );
  });

  it("shifts every cut by the offset, never before the start", () => {
    const graph = filterGraph([{ from: 0, to: 4, speed: 1 }], 10, 800, 0.25);
    expect(graph).toContain("trim=start=0.25:end=4.25");
    expect(filterGraph([{ from: 0, to: 4, speed: 1 }], 10, 800, -0.5)).toContain(
      "trim=start=0:end=3.5",
    );
  });
});
