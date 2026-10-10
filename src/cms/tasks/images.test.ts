import { describe, expect, it } from "vitest";
import {
  hasPendingUpload,
  parseTaskImageUrl,
  taskImageKey,
  uploadPlaceholder,
} from "./images";

const ORIGIN = "https://media.factura.uno";
const ID = "0b5f3c1e-8a7d-4e2b-9c41-6f0a2d3e4b5c";

describe("task image addresses", () => {
  it("reads the dimensions back out of a stored key", () => {
    const url = `${ORIGIN}/${taskImageKey(ID, 1200, 640)}`;
    expect(parseTaskImageUrl(url, ORIGIN)).toEqual({ width: 1200, height: 640 });
  });

  it("ignores images on any other origin", () => {
    const key = taskImageKey(ID, 10, 10);
    expect(parseTaskImageUrl(`https://evil.example/${key}`, ORIGIN)).toBeNull();
    // A prefix of the origin is not the origin.
    expect(parseTaskImageUrl(`${ORIGIN}.evil.example/${key}`, ORIGIN)).toBeNull();
  });

  it("ignores media-library images and anything malformed", () => {
    expect(parseTaskImageUrl(`${ORIGIN}/cms-media/${ID}/abc.png`, ORIGIN)).toBeNull();
    expect(parseTaskImageUrl(`${ORIGIN}/cms-tasks/${ID}-0x10.webp`, ORIGIN)).toBeNull();
    expect(parseTaskImageUrl(`${ORIGIN}/cms-tasks/x-10x10.webp`, ORIGIN)).toBeNull();
  });

  it("draws nothing when media is not configured", () => {
    expect(parseTaskImageUrl(`/${taskImageKey(ID, 10, 10)}`, "")).toBeNull();
  });
});

describe("hasPendingUpload", () => {
  it("is true only while a placeholder is in the text", () => {
    expect(hasPendingUpload(`Mirá esto:\n${uploadPlaceholder("ab12cd34")}\n`)).toBe(true);
    expect(hasPendingUpload(`![](${ORIGIN}/${taskImageKey(ID, 1, 1)})`)).toBe(false);
    expect(hasPendingUpload("Subiendo imagen…")).toBe(false);
  });
});
