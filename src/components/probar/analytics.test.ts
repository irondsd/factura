import { describe, expect, it } from "vitest";
import { abandonmentFlags, type SessionStats } from "./analytics";

const base: SessionStats = {
  filesSubmitted: 0,
  parsed: 0,
  parseFailed: 0,
  unrecognized: 0,
  noText: 0,
  errors: 0,
  saveCtaShown: false,
  saveCtaClicked: false,
  notifyRequested: false,
  secondsOnPage: 0,
};

const flags = (over: Partial<SessionStats>) =>
  abandonmentFlags({ ...base, ...over });

describe("abandonmentFlags", () => {
  it("flags a successful parse the visitor never saved", () => {
    // The product question: the bill read correctly and they still left.
    expect(flags({ filesSubmitted: 1, parsed: 1 })).toEqual({
      abandoned_after_success: true,
      abandoned_after_failure: false,
    });
  });

  it("does not flag success when they clicked through to save", () => {
    expect(
      flags({ filesSubmitted: 1, parsed: 1, saveCtaClicked: true }),
    ).toEqual({ abandoned_after_success: false, abandoned_after_failure: false });
  });

  it("flags an unrecognized bill the visitor walked away from", () => {
    // The coverage question: we couldn't read it and they didn't wait for us to.
    expect(flags({ filesSubmitted: 1, unrecognized: 1 })).toEqual({
      abandoned_after_success: false,
      abandoned_after_failure: true,
    });
  });

  it("does not flag failure when they asked to be notified", () => {
    expect(
      flags({ filesSubmitted: 1, unrecognized: 1, notifyRequested: true }),
    ).toEqual({ abandoned_after_success: false, abandoned_after_failure: false });
  });

  it("never counts a visitor who submitted nothing", () => {
    // A bounce is already a $pageview; counting it as a failure would inflate
    // the coverage problem with people who never tried.
    expect(flags({})).toEqual({
      abandoned_after_success: false,
      abandoned_after_failure: false,
    });
  });

  it("treats a parse_failed bill as a failure, not a success", () => {
    // A parser recognized the vendor but couldn't extract — `parsed` stays 0,
    // so this is a coverage problem, not a conversion one.
    expect(flags({ filesSubmitted: 1, parseFailed: 1 })).toEqual({
      abandoned_after_success: false,
      abandoned_after_failure: true,
    });
  });

  it("treats a scanned PDF as a failure", () => {
    expect(flags({ filesSubmitted: 1, noText: 1 })).toEqual({
      abandoned_after_success: false,
      abandoned_after_failure: true,
    });
  });

  it("counts a mixed batch as a success once anything parsed", () => {
    // One good bill is enough to make the save offer relevant, so the mixed
    // case belongs in the conversion bucket, not the coverage one.
    expect(flags({ filesSubmitted: 2, parsed: 1, unrecognized: 1 })).toEqual({
      abandoned_after_success: true,
      abandoned_after_failure: false,
    });
  });

  it("counts neither once a mixed batch is saved", () => {
    expect(
      flags({
        filesSubmitted: 2,
        parsed: 1,
        unrecognized: 1,
        saveCtaClicked: true,
      }),
    ).toEqual({ abandoned_after_success: false, abandoned_after_failure: false });
  });

  it("counts an upload error as a failure the visitor left after", () => {
    // A 413/429 is our fault rather than a coverage gap, but it's still a
    // submission that ended in nothing parsed — so it lands in the failure
    // bucket. Slice by `errors` when you want to separate the two causes.
    expect(flags({ filesSubmitted: 1, errors: 1 })).toEqual({
      abandoned_after_success: false,
      abandoned_after_failure: true,
    });
  });
});
