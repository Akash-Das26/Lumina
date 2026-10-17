import fs from "node:fs";
import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";

const _apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const _baseURL =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || process.env.OPENAI_BASE_URL;

if (!_baseURL)
  throw new Error("AI_INTEGRATIONS_OPENAI_BASE_URL (or OPENAI_BASE_URL) must be set.");
if (!_apiKey) throw new Error("OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY) must be set.");

/** Default image model; keep aligned with DEFAULT_IMAGE_MODEL in provider-config. */
const DEFAULT_IMAGE_MODEL = "gpt-image-1";

export const openai = new OpenAI({
  apiKey: _apiKey,
  baseURL: _baseURL,
});

export async function generateImageBuffer(
  prompt: string,
  size:
    | "1024x1024"
    | "512x512"
    | "256x256"
    | "1536x1024"
    | "1024x1536" = "1024x1024",
  // Per-provider model variable (BUG-021): the API passes OPENAI_IMAGE_MODEL's
  // resolution; the env fallback keeps direct callers working.
  model: string = process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
): Promise<Buffer> {
  const response = await openai.images.generate({
    model,
    prompt,
    size,
  });
  const base64 = response.data?.[0]?.b64_json ?? "";
  return Buffer.from(base64, "base64");
}

export async function editImages(
  imageFiles: string[],
  prompt: string,
  outputPath?: string
): Promise<Buffer> {
  const images = await Promise.all(
    imageFiles.map((file) =>
      toFile(fs.createReadStream(file), file, {
        type: "image/png",
      })
    )
  );

  const response = await openai.images.edit({
    model: process.env.OPENAI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL,
    image: images,
    prompt,
  });

  const imageBase64 = response.data?.[0]?.b64_json ?? "";
  const imageBytes = Buffer.from(imageBase64, "base64");

  if (outputPath) {
    fs.writeFileSync(outputPath, imageBytes);
  }

  return imageBytes;
}
