# Layout app — changes, 17 September 2026

Lazar's feedback list, worked through. Everything below is in `site/planner/`
unless noted.

## The picture on the front page
A new one: a big open dining / family room with **six downlights** on an even
grid, warm pools under each, drawn in the planner's own plan language. Replaces
the old single living room. (`data/art.js` → `ART.hero`.)

## The guide
- **Rule 04**: the dashed comparison cone now opens to about **150°**, so the
  difference against the 60° low glare is obvious. Diagram only — the fitting's
  printed spec and every calculation still use its real 100°.

## Setting the scale (step 02)
- **The two points are placed for you** the moment a plan loads. Step 02 opens
  itself and the tool is already armed.
- **The single garage door is gone.** The standard internal door stays, plus a
  kitchen bench and "something else".
- **You are asked the real length first**, before the points go on the plan.
- **Commas are accepted** — `3,6` works the same as `3.6`.
- **"The longer the thing you measure, the more accurate the whole plan."** now
  says so on screen.
- **Fixed:** clicking anywhere on the plan used to start a brand new
  measurement line from that spot, which is why the red points kept jumping.
  Only the two points move now; clicking elsewhere pans the plan.

## Rooms (step 03)
- **A finished room disappears from the working list** and drops into
  **Rooms finished** below. One place per room, so nothing is listed twice.
- **"What this room gets"** is gone — it explained a choice the app makes for
  you, above the button you came to press.
- The room chips row is gone too; it was a third copy of the same list.
- **Each finished room can be changed or removed on the spot** — a room-type
  dropdown and a × on every row. No more deleting a room and drawing it again
  just to fix the type.
- The room picker and the **Drag a box around the room** button stay pinned at
  the top of the step, so the next room is always one press away.

## Bathrooms and laundries
- **A bathroom is two lights**, whatever it measures.
- **The exhaust is one tick box** — "Add an exhaust fan", on top of the lights.
  The old three-way question is gone, including "exhaust fan with a light in
  it", which used to take the room's downlights away.
- **A laundry is lights only** — no exhaust question at all.

## Extra lights (step 04)
- Three paragraphs of preamble cut to one line, and the specials copy shortened
  throughout.
- **A Done button** on the instruction card, instead of expecting people to
  know about Esc.
- **"In a block" and "one at a time" are gone.** A group of extras is a line
  with a direction: **Across →** or **Up and down ↓**. They all land in one go.
- **Star lights** are placed as a group and move as one, and their dots are
  smaller again so a run reads as a string of stars, not a row of downlights.
- **Wall lights** are aimed with a **green arrow** rather than a second dot —
  two dots the same size read as two lights and people dragged the wrong one.

## Checked
397 of 404 automated checks pass (`/layout-app/?qa=1`) — the same 7 that were
already failing before these changes, none new. The whole flow was driven in a
browser: plan load, scale, three rooms in a row, the bathroom tick box, the
extras picker. No page errors.
