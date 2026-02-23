import { fal } from "@fal-ai/client";

const FAL_MODEL_PATH = "fal-ai/stable-audio-25/audio-to-audio";
const FAL_TEXT_TO_AUDIO_MODEL_PATH = "fal-ai/stable-audio-25/text-to-audio";
const FAL_TEXT_TO_AUIDO_ACE_MODEL_PATH = "fal-ai/ace-step/prompt-to-audio";


export interface FalTextToAudioInput {
  prompt: string;
  strength?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seconds_total?: number;
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

const getFalApiKey = () => process.env.FAL_KEY;

export const runTextoToAuidoWithFalAce = async (
  input: FalTextToAudioAceResult,
  options?: {
    apiKey?: string;
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
      if (update.status === "IN_PROGRESS") { 
        (update.logs || [])          .map((log: any) => log?.message)
          .filter(Boolean)
          .forEach((message: string) => console.log(message));
      }
    },
  });

  return {
    ...(result.data || {}),
    request_id: result.requestId,
  } as FalAudioToAudioResult;
}



export const runTextToAudioWithFal = async (
  input: FalTextToAudioInput,
  options?: {
    apiKey?: string;
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
      if (update.status === "IN_PROGRESS") {
        (update.logs || [])
          .map((log: any) => log?.message)
          .filter(Boolean)
          .forEach((message: string) => console.log(message));
      }
    },
  });

  return {
    ...(result.data || {}),
    request_id: result.requestId,
  } as FalAudioToAudioResult;
} 

export const runFalAudioToAudio = async (
  input: FalAudioToAudioInput,
  options?: {
    apiKey?: string;
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
      if (update.status === "IN_PROGRESS") {
        (update.logs || [])
          .map((log: any) => log?.message)
          .filter(Boolean)
          .forEach((message: string) => console.log(message));
      }
    },
  });

  return {
    ...(result.data || {}),
    request_id: result.requestId,
  } as FalAudioToAudioResult;
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

  return (await res.json()) as FalAudioToAudioResult;
};

