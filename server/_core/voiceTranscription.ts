/**
 * Voice transcription helper — STUB
 *
 * The Manus Forge speech-to-text service has been removed. This file is kept
 * as a no-op stub so that any dead-code imports continue to compile.
 *
 * To restore voice transcription, integrate with the OpenAI Whisper API:
 *   https://platform.openai.com/docs/guides/speech-to-text
 *
 * Set OPENAI_API_KEY in your environment and replace the stub below.
 *
 * NOTE: The SennaVision Roku Platform does not currently use voice transcription.
 *       This file can be safely deleted once all imports are removed.
 */

export type TranscribeOptions = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "TRANSCRIPTION_FAILED"
    | "UPLOAD_FAILED"
    | "SERVICE_ERROR";
  details?: string;
};

/** @deprecated Voice transcription is not configured. */
export async function transcribeAudio(
  _options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  return {
    error: "Voice transcription is not configured.",
    code: "SERVICE_ERROR",
    details:
      "Set OPENAI_API_KEY and implement transcribeAudio() in server/_core/voiceTranscription.ts.",
  };
}
