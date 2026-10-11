# Cascade — Audio

This file defines the ten sounds the game plays and how they are silenced. The
control that silences them is in `specs/screens.md`, and the events they answer
are in `specs/deal.md`, `specs/stock.md`, `specs/tableau.md`,
`specs/foundations.md`, `specs/controls.md`, and `specs/victory.md`.

Audio plays through the Simple 2D engine's cue bus. Define and play exactly
the ten cues in `CUES`, under exactly these names, one per event.

## The cues

| Cue | Constant | Played when |
| --- | --- | --- |
| `deal` | `CUES.deal` | A fresh game is dealt. |
| `turn` | `CUES.turn` | A turn moves cards from the stock onto the waste. |
| `recycle` | `CUES.recycle` | A turn of an empty stock recycles the waste. |
| `lift` | `CUES.lift` | A press lifts a run into the hand. |
| `drop` | `CUES.drop` | A drop is accepted by the pile it resolved to. |
| `reject` | `CUES.reject` | A drop returns its run to the pile it was lifted from. |
| `flip` | `CUES.flip` | A column's newly exposed card is turned face-up. |
| `home` | `CUES.home` | A card is accepted onto a foundation, by any move. |
| `launch` | `CUES.launch` | The cascade launches a card. |
| `win` | `CUES.win` | The game is won. |

Each is a distinct short sound, so the ten events are told apart by ear. Each is
played on the frame its event happens and at most once on that frame; a frame
that raises more than one of them plays each of those once. A drop accepted by a
foundation raises both `drop` and `home`.

## Muting

Muting belongs to the engine, along with the unlock that waits on the player's
first interaction with the page. The HUD's `SOUND` control toggles the engine's
mute bit. While sound is muted every cue is silent and the game stays fully
playable, and turning mute off makes the same cues audible again.
