import type { InstrumentType, SonicProfile } from "../types";

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
};

const normalizeInstrument = (value: unknown): InstrumentType => {
  const allowed: InstrumentType[] = [
    "kick","hat","snare","acid","stab","sub","pad","bell","drone","noise","click",
    "rhodes","wind","string","pluck","brass","tom","chord","sub808","rim","clap","flute","vox",
  ];
  return allowed.includes(value as InstrumentType) ? (value as InstrumentType) : "pad";
};

const extractText = (
  content: string | Array<{ type?: string; text?: string }> | null | undefined
): string => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p?.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n");
  }
  return "";
};

const sanitizeProfile = (raw: any, genre: string): SonicProfile => {
  return {
    feelings: Array.isArray(raw?.feelings) ? raw.feelings.map(String).slice(0, 3) : ["moody", "textured", "cinematic"],
    rgb: {
      r: clampInt(raw?.rgb?.r, 0, 255, 128),
      g: clampInt(raw?.rgb?.g, 0, 255, 128),
      b: clampInt(raw?.rgb?.b, 0, 255, 128),
    },
    musicGenre: String(raw?.musicGenre || genre),
    musicStyle: String(raw?.musicStyle || genre),
    mood: String(raw?.mood || "evocative"),
    bpm: clampInt(raw?.bpm, 40, 240, 120),
    waveform: "sine",
    sequence: [],
    textureDescription: String(raw?.textureDescription || "Image-inspired sonic texture."),
    suggestedInstrument: normalizeInstrument(raw?.suggestedInstrument),
  };
};

export const composeFromImage = async (
  base64Image: string,
  genre: string = "Modern Pop"
): Promise<SonicProfile> => {
  const prompt = `Act as a world-class music producer and visual synesthete specialized in "${genre}".
Analyze this image and return strictly valid JSON with this shape:
{
  "musicGenre": string,
  "musicStyle": string,
  "feelings": [string, string, string],
  "mood": string,
  "bpm": integer (40-240),
  "suggestedInstrument": one of ["kick","hat","snare","clap","flute","vox","pad","bell","rhodes","string","pluck","brass","acid","rim","drone","noise"],
  "textureDescription": string,
  "rgb": { "r": integer 0-255, "g": integer 0-255, "b": integer 0-255 }
}
No markdown. JSON only.`;

  const proxyResponse = await fetch("/api/openai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          ],
        },
      ],
      temperature: 0.4,
    }),
  });

  if (!proxyResponse.ok) {
    const errorText = await proxyResponse.text().catch(() => "");
    throw new Error(errorText || `OpenAI proxy request failed (${proxyResponse.status})`);
  }

  const response = await proxyResponse.json();
  const text = extractText(response?.choices?.[0]?.message?.content as any);
  if (!text) {
    throw new Error("Empty response from OpenAI");
  }

  try {
    const parsed = JSON.parse(text);
    return sanitizeProfile(parsed, genre);
  } catch {
    throw new Error(`${genre} composition failed. Please try another image.`);
  }
};
