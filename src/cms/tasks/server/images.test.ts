import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_TASK_IMAGE_BYTES, MAX_TASK_IMAGE_WIDTH } from "../images";
import { processTaskImage, TaskImageError } from "./images";

const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: { r: 240, g: 120, b: 40 } },
  })
    .png()
    .toBuffer();

const isWebp = (bytes: Buffer) =>
  bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
  bytes.subarray(8, 12).toString("ascii") === "WEBP";

describe("processTaskImage", () => {
  it("converts to WebP and keeps a small image at its own size", async () => {
    const out = await processTaskImage(await png(300, 200));
    expect(isWebp(out.bytes)).toBe(true);
    expect(out).toMatchObject({ width: 300, height: 200 });
  });

  it("scales a wide image down to the maximum width, keeping its proportions", async () => {
    const out = await processTaskImage(await png(3880, 400));
    expect(out).toMatchObject({ width: MAX_TASK_IMAGE_WIDTH, height: 200 });
  });

  it("rejects what is not an image, judged by the bytes", async () => {
    await expect(
      processTaskImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")),
    ).rejects.toMatchObject({ status: 415 });
  });

  it("rejects a file over the limit before decoding it", async () => {
    const big = Buffer.alloc(MAX_TASK_IMAGE_BYTES + 1);
    await expect(processTaskImage(big)).rejects.toBeInstanceOf(TaskImageError);
    await expect(processTaskImage(big)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects a truncated image", async () => {
    const whole = await png(400, 400);
    await expect(
      processTaskImage(whole.subarray(0, 60)),
    ).rejects.toBeInstanceOf(TaskImageError);
  });
});
