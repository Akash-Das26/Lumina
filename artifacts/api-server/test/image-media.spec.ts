// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectImageMediaType, imageDataUri, imageExtension } from "../src/lib/image-media";

// Real signatures: PNG header, "RIFF....WEBP", JPEG SOI + marker.
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("rest-of-png"),
]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBPVP8 "),
  Buffer.from("payload"),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("detectImageMediaType (Audit 2 F-04)", () => {
  it("detects PNG by magic bytes", () => {
    expect(detectImageMediaType(PNG)).toBe("image/png");
  });

  it("detects WebP by RIFF/WEBP signature", () => {
    expect(detectImageMediaType(WEBP)).toBe("image/webp");
  });

  it("detects JPEG by SOI marker", () => {
    expect(detectImageMediaType(JPEG)).toBe("image/jpeg");
  });

  it("falls back to PNG for unknown bytes", () => {
    expect(detectImageMediaType(Buffer.from("PNGDATA"))).toBe("image/png");
    expect(detectImageMediaType(Buffer.alloc(0))).toBe("image/png");
  });

  it("maps media types to file extensions", () => {
    expect(imageExtension("image/png")).toBe("png");
    expect(imageExtension("image/webp")).toBe("webp");
    expect(imageExtension("image/jpeg")).toBe("jpg");
  });

  it("labels data URIs with the detected type, not a hardcoded one", () => {
    expect(imageDataUri(WEBP).startsWith("data:image/webp;base64,")).toBe(true);
    expect(imageDataUri(PNG).startsWith("data:image/png;base64,")).toBe(true);
    expect(imageDataUri(JPEG).startsWith("data:image/jpeg;base64,")).toBe(true);
  });
});
