# Cascade — Game state

`src/game.ts` declares and exports the state the game is written against. This
section is that declaration: write it into `src/game.ts` exactly as it stands
here. The state is a value the engine holds and every frame replaces, so every
field and every array is declared `readonly`: a frame builds the next state from
the current one rather than writing into it, and every reader is handed the state
as `DeepReadonly<CascadeState>` in any case.

```ts
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
```

## The screen

- `screen` — the screen currently shown, one of the four `specs/screens.md`
  defines.
- `menuIndex` — the selected item on the menu the current screen shows, as
  `specs/controls.md` states.
- `titleIndex` — the title entry last confirmed. It is `0` until a title item is
  activated, and `specs/screens.md` states what restores `menuIndex` from it.

## The thirteen piles

`stock`, `waste`, the four entries of `foundations`, and the seven entries of
`tableau` are the thirteen piles. Each holds its cards in order from the pile's
bottom card to its top card, so the last entry is the top card, which in a column
is the card drawn lowest on the table.

- `foundations` always holds `FOUNDATION_COUNT` (`4`) piles and `tableau` always
  holds `TABLEAU_COLUMNS` (`7`), whatever those piles contain.
- `wasteSets` holds the number of cards on each set the stock turned, from the
  oldest set to the newest, as `specs/stock.md` states.

## `CardState`

- `id` — distinct among every entity live at that moment, and kept for as long as
  the card is on the table.
- `suit` — one of the four `specs/deal.md` names.
- `rank` — a whole number from `RANK_MIN` (`1`) to `RANK_MAX` (`13`).
- `faceUp` — whether the card shows its rank and suit rather than its back.

A card's color follows its suit, as `specs/deal.md` states, so it is read from
the suit rather than held.

## The pointer and the hand

- `drag` — the run in hand, or `null` when nothing is held. `cards` holds the run
  from its leading card, so `cards[0]` is the card that was grabbed and the rest
  lie beneath it in order; `fromPile` and `fromIndex` name the pile it was lifted
  from; `x` and `y` are the top-left of `cards[0]`.
- `dropTarget` — the pile a release would land the held run on, or `null`.
- `pointer` — the pointer's position in logical units and whether it is down.
- `lastPress` — the most recent press, its `x` and `y` in logical units and `at`
  the value `simTime` held when it arrived. It is `null` until the first press.

## The faculty gates

Four faculties are gated, each posed by the debugging surface and each on when a
game begins.

- `autoFlip` — whether a column's newly exposed card is turned face-up.
- `winDetect` — whether a completed board is detected as a win.
- `launching` — whether the cascade's launch clock runs and launches cards.
- `trailPainting` — whether a card in flight is stamped onto the painted layer.

## The victory cascade

- `launchClock` — the seconds accumulated toward the next launch.
- `launched` — how many cards the cascade has launched, counted up by one at each
  launch. It is `0` on a fresh deal and after a `reset`.
- `flyers` — every card in flight, in the order they launched. Each carries a
  distinct `id`, its suit and rank, its top-left `x` and `y`, and its velocity
  `vx` and `vy` in logical units per second.
- `cascadeDone` — whether the cascade has finished, which is the flag the
  cascade's own end test sets.
- `trailStamps` — how many stamps the painted layer holds since it was last
  cleared, one per card in flight per frame while `trailPainting` is on.

## The rest

- `nextId` — the id the next card or flyer takes, so no two entities live at one
  moment share one.
- `simTime` — accumulated simulation time, in seconds. Every update adds its
  delta, whatever the screen.
- `muted` — the game's readable copy of the runtime's mute bit, refreshed in
  every update. The runtime owns muting, and this field is what the debugging
  surface reports.

## The contract

The declaration above is what the debug surface reads and poses.

- Keep every field under its declared name, type, and meaning.
- `initialize` builds the whole state in one go, so every field is present by the
  time a frame can observe it, and none of them is optional.
- The state handed to `update` is the whole of the game, and the state `update`
  returns is the whole of the next frame. Every value the game carries from one
  frame to the next lives in it, apart from the drawing resources the painted
  layer needs.
- The state is handed over read-only, as `DeepReadonly<CascadeState>`, to
  `update`, to `render`, to every diagnostic source, and to every operation of the
  debug surface. `update` and the surface's poses return a new `CascadeState`
  built from the one they received; `render`, the sources, and `snapshot` return
  no state.
- Fields you add hold derived data you can rebuild from the declared ones, or the
  drawing resources the painted layer needs. A `reset` restores the declared
  fields to their title-screen values and clears the painted layer, so those
  fields plus that layer are the whole of the game.
