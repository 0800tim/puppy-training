# Accessibility audit, October 2026

Scope: `public/index.html`, `public/app.js`, `public/styles.css` after design pass two (commit 800c1d2). Checked by reading the code and by rendering both themes at phone and desktop sizes. The target is WCAG 2.2 AA for a family app used by children from about eight.

## What was already right

- Real buttons everywhere, with `type="button"`; `aria-pressed` on the slot ticks and the bite meter; `aria-label` on every icon-only control (day arrows, remove-person, gear, close video, me chip).
- The tab bar is a `tablist` with `role="tab"` and `aria-selected`; tabs have visible text, not just icons.
- Every SVG icon from the sprite is `aria-hidden`; the sparkline has an `aria-label`.
- `focus-visible` outlines on buttons, links, inputs, selects and summaries, 3px in the accent colour.
- `prefers-reduced-motion` turns off every animation and transition, including confetti.
- The toast is `role="status"` with `aria-live="polite"`; the video player and the cropper are `role="dialog"` with `aria-modal`; the player closes on Escape and returns focus.
- Text contrast: body `#1c1a33` on white 15:1; muted `#6e6b8a` on white 5.2:1; dark body `#ededf7` on `#1d1b33` 14:1; dark muted `#9d9bbd` on `#1d1b33` 6.4:1. All pass AA.
- Native date, number, tel and select inputs with visible labels; the spelled-out date under each date picker helps everyone.
- `lang="en"`, a viewport that allows zoom, no horizontal scroll at 360px.

## Findings and fixes on this branch

| Finding | Fix |
|---|---|
| Progress bars (hero, week, level, pack, challenge, socialising) were plain `div`s: nothing for a screen reader. | `bar()` renders `role="progressbar"` with `aria-valuenow/min/max` and a label naming whose progress it is. |
| Progress rings showed "1/3" visually with the SVG hidden, but the text was inside the hidden span's sibling without context. | The ring is `role="img"` labelled "n of 3 sessions today"; the visible text is hidden from readers to avoid double reading. |
| The bite meter's five emoji were read out as emoji names ("smiling face with halo") before the word. | Emoji are `aria-hidden`; each button is labelled "Angel, 1 of 5" and the group is labelled "How bitey was she today, 1 to 5". |
| The toilet "undo" was a 20px-high link with no context. | Labelled "Undo this toilet entry", padded to a 32px target. |
| Badge tiles gave no locked or earned state to a reader; greyed-out was visual only. | Each tile is `role="img"` with "<name>, earned" or "<name>, not yet" plus the earn condition. |
| The celebration dialog had no accessible name, did not take focus, and did not close on Escape. | `aria-labelledby`/`aria-describedby`, focus moves to the button, Escape closes, focus returns. |
| The photo cropper was touch and mouse only. | The canvas is focusable with a label; arrows move (Shift for bigger steps), plus and minus zoom, R rotates, Escape cancels; the instructions say so; a visible focus ring in the accent yellow. |
| Hero small text at 75 percent white on the violet gradient was about 3.9:1 against the darker end. | Raised to 85 to 90 percent white: 4.6:1 or better across the gradient. |
| Tabs did not point at their panels. | `aria-controls="p-<tab>"` on each tab. |

## Still open

- **The floating tab bar** overlaps the last 90px of content; `main` has bottom padding to compensate, but a very tall font setting can still hide the last row of the week table under it. A `scroll-padding-bottom` and testing at 200 percent zoom are worth a follow-up.
- **The bite meter emoji** differ per platform (Samsung's shark is not Apple's). Hand-drawn dog faces would fix both the consistency and the reader-naming issue at the root; the labels fix the latter now.
- **Colour alone** signals a person on rings and ticked slots. The slot text ("Morning, done") and the ring label carry the same information, so this passes, but a pattern or initial inside the ring would help colour-blind kids spot their own row faster.
- **Skill pills** ("Open", "Locked", "2/3") rely on colour plus short text; fine, but the lock icon is text ("🔒"), which reads as "locked face" on some readers. Replace with the sprite lock in a follow-up.
- **Haptics** (`navigator.vibrate`) cannot be turned off separately from the phone's own setting. A per-phone toggle in Settings is cheap.
- **Automated checks**: no axe run yet. A headless axe-core pass on each tab in both themes would catch regressions; the Playwright harness in the scratchpad is the place to add it.
