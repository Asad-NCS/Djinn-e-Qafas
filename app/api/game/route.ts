import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export const dynamic = "force-dynamic";

const ResponseSchema = z.object({
  narrative: z.string(),
  choices: z.array(z.string()).length(4),
  sanity_delta: z.number(),
  screen_effect: z.string(),
  css_filter: z.string(),
  audio: z.enum(["footstep", "door_rattle", "whisper", "heartbeat", "adhan_distant", "none"]),
});

const SYSTEM_PROMPT = `
You are the horror narrator of "Djinn-e-Qafas," a Pakistani horror game set in 1987 rural Punjab. 
An ancient Jinn named Aabis is hunting the player.

GAME MECHANICS:
1. WASD/Mouse to explore the expanded haveli.
2. Collect 6 SACRED ITEMS: Matchbox, Torn Tasbeeh, Old Key, Diya, Ink Pot, Silver Amulet.
3. Aabis becomes FASTER and more aggressive with each item found.
4. Hiding: Player can hide behind furniture. While hiding, Aabis might lose track of them.
5. Tasbeeh Ward: If player has Torn Tasbeeh and recites while hiding, Aabis is repelled briefly.
6. Ritual: Once all 6 items are collected, reach the Ritual Room in the final chamber to banish Aabis.

On every action output ONLY JSON. Rules:
- narrative: 2-3 sentences, visceral Pakistani sensory detail (dust, attar, neem, jasmine). Use chilling, poetic imagery.
- choices: exactly 4 contextual options — one should always be dangerous.
- sanity_delta: between -20 and +10.
- screen_effect: one of: shake, flash_red, flash_white, glitch, breathe, none.
- css_filter: valid CSS filter string like "brightness(0.7) hue-rotate(20deg)".`;

export async function POST(req: Request) {
  try {
    const { state, action } = await req.json();

    const { object } = await generateObject({
      model: google("gemini-flash-latest"),
      schema: ResponseSchema,
      system: SYSTEM_PROMPT,
      prompt: `Sanity: ${state.sanity}/100. Zone: ${state.currentZone === 1 ? "Darwaza (entrance)" : state.currentZone === 2 ? "Kamra (bedroom)" : "Tehkhana (basement)"}. Player action: "${action}". Generate next horror beat.`,
    });

    return Response.json(object);
  } catch (error: any) {
    const msg: string = error?.message ?? "";
    const isRateLimit = msg.includes("quota") || msg.includes("rate") || msg.includes("429");
    console.error("Gemini Error:", JSON.stringify(msg));
    return Response.json(
      { error: isRateLimit ? "RATE_LIMIT" : "Failed to generate narrative." },
      { status: isRateLimit ? 429 : 500 }
    );
  }
}
