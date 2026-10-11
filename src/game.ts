import type { Game } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export type Screen = "title" | "howto" | "playing" | "won";
export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type PileKind = "stock" | "waste" | "foundation" | "tableau";
export interface CardState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly faceUp: boolean;
}
export interface DragState {
  readonly cards: readonly CardState[];
  readonly fromPile: "waste" | "foundation" | "tableau";
  readonly fromIndex: number;
  readonly x: number;
  readonly y: number;
}
export interface DropTargetState {
  readonly pile: "foundation" | "tableau";
  readonly index: number;
}
export interface PointerState {
  readonly x: number;
  readonly y: number;
  readonly down: boolean;
}
export interface PressState {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}
export interface FlyerState {
  readonly id: number;
  readonly suit: Suit;
  readonly rank: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}
export interface CascadeState {
  readonly screen: Screen;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly stock: readonly CardState[];
  readonly waste: readonly CardState[];
  readonly wasteSets: readonly number[];
  readonly foundations: readonly (readonly CardState[])[];
  readonly tableau: readonly (readonly CardState[])[];
  readonly drag: DragState | null;
  readonly dropTarget: DropTargetState | null;
  readonly pointer: PointerState;
  readonly lastPress: PressState | null;
  readonly autoFlip: boolean;
  readonly winDetect: boolean;
  readonly launching: boolean;
  readonly trailPainting: boolean;
  readonly launchClock: number;
  readonly launched: number;
  readonly flyers: readonly FlyerState[];
  readonly cascadeDone: boolean;
  readonly trailStamps: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;
}
type View = DeepReadonly<CascadeState>;
type Ref = { pile: PileKind; index: number };
type Rect = { x: number; y: number; w: number; h: number };
export const BACKGROUND = "#102c30";
const cues = new Set<string>();
let trail: HTMLCanvasElement | null = null;
let pendingStamps: FlyerState[] = [];
const cue = (name: string): void => {
  cues.add(name);
};
const last = <T>(items: readonly T[]): T | undefined => items[items.length - 1];
const color = (s: Suit): "red" | "black" =>
  s === "hearts" || s === "diamonds" ? "red" : "black";
const copy = (s: View): CascadeState => ({
  ...s,
  stock: [...s.stock],
  waste: [...s.waste],
  wasteSets: [...s.wasteSets],
  foundations: s.foundations.map((p) => [...p]),
  tableau: s.tableau.map((p) => [...p]),
  flyers: [...s.flyers],
  drag: s.drag ? { ...s.drag, cards: [...s.drag.cards] } : null,
  dropTarget: s.dropTarget ? { ...s.dropTarget } : null,
  pointer: { ...s.pointer },
  lastPress: s.lastPress ? { ...s.lastPress } : null,
});
function fresh(muted = false): CascadeState {
  return {
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    stock: [],
    waste: [],
    wasteSets: [],
    foundations: Array.from({ length: C.FOUNDATION_COUNT }, () => []),
    tableau: Array.from({ length: C.TABLEAU_COLUMNS }, () => []),
    drag: null,
    dropTarget: null,
    pointer: { x: 0, y: 0, down: false },
    lastPress: null,
    autoFlip: true,
    winDetect: true,
    launching: true,
    trailPainting: true,
    launchClock: 0,
    launched: 0,
    flyers: [],
    cascadeDone: false,
    trailStamps: 0,
    nextId: 1,
    simTime: 0,
    muted,
  };
}
function checkRef(r: Ref): void {
  if (
    !Number.isInteger(r.index) ||
    r.index < 0 ||
    r.index >=
      (r.pile === "foundation"
        ? C.FOUNDATION_COUNT
        : r.pile === "tableau"
          ? C.TABLEAU_COLUMNS
          : 1)
  )
    throw new RangeError("Invalid pile index");
}
function pile(s: View, r: Ref): readonly CardState[] {
  checkRef(r);
  return r.pile === "stock"
    ? s.stock
    : r.pile === "waste"
      ? s.waste
      : r.pile === "foundation"
        ? s.foundations[r.index]
        : s.tableau[r.index];
}
function replace(s: View, r: Ref, cards: readonly CardState[]): CascadeState {
  checkRef(r);
  const n = copy(s);
  if (r.pile === "stock") return { ...n, stock: cards };
  if (r.pile === "waste") return { ...n, waste: cards };
  if (r.pile === "foundation")
    return {
      ...n,
      foundations: n.foundations.map((p, i) => (i === r.index ? cards : p)),
    };
  return {
    ...n,
    tableau: n.tableau.map((p, i) => (i === r.index ? cards : p)),
  };
}
const length = (x: number, y: number, a: number, b: number): number =>
  Math.hypot(x - a, y - b);
const inside = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
function rows(cards: readonly CardState[]): number[] {
  const gaps = cards.slice(0, -1);
  const down = gaps.filter((c) => !c.faceUp).length;
  const up = gaps.length - down;
  const natural =
    C.TABLEAU_Y + down * C.FACE_DOWN_OFFSET + up * C.FACE_UP_OFFSET + C.CARD_H;
  const step =
    up && natural > C.COLUMN_BOTTOM_LIMIT
      ? Math.max(
          C.FACE_UP_OFFSET_MIN,
          (C.COLUMN_BOTTOM_LIMIT -
            C.TABLEAU_Y -
            C.CARD_H -
            down * C.FACE_DOWN_OFFSET) /
            up,
        )
      : C.FACE_UP_OFFSET;
  let y = C.TABLEAU_Y;
  return cards.map((card, i) => {
    const here = y;
    if (i < cards.length - 1) y += card.faceUp ? step : C.FACE_DOWN_OFFSET;
    return here;
  });
}
function rect(s: View, r: Ref): Rect {
  checkRef(r);
  const x =
    r.pile === "stock"
      ? C.STOCK_X
      : r.pile === "waste"
        ? C.WASTE_X
        : r.pile === "foundation"
          ? C.FOUNDATION_X[r.index]
          : C.COLUMN_X[r.index];
  const cards = pile(s, r);
  return {
    x,
    y: r.pile === "tableau" ? C.TABLEAU_Y : C.TOP_ROW_Y,
    w: C.CARD_W,
    h:
      r.pile === "tableau" && cards.length
        ? last(rows(cards))! + C.CARD_H - C.TABLEAU_Y
        : C.CARD_H,
  };
}
function menuRect(s: View, i: number): Rect | null {
  const count =
    s.screen === "title"
      ? 2
      : s.screen === "howto"
        ? 1
        : s.screen === "playing"
          ? 3
          : 0;
  if (!Number.isInteger(i) || i < 0 || i >= count) return null;
  return s.screen === "playing"
    ? { x: 238 + i * 155, y: C.HUD_Y + 2, w: 140, h: 32 }
    : s.screen === "howto"
      ? { x: 525, y: 555, w: 230, h: 56 }
      : { x: 490, y: 390 + i * 76, w: 300, h: 60 };
}
function at(s: View, x: number, y: number): Ref | null {
  const all: Ref[] = [
    { pile: "stock", index: 0 },
    { pile: "waste", index: 0 },
    ...Array.from({ length: C.FOUNDATION_COUNT }, (_, index) => ({
      pile: "foundation" as const,
      index,
    })),
    ...Array.from({ length: C.TABLEAU_COLUMNS }, (_, index) => ({
      pile: "tableau" as const,
      index,
    })),
  ];
  return all.find((r) => inside(x, y, rect(s, r))) ?? null;
}
function accepts(s: View, r: Ref, cards: readonly CardState[]): boolean {
  if (!cards.length || r.pile === "stock" || r.pile === "waste") return false;
  for (let i = 1; i < cards.length; i++)
    if (
      !cards[i].faceUp ||
      cards[i - 1].rank !== cards[i].rank + 1 ||
      color(cards[i - 1].suit) === color(cards[i].suit)
    )
      return false;
  const top = last(pile(s, r));
  if (r.pile === "foundation")
    return (
      cards.length === 1 &&
      (!top
        ? cards[0].rank === C.RANK_MIN
        : top.suit === cards[0].suit && cards[0].rank === top.rank + 1)
    );
  return !top
    ? cards[0].rank === C.RANK_MAX
    : top.faceUp &&
        top.rank === cards[0].rank + 1 &&
        color(top.suit) !== color(cards[0].suit);
}
function popWaste(sets: readonly number[]): number[] {
  const n = [...sets];
  if (n.length) {
    n[n.length - 1]--;
    if (last(n) === 0) n.pop();
  }
  return n;
}
function finishMove(
  s: View,
  from: Ref,
  to: Ref,
  cards: readonly CardState[],
): CascadeState {
  let n = replace(s, to, [...pile(s, to), ...cards]);
  if (from.pile === "waste") n = { ...n, wasteSets: popWaste(n.wasteSets) };
  if (from.pile === "tableau" && n.autoFlip) {
    const p = n.tableau[from.index];
    if (p.length && !last(p)!.faceUp) {
      n = replace(n, from, [...p.slice(0, -1), { ...last(p)!, faceUp: true }]);
      cue(C.CUES.flip);
    }
  }
  if (to.pile === "foundation") cue(C.CUES.home);
  if (
    n.winDetect &&
    n.foundations.reduce((a, p) => a + p.length, 0) === C.DECK_SIZE &&
    n.foundations.every((p) => p.length === C.RANK_MAX)
  ) {
    n = {
      ...n,
      screen: "won",
      launchClock: C.LAUNCH_INTERVAL,
      launched: 0,
      cascadeDone: false,
    };
    cue(C.CUES.win);
  }
  return n;
}
function move(
  s: View,
  from: Ref,
  row: number,
  to: Ref,
): [CascadeState, boolean] {
  const source = pile(s, from);
  pile(s, to);
  if (!Number.isInteger(row) || row < 0 || row >= source.length)
    throw new RangeError("Invalid row");
  if (
    from.pile === "stock" ||
    (from.pile === "waste" &&
      (!s.wasteSets.length || row !== source.length - 1)) ||
    (from.pile === "foundation" && row !== source.length - 1) ||
    (from.pile === "tableau" && !source[row].faceUp)
  )
    return [copy(s), false];
  const cards = source.slice(row);
  const base = replace(s, from, source.slice(0, row));
  if (
    (from.pile === to.pile && from.index === to.index) ||
    !accepts(base, to, cards)
  )
    return [copy(s), false];
  return [finishMove(base, from, to, cards), true];
}
function autoMove(s: View, r: Ref): [CascadeState, boolean] {
  const p = pile(s, r);
  if (
    (r.pile !== "waste" && r.pile !== "tableau") ||
    !p.length ||
    !last(p)!.faceUp
  )
    return [copy(s), false];
  for (let i = 0; i < C.FOUNDATION_COUNT; i++) {
    const t = { pile: "foundation" as const, index: i };
    if (accepts(s, t, [last(p)!])) return move(s, r, p.length - 1, t);
  }
  return [copy(s), false];
}
function clearTrail(): void {
  trail?.getContext("2d")?.clearRect(0, 0, C.STAGE_W, C.STAGE_H);
  pendingStamps = [];
}
function deal(s: View): CascadeState {
  const deck: CardState[] = [];
  let next = s.nextId;
  for (const suit of C.SUITS)
    for (let rank = C.RANK_MIN; rank <= C.RANK_MAX; rank++)
      deck.push({ id: next++, suit, rank, faceUp: false });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tableau: CardState[][] = [];
  for (let i = 0; i < C.TABLEAU_COLUMNS; i++) {
    const p = deck.splice(0, i + 1);
    p[p.length - 1] = { ...last(p)!, faceUp: true };
    tableau.push(p);
  }
  clearTrail();
  cue(C.CUES.deal);
  return {
    ...copy(s),
    stock: deck,
    waste: [],
    wasteSets: [],
    foundations: Array.from({ length: C.FOUNDATION_COUNT }, () => []),
    tableau,
    drag: null,
    dropTarget: null,
    launchClock: 0,
    launched: 0,
    flyers: [],
    cascadeDone: false,
    trailStamps: 0,
    nextId: next,
  };
}
function turnStock(s: View): CascadeState {
  if (s.stock.length) {
    const stock = [...s.stock],
      cards: CardState[] = [];
    for (let i = 0; i < C.TURN_COUNT && stock.length; i++)
      cards.push({ ...stock.pop()!, faceUp: true });
    cue(C.CUES.turn);
    return {
      ...copy(s),
      stock,
      waste: [...s.waste, ...cards],
      wasteSets: [...s.wasteSets, cards.length],
    };
  }
  if (s.waste.length) {
    cue(C.CUES.recycle);
    return {
      ...copy(s),
      stock: [...s.waste].reverse().map((c) => ({ ...c, faceUp: false })),
      waste: [],
      wasteSets: [],
    };
  }
  return copy(s);
}
function target(s: View, d: DragState | null): DropTargetState | null {
  if (!d) return null;
  const r = at(s, d.x + C.CARD_W / 2, d.y + C.CARD_H / 2);
  return r &&
    (r.pile === "foundation" || r.pile === "tableau") &&
    !(r.pile === d.fromPile && r.index === d.fromIndex) &&
    accepts(s, r, d.cards)
    ? { pile: r.pile, index: r.index }
    : null;
}
function menuAt(s: View, x: number, y: number): number {
  for (let i = 0; i < 3; i++) {
    const r = menuRect(s, i);
    if (r && inside(x, y, r)) return i;
  }
  return -1;
}
function activate(s: View, i: number): CascadeState {
  if (s.screen === "title") {
    if (i === 0)
      return { ...deal(s), screen: "playing", menuIndex: 0, titleIndex: 0 };
    if (i === 1)
      return { ...copy(s), screen: "howto", menuIndex: 0, titleIndex: 1 };
  }
  if (s.screen === "howto")
    return { ...copy(s), screen: "title", menuIndex: s.titleIndex };
  if (s.screen === "playing") {
    if (i === 0) return { ...deal(s), menuIndex: 0 };
    if (i === 1)
      return { ...copy(s), screen: "title", menuIndex: s.titleIndex };
    if (i === 2) return { ...copy(s), muted: !s.muted };
  }
  return copy(s);
}
function pointerDown(s: View, x: number, y: number): CascadeState {
  let n: CascadeState = {
    ...copy(s),
    pointer: { x, y, down: true },
    lastPress: { x, y, at: s.simTime },
  };
  if (s.screen === "won")
    return { ...deal(n), screen: "playing", menuIndex: 0 };
  const mi = menuAt(s, x, y);
  if (mi >= 0) n = { ...n, menuIndex: mi };
  if (s.screen !== "playing") return n;
  const shownWaste = Math.min(last(s.wasteSets) ?? 0, s.waste.length);
  const wasteTopX = C.WASTE_X + Math.max(0, shownWaste - 1) * C.WASTE_FAN;
  const r =
    shownWaste &&
    inside(x, y, { x: wasteTopX, y: C.TOP_ROW_Y, w: C.CARD_W, h: C.CARD_H })
      ? { pile: "waste" as const, index: 0 }
      : at(s, x, y);
  const p = r ? pile(s, r) : [];
  let row = -1;
  if (r?.pile === "waste" && s.wasteSets.length && p.length) {
    const shown = Math.min(last(s.wasteSets)!, p.length);
    const base = p.length - shown;
    for (let i = shown - 1; i >= 0; i--)
      if (
        inside(x, y, {
          x: C.WASTE_X + i * C.WASTE_FAN,
          y: C.TOP_ROW_Y,
          w: C.CARD_W,
          h: C.CARD_H,
        })
      ) {
        row = base + i;
        break;
      }
    if (row !== p.length - 1) row = -1;
  } else if (r?.pile === "foundation" && p.length) row = p.length - 1;
  else if (r?.pile === "tableau" && p.length) {
    const ys = rows(p);
    for (let i = p.length - 1; i >= 0; i--)
      if (
        inside(x, y, {
          x: C.COLUMN_X[r.index],
          y: ys[i],
          w: C.CARD_W,
          h: C.CARD_H,
        })
      ) {
        row = i;
        break;
      }
  }
  const playable =
    r &&
    (r.pile === "waste" || r.pile === "tableau") &&
    row === p.length - 1 &&
    row >= 0 &&
    p[row].faceUp;
  const previous = s.lastPress;
  if (
    playable &&
    previous &&
    s.simTime - previous.at <= C.DOUBLE_CLICK_WINDOW &&
    length(x, y, previous.x, previous.y) <= C.DOUBLE_CLICK_SLOP
  ) {
    const [m] = autoMove(n, r);
    return m;
  }
  if (!r || row < 0 || !p[row]?.faceUp) return n;
  const cardX =
    r.pile === "waste"
      ? C.WASTE_X +
        (Math.min(last(s.wasteSets) ?? 0, p.length) - 1) * C.WASTE_FAN
      : r.pile === "foundation"
        ? C.FOUNDATION_X[r.index]
        : C.COLUMN_X[r.index];
  const cardY = r.pile === "tableau" ? rows(p)[row] : C.TOP_ROW_Y;
  const cards = p.slice(row);
  n = replace(n, r, p.slice(0, row));
  const drag: DragState = {
    cards,
    fromPile: r.pile as DragState["fromPile"],
    fromIndex: r.index,
    x: cardX,
    y: cardY,
  };
  cue(C.CUES.lift);
  return { ...n, drag, dropTarget: target(n, drag) };
}
function pointerMove(s: View, x: number, y: number): CascadeState {
  let n = { ...copy(s), pointer: { ...s.pointer, x, y } };
  if (s.drag) {
    const dx = x - s.pointer.x,
      dy = y - s.pointer.y;
    const drag = { ...s.drag, x: s.drag.x + dx, y: s.drag.y + dy };
    n = { ...n, drag, dropTarget: target(n, drag) };
  }
  const mi = menuAt(n, x, y);
  if (mi >= 0) n = { ...n, menuIndex: mi };
  return n;
}
function pointerUp(s: View, x: number, y: number): CascadeState {
  let n = pointerMove(s, x, y);
  n = { ...n, pointer: { x, y, down: false } };
  if (s.screen === "won") return n;
  const press = s.lastPress;
  if (press) {
    const a = menuAt(s, press.x, press.y),
      b = menuAt(s, x, y);
    if (a >= 0 && a === b) {
      n = activate(n, b);
      return {
        ...n,
        drag: null,
        dropTarget: null,
        pointer: { x, y, down: false },
      };
    }
  }
  if (s.screen !== "playing") return n;
  const click = !!press && length(x, y, press.x, press.y) <= C.DRAG_THRESHOLD;
  if (s.drag) {
    const from = { pile: s.drag.fromPile, index: s.drag.fromIndex };
    if (!click && n.dropTarget) {
      n = finishMove(n, from, n.dropTarget, s.drag.cards);
      cue(C.CUES.drop);
    } else {
      n = replace(n, from, [...pile(n, from), ...s.drag.cards]);
      if (!click) cue(C.CUES.reject);
    }
    n = { ...n, drag: null, dropTarget: null };
  }
  if (
    click &&
    press &&
    inside(press.x, press.y, rect(n, { pile: "stock", index: 0 }))
  )
    n = turnStock(n);
  return n;
}
function drawVx(): number {
  return (
    (C.LAUNCH_VX_MIN + Math.random() * (C.LAUNCH_VX_MAX - C.LAUNCH_VX_MIN)) *
    (Math.random() < 0.5 ? -1 : 1)
  );
}
function step(s: View, dt: number): CascadeState {
  let n = { ...copy(s), simTime: s.simTime + dt };
  if (n.screen !== "won") return n;
  const flyers: FlyerState[] = [];
  for (const f of n.flyers) {
    let vy = f.vy + C.GRAVITY * dt,
      y = f.y + vy * dt;
    const x = f.x + f.vx * dt;
    if (y >= C.FLOOR_Y && vy > 0) {
      vy = -vy * C.BOUNCE_DAMP;
      y = C.FLOOR_Y;
    }
    const next = { ...f, x, y, vy };
    if (n.trailPainting) {
      pendingStamps.push(next);
      n = { ...n, trailStamps: n.trailStamps + 1 };
    }
    if (x + C.CARD_W >= 0 && x <= C.STAGE_W) flyers.push(next);
  }
  n = { ...n, flyers };
  if (n.launching) {
    let clock = n.launchClock + dt;
    let launched = n.launched;
    const foundations = n.foundations.map((p) => [...p]);
    while (clock >= C.LAUNCH_INTERVAL && launched < C.DECK_SIZE) {
      const index = launched % C.FOUNDATION_COUNT;
      const p = foundations[index];
      if (p.length) {
        const card = p.pop()!;
        flyers.push({
          id: card.id,
          suit: card.suit,
          rank: card.rank,
          x: C.FOUNDATION_X[index],
          y: C.TOP_ROW_Y,
          vx: drawVx(),
          vy: C.LAUNCH_VY,
        });
        cue(C.CUES.launch);
      }
      launched++;
      clock -= C.LAUNCH_INTERVAL;
    }
    n = { ...n, launchClock: clock, launched, foundations, flyers };
  }
  return {
    ...n,
    cascadeDone: n.launched >= C.DECK_SIZE && n.flyers.length === 0,
  };
}
export interface CascadeDebugApi {
  readonly version: number;
  reset(s: View): CascadeState;
  snapshot(s: View): ReturnType<typeof snapshot>;
  reconcile(s: View): CascadeState;
  menuItemRect(s: View, index: number): Rect | null;
  setScreen(s: View, screen: Screen): CascadeState;
  setMenuIndex(s: View, index: number): CascadeState;
  setTitleIndex(s: View, index: number): CascadeState;
  addCard(
    s: View,
    pile: PileKind,
    index: number,
    suit: Suit,
    rank: number,
    faceUp: boolean,
  ): CascadeState;
  removeCard(s: View, id: number): CascadeState;
  setCardFaceUp(s: View, id: number, faceUp: boolean): CascadeState;
  clearPile(s: View, pile: PileKind, index: number): CascadeState;
  clearTable(s: View): CascadeState;
  addWasteSet(s: View, count: number): CascadeState;
  clearWasteSets(s: View): CascadeState;
  deal(s: View): CascadeState;
  turnStock(s: View): CascadeState;
  move(
    s: View,
    fromPile: PileKind,
    fromIndex: number,
    fromRow: number,
    toPile: PileKind,
    toIndex: number,
  ): [CascadeState, boolean];
  autoMove(s: View, pile: PileKind, index: number): [CascadeState, boolean];
  pointerDown(s: View, x: number, y: number): CascadeState;
  pointerMove(s: View, x: number, y: number): CascadeState;
  pointerUp(s: View, x: number, y: number): CascadeState;
  setAutoFlip(s: View, enabled: boolean): CascadeState;
  setWinDetect(s: View, enabled: boolean): CascadeState;
  setLaunching(s: View, enabled: boolean): CascadeState;
  setTrailPainting(s: View, enabled: boolean): CascadeState;
  addFlyer(
    s: View,
    suit: Suit,
    rank: number,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): CascadeState;
  setFlyerPosition(s: View, id: number, x: number, y: number): CascadeState;
  setFlyerVelocity(s: View, id: number, vx: number, vy: number): CascadeState;
  removeFlyer(s: View, id: number): CascadeState;
  clearFlyers(s: View): CascadeState;
  setLaunchClock(s: View, seconds: number): CascadeState;
  clearTrail(s: View): CascadeState;
  drawLaunchVx(s: View): number;
}
function located(s: View, id: number): { ref: Ref; row: number } | null {
  const refs: Ref[] = [
    { pile: "stock", index: 0 },
    { pile: "waste", index: 0 },
    ...Array.from({ length: C.FOUNDATION_COUNT }, (_, index) => ({
      pile: "foundation" as const,
      index,
    })),
    ...Array.from({ length: C.TABLEAU_COLUMNS }, (_, index) => ({
      pile: "tableau" as const,
      index,
    })),
  ];
  for (const ref of refs) {
    const row = pile(s, ref).findIndex((c) => c.id === id);
    if (row >= 0) return { ref, row };
  }
  return null;
}
function validCard(suit: Suit, rank: number): void {
  if (
    !C.SUITS.includes(suit) ||
    !Number.isInteger(rank) ||
    rank < C.RANK_MIN ||
    rank > C.RANK_MAX
  )
    throw new RangeError("Invalid card");
}
function snapshot(s: View) {
  const card = (c: CardState) => ({ ...c, color: color(c.suit) });
  return {
    version: C.CASCADE_DEBUG_VERSION,
    screen: s.screen,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    dealMode: C.DEAL_MODE,
    turnCount: C.TURN_COUNT,
    dealModeLabel: C.DEAL_MODE_LABEL,
    muted: s.muted,
    autoFlip: s.autoFlip,
    winDetect: s.winDetect,
    launching: s.launching,
    trailPainting: s.trailPainting,
    stock: s.stock.map(card),
    waste: s.waste.map(card),
    wasteSets: [...s.wasteSets],
    wasteVisibleCount: last(s.wasteSets) ?? 0,
    foundations: s.foundations.map((p) => p.map(card)),
    tableau: s.tableau.map((p) => p.map(card)),
    drag: s.drag ? { ...s.drag, cards: s.drag.cards.map(card) } : null,
    dropTarget: target(s, s.drag),
    pointer: { ...s.pointer },
    lastPress: s.lastPress ? { ...s.lastPress } : null,
    launchClock: s.launchClock,
    launched: s.launched,
    flyers: s.flyers.map((f) => ({ ...f })),
    cascadeDone: s.cascadeDone,
    trailStamps: s.trailStamps,
    simTime: s.simTime,
  };
}
const debug: CascadeDebugApi = {
  version: C.CASCADE_DEBUG_VERSION,
  reset: (s) => {
    clearTrail();
    return fresh(s.muted);
  },
  snapshot,
  reconcile: (s) => ({ ...copy(s), dropTarget: target(s, s.drag) }),
  menuItemRect: menuRect,
  setScreen: (s, screen) => ({ ...copy(s), screen }),
  setMenuIndex: (s, menuIndex) => ({ ...copy(s), menuIndex }),
  setTitleIndex: (s, titleIndex) => ({ ...copy(s), titleIndex }),
  addCard: (s, p, index, suit, rank, faceUp) => {
    validCard(suit, rank);
    const ref = { pile: p, index };
    return {
      ...replace(s, ref, [
        ...pile(s, ref),
        { id: s.nextId, suit, rank, faceUp },
      ]),
      nextId: s.nextId + 1,
    };
  },
  removeCard: (s, id) => {
    const l = located(s, id);
    if (!l) throw new Error("Unknown card");
    const cards = pile(s, l.ref);
    let n = replace(
      s,
      l.ref,
      cards.filter((c) => c.id !== id),
    );
    if (l.ref.pile === "waste") n = { ...n, wasteSets: popWaste(n.wasteSets) };
    return n;
  },
  setCardFaceUp: (s, id, faceUp) => {
    const l = located(s, id);
    if (!l) throw new Error("Unknown card");
    return replace(
      s,
      l.ref,
      pile(s, l.ref).map((c) => (c.id === id ? { ...c, faceUp } : c)),
    );
  },
  clearPile: (s, p, index) => {
    const n = replace(s, { pile: p, index }, []);
    return p === "waste" ? { ...n, wasteSets: [] } : n;
  },
  clearTable: (s) => ({
    ...copy(s),
    stock: [],
    waste: [],
    wasteSets: [],
    foundations: Array.from({ length: C.FOUNDATION_COUNT }, () => []),
    tableau: Array.from({ length: C.TABLEAU_COLUMNS }, () => []),
    drag: null,
    dropTarget: null,
  }),
  addWasteSet: (s, count) => {
    if (!Number.isInteger(count) || count < 0)
      throw new RangeError("Invalid count");
    return { ...copy(s), wasteSets: [...s.wasteSets, count] };
  },
  clearWasteSets: (s) => ({ ...copy(s), wasteSets: [] }),
  deal,
  turnStock,
  move: (s, p, i, row, q, j) =>
    move(s, { pile: p, index: i }, row, { pile: q, index: j }),
  autoMove: (s, p, i) => autoMove(s, { pile: p, index: i }),
  pointerDown,
  pointerMove,
  pointerUp,
  setAutoFlip: (s, autoFlip) => ({ ...copy(s), autoFlip }),
  setWinDetect: (s, winDetect) => ({ ...copy(s), winDetect }),
  setLaunching: (s, launching) => ({ ...copy(s), launching }),
  setTrailPainting: (s, trailPainting) => ({ ...copy(s), trailPainting }),
  addFlyer: (s, suit, rank, x, y, vx, vy) => {
    validCard(suit, rank);
    return {
      ...copy(s),
      flyers: [...s.flyers, { id: s.nextId, suit, rank, x, y, vx, vy }],
      nextId: s.nextId + 1,
    };
  },
  setFlyerPosition: (s, id, x, y) => {
    if (!s.flyers.some((f) => f.id === id)) throw new Error("Unknown flyer");
    return {
      ...copy(s),
      flyers: s.flyers.map((f) => (f.id === id ? { ...f, x, y } : f)),
    };
  },
  setFlyerVelocity: (s, id, vx, vy) => {
    if (!s.flyers.some((f) => f.id === id)) throw new Error("Unknown flyer");
    return {
      ...copy(s),
      flyers: s.flyers.map((f) => (f.id === id ? { ...f, vx, vy } : f)),
    };
  },
  removeFlyer: (s, id) => {
    if (!s.flyers.some((f) => f.id === id)) throw new Error("Unknown flyer");
    return { ...copy(s), flyers: s.flyers.filter((f) => f.id !== id) };
  },
  clearFlyers: (s) => ({ ...copy(s), flyers: [] }),
  setLaunchClock: (s, launchClock) => ({ ...copy(s), launchClock }),
  clearTrail: (s) => {
    clearTrail();
    return { ...copy(s), trailStamps: 0 };
  },
  drawLaunchVx: () => drawVx(),
};
const symbol: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};
function round(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 10,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function card(
  ctx: CanvasRenderingContext2D,
  c: CardState,
  x: number,
  y: number,
  lift = false,
): void {
  ctx.save();
  if (lift) {
    ctx.shadowColor = "#020e13";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 10;
  }
  round(ctx, x, y, C.CARD_W, C.CARD_H);
  ctx.fillStyle = c.faceUp ? "#f8f4e9" : "#143e50";
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = 2;
  ctx.strokeStyle = c.faceUp ? "#dacfb6" : "#72abb2";
  ctx.stroke();
  if (c.faceUp) {
    const ink = color(c.suit) === "red" ? "#bd4b4b" : "#22343a";
    ctx.fillStyle = ink;
    ctx.textAlign = "left";
    ctx.font = "bold 23px Georgia";
    const rank =
      c.rank === 1
        ? "A"
        : c.rank === 11
          ? "J"
          : c.rank === 12
            ? "Q"
            : c.rank === 13
              ? "K"
              : String(c.rank);
    ctx.fillText(rank, 10 + x, y + 29);
    ctx.font = "22px Georgia";
    ctx.fillText(symbol[c.suit], 10 + x, y + 54);
    ctx.textAlign = "center";
    ctx.font = "54px Georgia";
    ctx.fillText(symbol[c.suit], x + C.CARD_W / 2, y + 102);
  } else {
    round(ctx, x + 8, y + 8, C.CARD_W - 16, C.CARD_H - 16, 5);
    ctx.strokeStyle = "#a8c7c7";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#2d6572";
    round(ctx, x + 14, y + 14, C.CARD_W - 28, C.CARD_H - 28, 3);
    ctx.fill();
    ctx.fillStyle = "#8bb5b8";
    ctx.textAlign = "center";
    ctx.font = "50px Georgia";
    ctx.fillText("❖", x + C.CARD_W / 2, y + 88);
  }
  ctx.restore();
}
function slot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  highlight = false,
): void {
  round(ctx, x, y, C.CARD_W, C.CARD_H);
  ctx.fillStyle = highlight ? "#577d73" : "#193c40";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = highlight ? "#e6d699" : "#47706c";
  ctx.stroke();
  ctx.fillStyle = highlight ? "#fff1b3" : "#6b9992";
  ctx.textAlign = "center";
  ctx.font = "bold 14px Arial";
  ctx.fillText(label, x + C.CARD_W / 2, y + C.CARD_H / 2 + 5);
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  colorValue = "#eceddb",
  align: CanvasTextAlign = "center",
): void {
  ctx.fillStyle = colorValue;
  ctx.textAlign = align;
  ctx.font = `bold ${size}px Arial`;
  ctx.fillText(value, x, y);
}
function drawTable(ctx: CanvasRenderingContext2D, s: View): void {
  ctx.fillStyle = "#174344";
  ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  ctx.fillStyle = "#0f3337";
  ctx.fillRect(0, C.HUD_Y, C.STAGE_W, C.HUD_H);
  text(ctx, "C A S C A D E", 48, 63, 20, "#b8cdb8", "left");
  text(ctx, "SOLITAIRE", 48, 88, 13, "#91aaa2", "left");
  const stock = last(s.stock);
  if (stock) card(ctx, stock, C.STOCK_X, C.TOP_ROW_Y);
  else slot(ctx, C.STOCK_X, C.TOP_ROW_Y, "↻");
  const visible = Math.min(last(s.wasteSets) ?? 0, s.waste.length);
  if (visible)
    for (let i = 0; i < visible; i++)
      card(
        ctx,
        s.waste[s.waste.length - visible + i],
        C.WASTE_X + i * C.WASTE_FAN,
        C.TOP_ROW_Y,
      );
  else slot(ctx, C.WASTE_X, C.TOP_ROW_Y, "WASTE");
  s.foundations.forEach((p, i) => {
    const x = C.FOUNDATION_X[i];
    const top = last(p);
    if (top) card(ctx, top, x, C.TOP_ROW_Y);
    else
      slot(
        ctx,
        x,
        C.TOP_ROW_Y,
        "A",
        s.dropTarget?.pile === "foundation" && s.dropTarget.index === i,
      );
    if (
      top &&
      s.dropTarget?.pile === "foundation" &&
      s.dropTarget.index === i
    ) {
      ctx.strokeStyle = "#f3dc90";
      ctx.lineWidth = 4;
      round(ctx, x, C.TOP_ROW_Y, C.CARD_W, C.CARD_H);
      ctx.stroke();
    }
  });
  s.tableau.forEach((p, i) => {
    const x = C.COLUMN_X[i],
      ys = rows(p);
    if (!p.length)
      slot(
        ctx,
        x,
        C.TABLEAU_Y,
        "K",
        s.dropTarget?.pile === "tableau" && s.dropTarget.index === i,
      );
    else p.forEach((c, j) => card(ctx, c, x, ys[j]));
    if (
      p.length &&
      s.dropTarget?.pile === "tableau" &&
      s.dropTarget.index === i
    ) {
      ctx.strokeStyle = "#f3dc90";
      ctx.lineWidth = 4;
      round(ctx, x, last(ys)!, C.CARD_W, C.CARD_H);
      ctx.stroke();
    }
  });
  if (s.drag)
    s.drag.cards.forEach((c, i) =>
      card(ctx, c, s.drag!.x, s.drag!.y + i * C.FACE_UP_OFFSET, true),
    );
  ctx.fillStyle = "#102f33";
  ctx.fillRect(0, C.HUD_Y, C.STAGE_W, C.HUD_H);
  C.HUD_ITEMS.forEach((label, i) => {
    const r = menuRect(s, i)!;
    if (s.menuIndex === i) {
      round(ctx, r.x, r.y, r.w, r.h, 5);
      ctx.fillStyle = "#366769";
      ctx.fill();
    }
    text(ctx, label, r.x + r.w / 2, r.y + 22, 16);
  });
  text(ctx, C.DEAL_MODE_LABEL, 1020, 704, 15, "#b7cfc2");
}
function paintTrail(ctx: CanvasRenderingContext2D): void {
  if (!trail && typeof document !== "undefined") {
    trail = document.createElement("canvas");
    trail.width = C.STAGE_W;
    trail.height = C.STAGE_H;
  }
  const t = trail?.getContext("2d");
  if (t) {
    for (const f of pendingStamps) card(t, { ...f, faceUp: true }, f.x, f.y);
    pendingStamps = [];
    ctx.drawImage(trail!, 0, 0);
  }
}
export const game: Game<CascadeState, CascadeDebugApi> = {
  initialize(api) {
    for (const [name, keys] of Object.entries(C.MENU_BINDINGS))
      api.input.register(name, { keys: [...keys] });
    Object.values(C.CUES).forEach((name, i) =>
      api.audio.define(name, {
        wave: i % 3 === 0 ? "triangle" : i % 3 === 1 ? "sine" : "square",
        freq: 240 + i * 61,
        freqTo: 350 + i * 39,
        durationMs: 70 + i * 12,
        gain: 0.1,
      }),
    );
    api.diagnostics.register("screen", (s) => s.screen);
    api.diagnostics.register("deal mode", () => C.DEAL_MODE);
    api.diagnostics.register("stock", (s) => s.stock.length);
    api.diagnostics.register("waste", (s) => s.waste.length);
    for (let i = 0; i < C.FOUNDATION_COUNT; i++)
      api.diagnostics.register(
        `foundation ${i}`,
        (s) => s.foundations[i].length,
      );
    for (let i = 0; i < C.TABLEAU_COLUMNS; i++)
      api.diagnostics.register(`column ${i}`, (s) => s.tableau[i].length);
    api.diagnostics.register("in hand", (s) => s.drag?.cards.length ?? 0);
    api.diagnostics.register("launched", (s) => s.launched);
    api.diagnostics.register("in flight", (s) => s.flyers.length);
    return [fresh(), debug];
  },
  update(s, api, dt) {
    let n = copy(s);
    for (const sample of api.input.pointerSamples()) {
      if (!sample.primary) continue;
      n =
        sample.type === "down"
          ? pointerDown(n, sample.x, sample.y)
          : sample.type === "up"
            ? pointerUp(n, sample.x, sample.y)
            : pointerMove(n, sample.x, sample.y);
    }
    const up = api.input.pressed(C.MENU_UP),
      down = api.input.pressed(C.MENU_DOWN),
      confirm = api.input.pressed(C.MENU_CONFIRM),
      back = api.input.pressed(C.MENU_BACK);
    if (n.screen !== "won") {
      const count = n.screen === "title" ? 2 : n.screen === "howto" ? 1 : 3;
      if (up) n = { ...n, menuIndex: (n.menuIndex + count - 1) % count };
      else if (down) n = { ...n, menuIndex: (n.menuIndex + 1) % count };
      else if (confirm) n = activate(n, n.menuIndex);
      else if (back && n.screen === "howto") n = activate(n, 0);
    }
    if (n.muted !== api.audio.muted()) api.audio.setMuted(n.muted);
    n = step(n, dt);
    n = { ...n, muted: api.audio.muted() };
    for (const name of cues) api.audio.play(name);
    cues.clear();
    return n;
  },
  render(s, api) {
    const ctx = api.ctx;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
    if (s.screen === "playing") drawTable(ctx, s);
    else if (s.screen === "won") {
      ctx.fillStyle = "#174344";
      ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
      paintTrail(ctx);
      s.foundations.forEach((p, i) => {
        const c = last(p);
        if (c) card(ctx, c, C.FOUNDATION_X[i], C.TOP_ROW_Y);
      });
      s.flyers.forEach((f) => card(ctx, { ...f, faceUp: true }, f.x, f.y));
      if (s.cascadeDone) {
        ctx.fillStyle = "#112e32cc";
        ctx.fillRect(0, 250, C.STAGE_W, 190);
        text(ctx, C.WIN_TEXT, 640, 360, 82);
        text(ctx, "TOUCH ANYWHERE TO DEAL AGAIN", 640, 407, 18, "#d5c994");
      }
    } else {
      ctx.fillStyle = "#174344";
      ctx.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
      ctx.fillStyle = "#11373a";
      ctx.fillRect(160, 0, 960, C.STAGE_H);
      text(ctx, C.TITLE_TEXT, 640, 245, 92);
      text(ctx, C.TAGLINE_TEXT, 640, 286, 19, "#b6ccc0");
      if (s.screen === "title") {
        C.TITLE_ITEMS.forEach((label, i) => {
          const r = menuRect(s, i)!;
          round(ctx, r.x, r.y, r.w, r.h, 10);
          ctx.fillStyle = s.menuIndex === i ? "#d2be7d" : "#315e60";
          ctx.fill();
          text(
            ctx,
            label,
            640,
            r.y + 39,
            23,
            s.menuIndex === i ? "#17383b" : "#f3efdf",
          );
        });
        text(ctx, C.DEAL_MODE_LABEL, 640, 600, 17, "#c9d4b5");
      } else {
        const lines = [
          "BUILD EACH FOUNDATION FROM ACE TO KING.",
          "BUILD DOWN IN ALTERNATING COLORS.",
          "ONLY A KING FILLS AN EMPTY COLUMN.",
          "TURN THE STOCK TO REVEAL THE WASTE.",
          "DRAG CARDS TO MOVE THEM. DOUBLE-CLICK TO SEND HOME.",
        ];
        lines.forEach((line, i) => text(ctx, line, 640, 345 + i * 43, 20));
        const r = menuRect(s, 0)!;
        round(ctx, r.x, r.y, r.w, r.h);
        ctx.fillStyle = "#d2be7d";
        ctx.fill();
        text(ctx, C.HOWTO_BACK_LABEL, 640, r.y + 37, 23, "#17383b");
      }
    }
  },
};
