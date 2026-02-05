
import { GoogleGenAI, Type } from "@google/genai";
import { SonicProfile } from "../types";

export const composeFromImage = async (base64Image: string, genre: string = "Modern Pop"): Promise<SonicProfile> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `Act as a world-class music producer and visual synesthete specialized in "${genre}". 
  Analyze this image and compose an intricate 21-note melodic/rhythmic sequence.
  
  Style Guidelines for requested genre:
  - Techno: Minimalist, industrial, rhythmic loops, cold textures.
  - Pop: Catchy hooks, major scales, bright/polished feel.
  - R&B: Smooth, sultry, jazz-influenced chords, soulful swing.
  - Reggae: Off-beat accents, dub echoes, relaxed groove, warm low-end.

  Response Requirements:
  1. Feelings: 3 emotional tags inspired by the visual.
  2. RGB: Dominant color code.
  3. Genre: Confirm the sub-style.
  4. Waveform: Suggested by textures (Pop: clean; Techno: noisy/saw; R&B: smooth sine; Reggae: warm triangle).
  5. Suggested Instrument: Choose from: 'kick', 'hat', 'snare', 'clap', 'flute', 'vox', 'pad', 'bell', 'rhodes', 'string', 'pluck', 'brass', 'acid', 'rim', 'drone', 'noise'.
  6. Sequence: 21 notes. Tailor intervals to the genre (e.g., Reggae skanks, Techno driving rhythms).
  7. Texture: 1-sentence description of the visual-audio link.
  
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
          feelings: { type: Type.ARRAY, items: { type: Type.STRING } },
          rgb: {
            type: Type.OBJECT,
            properties: {
              r: { type: Type.INTEGER },
              g: { type: Type.INTEGER },
              b: { type: Type.INTEGER }
            },
            required: ["r", "g", "b"]
          },
          musicGenre: { type: Type.STRING },
          bpm: { type: Type.INTEGER },
          waveform: { type: Type.STRING },
          suggestedInstrument: { type: Type.STRING },
          sequence: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                frequency: { type: Type.NUMBER },
                duration: { type: Type.NUMBER },
                intensity: { type: Type.NUMBER }
              },
              required: ["frequency", "duration", "intensity"]
            }
          },
          textureDescription: { type: Type.STRING }
        },
        required: ["feelings", "rgb", "musicGenre", "bpm", "waveform", "suggestedInstrument", "sequence", "textureDescription"]
      }
    }
  });

  try {
    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    const data = JSON.parse(text);
    return data;
  } catch (e) {
    throw new Error(`${genre} composition failed. Please try another image.`);
  }
};
