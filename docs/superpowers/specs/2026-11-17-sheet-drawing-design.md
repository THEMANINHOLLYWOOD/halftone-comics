# Sheets that draw themselves — design

## Intent

When a comic is coming out, the person watching should see each sheet being
made on the 3D stage, like watching an artist work: pencils go down, someone
colors it in one element at a time, and it settles into the finished sheet.
Clean, minimal, ultra smooth, in the existing bending-paper look.

## Approach (picked)

Considered:

1. **Replay from the finished art** — picked. The image model only ever returns
   a finished picture, so the drawing is staged from that picture on the
   viewer's device. No extra cost or waiting, and the pencils match the final
   art exactly.
2. Real pencils first: a pencil image, then a colored one built on it. Rejected:
   twice the cost and time per sheet, and the colors can drift from the pencils.

## What the viewer sees

**While the sheet is being drawn by the model** (can take 30 s to 3 min):
a pencil tip moves over the blank sheet and roughs in a layout in light blue
pencil, stroke by stroke: panel borders, perspective guides, then loose gesture
marks (head ovals, figure lines, hatching) that keep coming slowly so the sheet
is never static. The `COVER · PENCILS` caption stays at the bottom.

**When the picture arrives** (about 7 s, one continuous motion):

1. The blue roughs fade back. The pencil traces graphite lines taken from the
   real picture, following its contours one stroke after another.
2. The pencil becomes a marker. Flat colors taken from the picture fill in one
   element at a time, each spreading out from a point inside it.
3. The flats and graphite melt into the finished art; the marker lifts off the
   sheet, and the sheet gives a small settle as it lands.

It plays when the viewer first sees the arrived sheet, not while they are on
another page. Finished comics on the shelf never replay. People who ask their
device for reduced motion get the plain fade used today.

## How it is built (my calls)

- All on the client, in `lib/stage`. No server or pipeline change.
- When an arrived picture loads, it is analysed at about 320×480: edges are
  traced into stroke chains and put in drawing order (nearest stroke next), and
  its colors are grouped into up to 8 flats with a seed point and size each.
- Stroke timing goes into a small time map texture; the sheet's shader reveals
  graphite (edges read from the full-size picture, so lines stay crisp) where
  the clock has passed. Flats are worked out in the shader from the picture's
  own colors, so their edges are crisp too.
- The pencil and marker are painted on the paper with a soft shadow (they bend
  with the sheet), following the stroke path on a spring so it moves smoothly.
- Works per face, so both sides of a sheet can draw at once, and the engine
  keeps rendering only while something is drawing.
- A `?replay` address flag makes every finished sheet play its drawing once,
  for testing without paying for new comics.

## Non-goals

- No extra image-model calls, no change to cost or wait.
- No floating 3D pencil or hand model; the tool is drawn on the paper.

## Left to the builder

Exact timings, colors of the graphite and blue pencil, stroke counts and the
size of the analysis, tuned by eye on desktop and phone.
