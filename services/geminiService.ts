
import { GoogleGenAI, Type } from "@google/genai";
import { SonicProfile } from "../types";

export const composeFromImage = async (base64Image: string, genre: string = "Modern Pop"): Promise<SonicProfile> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `Act as a cognitive musicologist and minimalist sound designer.
              Analyze the emotional content of the input image using the Valence–Arousal–Dominance model.

              STEP 1 — Emotional Quantification:
              Return numeric values (0–100):
              - Valence
              - Arousal
              - Dominance

              STEP 2 — Emotional Classification:
              Map the values to one of:
              - Joy
              - Tenderness
              - Sadness
              - Fear
              - Anger
              - Calm
              - Nostalgia
              - Empowerment

              STEP 3 — Minimalist Translation Rules:

              Translate the emotional profile into:

              - Tempo (BPM)
              - Mode (Major / Minor / Modal / Atonal)
              - Articulation (Staccato / Legato / Mixed)
              - Register (Low / Mid / High)
              - Rhythmic Density (1–10)
              - Harmonic Tension (1–10)
              - Spectral Brightness (1–10)
              - Attack Speed (Slow / Medium / Fast)

              STEP 4 — Sound Design:
              Design a single realistic instrument layer optimized for mixing:
              - Instrument family
              - Waveform
              - Texture descriptor
              - Spatial depth (Dry / Slight reverb / Large space)

              STEP 5 - Image description:
              Describe the image and the emotions it evokes in a concise paragraph.

  
  Provide strictly valid JSON.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
        { text: prompt }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          desctiption: { type: Type.STRING },
          emotion: {
            type: Type.OBJECT, properties: {
              valence: { type: Type.INTEGER },
              arousal: { type: Type.INTEGER },
              dominance: { type: Type.INTEGER },
              label: { type: Type.STRING }
            },
            required: ["valence", "arousal", "dominance","label"]
          },
          musicalParameters: {
            type: Type.OBJECT,
            properties: {
              tempo: { type: Type.INTEGER },
              mode: { type: Type.STRING },
              articulation: { type: Type.STRING },
              register: { type: Type.STRING },
              rhythmic_density: { type: Type.INTEGER },
              harmonic_tension: { type: Type.INTEGER },
              spectral_brightness: { type: Type.INTEGER },
              attack_speed: { type: Type.STRING }
            },
            required: ["tempo", "mode", "articulation", "register", "rhythmic_density", "harmonic_tension", "spectral_brightness", "attack_speed"]
          },
          soundDesign: {
            type: Type.OBJECT,
            properties: {
              instrument: { type: Type.STRING },
              waveform: { type: Type.STRING },
              texture: { type: Type.STRING },
              space: { type: Type.STRING },
            },
            required: ["instrument", "waveform", "texture", "space"]
          }
        },
        required: ["emotion", "musicalParameters", "soundDesign"]
    }
  }});

  try {
    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    const data = JSON.parse(text);
    return data;
  } catch (e) {
    throw new Error(`${genre} composition failed. Please try another image.`);
  }
};
