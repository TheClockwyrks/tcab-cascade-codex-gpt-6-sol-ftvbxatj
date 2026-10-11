# Cascade

Cascade is a browser Klondike solitaire played in Draw Three mode. Build each suit from Ace to King on the four foundations. When the final card lands, the foundations spill across the felt in a bouncing cascade.

## Run

```sh
npm ci
npm run dev
```

Open the address Vite prints. To build a static site, run `npm run build` and serve `dist/` from any static host. The game needs no server API or downloaded assets.

## Controls

Drag a face-up card or a valid run to another column or foundation. Double-click a playable card to send it to a foundation. Click the stock to turn three cards; click it again when empty to recycle the waste. On menus, use the pointer or Up/Down (or W/S) and Enter/Space. Escape returns from How to Play. The HUD provides New Game, Menu, and Sound. Touch gestures work the same way as mouse gestures.
