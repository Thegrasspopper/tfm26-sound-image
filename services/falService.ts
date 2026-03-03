import { fal } from "@fal-ai/client";

const FAL_MODEL_PATH = "fal-ai/stable-audio-25/audio-to-audio";
const FAL_TEXT_TO_AUDIO_MODEL_PATH = "fal-ai/stable-audio-25/text-to-audio";
const FAL_TEXT_TO_AUIDO_ACE_MODEL_PATH = "fal-ai/ace-step/prompt-to-audio";
const FAL_TEXT_TO_AUDIO_BEATOVEN_MODEL_PATH = "beatoven/music-generation";
const FAL_TEXT_TO_AUDIO_STABLE_AUDIO_MODEL_PATH = "fal-ai/stable-audio";


export interface FalTextToAudioInput {
  prompt: string;
  strength?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seconds_total?: number;
}

export interface FalTextToAudioBeatovenInput {
  prompt: string;
  negative_prompt?: string;
  duration?: number;
  refinement?: number;
  creativity?: number;
  seed?: number;
}


export interface FalTextToAudioAceResult {
  prompt: string;
  instrumental?: boolean;
  duration?: number;
  number_of_steps?: number;
  scheduler?: "euler" | "heun";
  guidance_type?: "cfg" | "apg" | "cfg_star";
  granularity_scale?: number;
  guidance_interval?: number;
  guidance_interval_decay?: number;
  guidance_scale?: number;
  minimum_guidance_scale?: number;
  tag_guidance_scale?: number;
  lyric_guidance_scale?: number;
}

export interface FalAudioToAudioInput {
  prompt: string;
  audio_url: string;
  strength?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  total_seconds?: number;
}

export interface FalAudioToAudioResult {
  audio?: {
    url?: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
  request_id?: string;
  [key: string]: any;
}

type FalQueueStatus = "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string;

const getFalApiKey = () => process.env.FAL_KEY;

const normalizeFalResult = (data: any, requestId?: string): FalAudioToAudioResult => {
  const audioFile = data?.audio_file;
  const normalizedAudio =
    data?.audio ||
    (typeof audioFile === "string"
      ? { url: audioFile }
      : (audioFile && typeof audioFile === "object"
          ? {
              url: audioFile.url,
              content_type: audioFile.content_type,
              file_name: audioFile.file_name,
              file_size: audioFile.file_size,
            }
          : undefined));

  return {
    ...(data || {}),
    ...(normalizedAudio ? { audio: normalizedAudio } : {}),
    request_id: requestId,
  } as FalAudioToAudioResult;
};

export const runTextoToAuidoWithFalAce = async (
  input: FalTextToAudioAceResult,
  options?: {
    apiKey?: string;
    onStatusUpdate?: (status: FalQueueStatus) => void;
  }
): Promise<FalAudioToAudioResult> => {
  const apiKey = options?.apiKey || getFalApiKey(); 
  if (!apiKey) {
    throw new Error("FAL API key missing. Set process.env.FAL_KEY or use a WP proxy endpoint.");
  }

  fal.config({
    credentials: apiKey,
  });

  const result = await fal.subscribe(FAL_TEXT_TO_AUIDO_ACE_MODEL_PATH, {
    input,
    logs: true,
    onQueueUpdate: (update: any) => {
      options?.onStatusUpdate?.(update?.status);
      if (update.status === "IN_PROGRESS") { 
        (update.logs || [])          .map((log: any) => log?.message)
          .filter(Boolean)
          .forEach((message: string) => console.log(message));
      }
    },
  });

  return normalizeFalResult(result.data, result.requestId);
}



export const runTextToAudioWithFal = async (
  input: FalTextToAudioInput,
  options?: {
    apiKey?: string;
    onStatusUpdate?: (status: FalQueueStatus) => void;
  }
): Promise<FalAudioToAudioResult> => {
  const apiKey = options?.apiKey || getFalApiKey();
  if (!apiKey) {
    throw new Error("FAL API key missing. Set process.env.FAL_KEY or use a WP proxy endpoint.");
  }

  fal.config({
    credentials: apiKey,
  });

  const result = await fal.subscribe(FAL_TEXT_TO_AUDIO_MODEL_PATH, {
    input,
    logs: true,
    onQueueUpdate: (update: any) => {
      options?.onStatusUpdate?.(update?.status);
      if (update.status === "IN_PROGRESS") {
        (update.logs || [])
          .map((log: any) => log?.message)
          .filter(Boolean)
          .forEach((message: string) => console.log(message));
      }
    },
  });

  return normalizeFalResult(result.data, result.requestId);
} 

export const runFalAudioToAudio = async (
  input: FalAudioToAudioInput,
  options?: {
    apiKey?: string;
    onStatusUpdate?: (status: FalQueueStatus) => void;
  }
): Promise<FalAudioToAudioResult> => {
  const apiKey = options?.apiKey || getFalApiKey();
  if (!apiKey) {
    throw new Error("FAL API key missing. Set process.env.FAL_KEY or use a WP proxy endpoint.");
  }

  fal.config({
    credentials: apiKey,
  });

  const result = await fal.subscribe(FAL_MODEL_PATH, {
    input,
    logs: true,
    onQueueUpdate: (update: any) => {
      options?.onStatusUpdate?.(update?.status);
      if (update.status === "IN_PROGRESS") {
        (update.logs || [])
          .map((log: any) => log?.message)
          .filter(Boolean)
          .forEach((message: string) => console.log(message));
      }
    },
  });

  return normalizeFalResult(result.data, result.requestId);
};

export const runFalAudioToAudioViaWp = async (
  endpoint: string,
  input: FalAudioToAudioInput,
  nonce?: string
): Promise<FalAudioToAudioResult> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (nonce) {
    headers["X-WP-Nonce"] = nonce;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(`WP Fal proxy failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  return normalizeFalResult(data, data?.request_id);
};

export const runTextToAudioWithFalBeatoven = async (
  input: FalTextToAudioBeatovenInput,
  options?: {
    apiKey?: string;
    onStatusUpdate?: (status: FalQueueStatus) => void;
  }
): Promise<FalAudioToAudioResult> => {
  const apiKey = options?.apiKey || getFalApiKey();
  if (!apiKey) {
    throw new Error("FAL API key missing. Set process.env.FAL_KEY or use a WP proxy endpoint.");
  }

  fal.config({
    credentials: apiKey,
  });

  const result = await fal.subscribe(FAL_TEXT_TO_AUDIO_BEATOVEN_MODEL_PATH, {
    input,
    logs: true,
    onQueueUpdate: (update: any) => {
      options?.onStatusUpdate?.(update?.status);
      if (update.status === "IN_PROGRESS") {
        (update.logs || [])
          .map((log: any) => log?.message)
          .filter(Boolean)
          .forEach((message: string) => console.log(message));
      }
    },
  });

  return normalizeFalResult(result.data, result.requestId);
};

export const runTextToAudioWithFalStableAudio = async (
  input: FalTextToAudioInput,
  options?: {
    apiKey?: string;
    onStatusUpdate?: (status: FalQueueStatus) => void;
  }
): Promise<FalAudioToAudioResult> => {
  const apiKey = options?.apiKey || getFalApiKey();
  if (!apiKey) {
    throw new Error("FAL API key missing. Set process.env.FAL_KEY or use a WP proxy endpoint.");
  }

  fal.config({
    credentials: apiKey,
  });

  const result = await fal.subscribe(FAL_TEXT_TO_AUDIO_STABLE_AUDIO_MODEL_PATH, {
    input,
    logs: true,
    onQueueUpdate: (update: any) => {
      options?.onStatusUpdate?.(update?.status);
      if (update.status === "IN_PROGRESS") {
        (update.logs || [])
          .map((log: any) => log?.message)
          .filter(Boolean)
          .forEach((message: string) => console.log(message));
      }
    },
  });

  return normalizeFalResult(result.data, result.requestId);
};
