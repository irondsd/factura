import { describe, expect, it } from "vitest";
import { dragStep } from "./useWindowFileDrop";

/** Replay a sequence of drag events from a clean state. */
function replay(events: ["enter" | "leave" | "drop", boolean][]): {
  depth: number;
  dragging: boolean;
} {
  let state = { depth: 0, dragging: false };
  for (const [event, carriesFiles] of events) {
    state = dragStep(state.depth, event, carriesFiles);
  }
  return state;
}

const files = true;
const notFiles = false;

describe("dragStep", () => {
  it("raises the affordance when a file drag enters", () => {
    expect(replay([["enter", files]])).toEqual({ depth: 1, dragging: true });
  });

  it("clears it when the drag leaves", () => {
    expect(
      replay([
        ["enter", files],
        ["leave", files],
      ]),
    ).toEqual({
      depth: 0,
      dragging: false,
    });
  });

  it("stays up while the cursor crosses child elements", () => {
    // The bug this exists to prevent: dragenter/dragleave fire per element, so
    // a naive boolean flickers off every time the pointer moves over a child.
    expect(
      replay([
        ["enter", files],
        ["enter", files],
        ["enter", files],
        ["leave", files],
        ["leave", files],
      ]),
    ).toEqual({ depth: 1, dragging: true });
  });

  it("clears only once the last element is left", () => {
    expect(
      replay([
        ["enter", files],
        ["enter", files],
        ["leave", files],
        ["leave", files],
      ]),
    ).toEqual({ depth: 0, dragging: false });
  });

  it("ignores a non-file drag entirely", () => {
    // Dragging selected text or a link across the page must not offer to upload.
    expect(replay([["enter", notFiles]])).toEqual({
      depth: 0,
      dragging: false,
    });
  });

  it("is not disturbed by a non-file drag crossing an active one", () => {
    // The regression the `carriesFiles` guard on LEAVE prevents: a text drag
    // decrementing a counter it never incremented would strand the overlay on.
    expect(
      replay([
        ["enter", files],
        ["enter", notFiles],
        ["leave", notFiles],
      ]),
    ).toEqual({ depth: 1, dragging: true });
  });

  it("never drives the count negative", () => {
    // A leave with no matching enter happens when the cursor was already over
    // the page before the listeners attached. If that pushed the count below
    // zero, the next real enter would not raise the affordance.
    const afterStrayLeaves = replay([
      ["leave", files],
      ["leave", files],
      ["leave", files],
    ]);
    expect(afterStrayLeaves).toEqual({ depth: 0, dragging: false });
    expect(dragStep(afterStrayLeaves.depth, "enter", files)).toEqual({
      depth: 1,
      dragging: true,
    });
  });

  it("resets completely on drop, however deep the count was", () => {
    // Drop fires once, but the enters that preceded it never get matching
    // leaves — so anything short of a full reset leaves the overlay stuck.
    expect(
      replay([
        ["enter", files],
        ["enter", files],
        ["enter", files],
        ["drop", files],
      ]),
    ).toEqual({ depth: 0, dragging: false });
  });

  it("resets on drop even when the payload is not files", () => {
    expect(
      replay([
        ["enter", files],
        ["drop", notFiles],
      ]),
    ).toEqual({ depth: 0, dragging: false });
  });

  it("can raise again after a completed drop", () => {
    const afterDrop = replay([
      ["enter", files],
      ["drop", files],
    ]);
    expect(dragStep(afterDrop.depth, "enter", files)).toEqual({
      depth: 1,
      dragging: true,
    });
  });
});
