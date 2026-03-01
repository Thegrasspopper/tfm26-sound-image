
import { GoogleGenAI, Type } from "@google/genai";
import { GEMINI_ALLOWED_INSTRUMENTS, SonicProfile } from "../types";

const DEFAULT_GEMINI_INSTRUMENT = "piano";
const GEMINI_INSTRUMENT_SET = new Set<string>(GEMINI_ALLOWED_INSTRUMENTS);
/**
 * Guia de correspondencia instrumento-emocion (usar como prioridad timbrica):
- Trompeta y saxofon: alegria/jubilo; saxofon y corneta tambien pueden transmitir ira por timbre rugoso y amenazante.
- Clarinete y flauta: frecuentemente asociados con tristeza.
- Violin: versatil; puede funcionar para tristeza (lamento) y tambien alegria segun contexto.
- Trompa (horn): tendencia mas neutral en algunos estudios.
- Oboe y fagot: sesgo hacia tristeza; fagot puede volverse mas romantico con mucha reverberacion.
- Teclado y percusion tonal (marimba, vibrafono, piano): tendencia hacia felicidad.

 */
const INSTRUMENT_EMOTION_GUIDE_ES = `
Instrument-emotion correspondence guide (use as timbral priority):
- Trumpet and saxophone: joy/jubilation; saxophone and cornet can also convey anger due to rough, threatening timbre.
- Clarinet and flute: frequently associated with sadness.
- Violin: versatile; can work for sadness (lament/grieving) and also joy depending on context.
- French horn (horn): tends to be more emotionally neutral in some studies.
- Oboe and bassoon: tendency toward sadness; bassoon can become more romantic with heavy reverberation.
- Keyboard and tonal percussion (marimba, vibraphone, piano): tendency toward happiness.
`;

const normalizeGeminiInstrument = (value: unknown): string => {
  if (typeof value !== "string") return DEFAULT_GEMINI_INSTRUMENT;

  const compact = value.trim().toLowerCase().replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    guittar: "guitar",
    "electric_guitar": "electric guitar",
    drum: "drums",
    horns: "horn",
    "french horn": "horn",
  };

  const normalized = aliases[compact] ?? compact;
  if (GEMINI_INSTRUMENT_SET.has(normalized)) return normalized;

  if (normalized.includes("trumpet")) return "trumpet";
  if (normalized.includes("horn")) return "horn";
  if (normalized.includes("violin")) return "violin";
  if (normalized.includes("banjo")) return "banjo";
  if (normalized.includes("flute")) return "flute";
  if (normalized.includes("electric") && normalized.includes("guitar")) return "electric guitar";
  if (normalized.includes("guitar")) return "guitar";
  if (normalized.includes("drum")) return "drums";
  if (normalized.includes("piano")) return "piano";

  return DEFAULT_GEMINI_INSTRUMENT;
};

export const composeFromImage = async (base64Image: string, genre: string = "Modern Pop"): Promise<SonicProfile> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const allowedInstrumentsList = GEMINI_ALLOWED_INSTRUMENTS.join(", ");

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
              - Instrument (must be exactly one of: ${allowedInstrumentsList})
              - Waveform
              - Texture descriptor
              - Spatial depth (Dry / Slight reverb / Large space)

              STEP 4.1 - Instrument-emotion guide ( mandatory):
              ${INSTRUMENT_EMOTION_GUIDE_ES}
              Apply this guide explicitly when selecting "soundDesign.instrument".
              If the best-match from the guide is not in the allowed list, choose the closest allowed instrument by timbre and emotional role.

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
    if (data?.soundDesign) {
      data.soundDesign.instrument = normalizeGeminiInstrument(data.soundDesign.instrument);
    }
    return data;
  } catch (e) {
    throw new Error(`${genre} composition failed. Please try another image.`);
  }
};
