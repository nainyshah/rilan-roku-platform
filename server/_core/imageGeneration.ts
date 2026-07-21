/**
 * Image generation helper — STUB
 *
 * The Manus Forge image generation service has been removed. This file is kept
 * as a no-op stub so that any dead-code imports continue to compile.
 *
 * To restore image generation, integrate with OpenAI Images API or another
 * provider and set OPENAI_API_KEY in your environment.
 *
 * NOTE: The SennaVision Roku Platform does not currently use image generation.
 *       This file can be safely deleted once all imports are removed.
 */

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

/** @deprecated Image generation is not configured. */
export async function generateImage(
  _options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  throw new Error(
    "Image generation is not configured. " +
      "Set OPENAI_API_KEY and implement generateImage() in server/_core/imageGeneration.ts."
  );
}
