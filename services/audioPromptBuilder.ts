import type { SonicProfile } from "../types";

export type PromptTemplateMode = "current" | "single_instrument" | "base_track";

interface BuildAudioPromptOptions {
  fallbackTempo?: number;
}

export const buildAudioPromptFromProfile = (
  profile: SonicProfile,
  mode: PromptTemplateMode,
  options?: BuildAudioPromptOptions
): string => {
  const fallbackTempo = options?.fallbackTempo ?? 120;
  const emotionLabel = String(profile?.emotion?.label || "expressive").toLowerCase();
  const musicalMode = String(profile?.musicalParameters?.mode || "modal");
  const tempo = Number(profile?.musicalParameters?.tempo) || fallbackTempo;
  const register = String(profile?.musicalParameters?.register || "mid");
  const articulation = String(profile?.musicalParameters?.articulation || "mixed");
  const mainInstrument = String(profile?.soundDesign?.instrument || "synth");
  const texture = String(profile?.soundDesign?.texture || "balanced");
  const space = String(profile?.soundDesign?.space || "subtle reverb");

  const common = `Clean, modern, natural sounds over synthetic, no lo-fi or folk music. `;

  if (mode === "single_instrument") {
    return `Create a ${emotionLabel} instrumental in ${musicalMode} mode at ${tempo} BPM.
        Use only ${profile.soundDesign.instrument} as instrument.${common}`;
  }

  if (mode === "base_track") {
    return `Create a ${emotionLabel}-inspired base track in ${musicalMode} mode at ${tempo} BPM.
Build a simple foundational groove and harmony bed that leaves room for future layers and lead elements.
Keep arrangement minimal, predictable, and loop-friendly with controlled energy and clean low-end. ${common}`;
  }

  return `Create a ${emotionLabel}-inspired minimalist instrumental in ${musicalMode} mode at ${tempo} BPM.
Use ${mainInstrument} as the main element, played in the ${register} register with ${articulation} articulation.
Texture should be ${texture} with ${space}.
Keep it as a single realistic, mix-ready instrumental layer. ${common}`;
};
