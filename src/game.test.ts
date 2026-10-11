import { describe, expect, it } from "vitest";
import { game } from "./game";
import type { CascadeDebugApi, CascadeState } from "./game";
import type { InitApi } from "@clockwyrks/simple-2d";

async function setup(): Promise<[CascadeState, CascadeDebugApi]> {
  const api = {
    input: { register: () => {} },
    audio: { define: () => {} },
    diagnostics: { register: () => {} },
  } as unknown as InitApi<CascadeState>;
  return await game.initialize(api);
}

describe("Cascade rules", () => {
  it("deals 52 distinct cards and turns three at a time", async () => {
    const [initial, debug] = await setup();
    const dealt = debug.deal(initial);
    const snap = debug.snapshot(dealt);
    expect(snap.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(snap.stock).toHaveLength(24);
    expect(
      new Set(
        [...snap.stock, ...snap.tableau.flat()].map(
          (c) => `${c.suit}${c.rank}`,
        ),
      ).size,
    ).toBe(52);
    const turned = debug.turnStock(dealt);
    expect(debug.snapshot(turned).wasteSets).toEqual([3]);
    expect(debug.snapshot(turned).wasteVisibleCount).toBe(3);
    expect(debug.snapshot(turned).stock).toHaveLength(21);
  });
  it("accepts alternating runs and flips an exposed card", async () => {
    const [initial, debug] = await setup();
    let s = debug.addCard(initial, "tableau", 0, "spades", 9, false);
    s = debug.addCard(s, "tableau", 0, "hearts", 8, true);
    s = debug.addCard(s, "tableau", 1, "clubs", 9, true);
    const [moved, ok] = debug.move(s, "tableau", 0, 1, "tableau", 1);
    expect(ok).toBe(true);
    expect(debug.snapshot(moved).tableau[0][0].faceUp).toBe(true);
    expect(debug.snapshot(moved).tableau[1].map((c) => c.rank)).toEqual([9, 8]);
    expect(debug.snapshot(s).tableau[0][0].faceUp).toBe(false);
  });
  it("rejects a wrong foundation card and accepts an ace", async () => {
    const [initial, debug] = await setup();
    let s = debug.addCard(initial, "waste", 0, "hearts", 2, true);
    s = debug.addWasteSet(s, 1);
    const [, bad] = debug.move(s, "waste", 0, 0, "foundation", 0);
    expect(bad).toBe(false);
    s = debug.addCard(s, "foundation", 0, "hearts", 1, true);
    const [moved, good] = debug.move(s, "waste", 0, 0, "foundation", 0);
    expect(good).toBe(true);
    expect(debug.snapshot(moved).wasteSets).toEqual([]);
    expect(debug.snapshot(moved).foundations[0].map((c) => c.rank)).toEqual([
      1, 2,
    ]);
  });
  it("drives a stock click through the pointer path", async () => {
    const [initial, debug] = await setup();
    let s = debug.deal(initial);
    s = debug.setScreen(s, "playing");
    s = debug.pointerDown(s, 250, 40);
    s = debug.pointerUp(s, 250, 40);
    expect(debug.snapshot(s).waste).toHaveLength(3);
    expect(debug.snapshot(s).stock).toHaveLength(21);
  });
  it("lifts the front card from the full waste fan", async () => {
    const [initial, debug] = await setup();
    let s = debug.setScreen(initial, "playing");
    s = debug.addCard(s, "waste", 0, "spades", 3, true);
    s = debug.addCard(s, "waste", 0, "hearts", 4, true);
    s = debug.addCard(s, "waste", 0, "clubs", 5, true);
    s = debug.addWasteSet(s, 3);
    s = debug.pointerDown(s, 470, 70);
    expect(debug.snapshot(s).drag?.cards[0].rank).toBe(5);
    expect(debug.snapshot(s).waste).toHaveLength(2);
  });
  it("resets the declared state", async () => {
    const [initial, debug] = await setup();
    const s = debug.reset(debug.deal(initial));
    expect(debug.snapshot(s).stock).toHaveLength(0);
    expect(debug.snapshot(s).screen).toBe("title");
    expect(s.nextId).toBe(1);
  });
});

describe("Cascade timing", () => {
  it("advances a flyer by elapsed seconds and honors painting gate", async () => {
    const [initial, debug] = await setup();
    let s = debug.setScreen(initial, "won");
    s = debug.setLaunching(s, false);
    s = debug.setTrailPainting(s, false);
    s = debug.addFlyer(s, "diamonds", 5, 300, 100, 200, -120);
    const api = {
      input: {
        pointerSamples: () => [],
        pressed: () => false,
      },
      audio: {
        muted: () => false,
        setMuted: () => {},
        play: () => {},
      },
    } as unknown as Parameters<typeof game.update>[1];
    const a = game.update(s, api, 0.5);
    expect(a.simTime).toBe(0.5);
    expect(a.flyers[0].x).toBe(400);
    expect(a.trailStamps).toBe(0);
  });
});
