import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            // Charon = deep, dark, ominous voice. Perfect for horror narrator.
            prebuiltVoiceConfig: { voiceName: "Charon" },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    const audioData = (part as any)?.inlineData?.data;

    if (!audioData) {
      return Response.json({ error: "No audio generated" }, { status: 500 });
    }

    const buffer = Buffer.from(audioData, "base64");
    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("TTS Error:", err.message);
    return Response.json({ error: "TTS failed" }, { status: 500 });
  }
}
