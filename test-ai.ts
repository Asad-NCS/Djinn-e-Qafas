import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import * as dotenv from "dotenv";

// load .env.local
dotenv.config({ path: ".env.local" });

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function run() {
  try {
    const { object } = await generateObject({
      model: google("gemini-flash-latest"),
      schema: z.object({
        narrative: z.string(),
      }),
      prompt: "Say hello",
    });
    console.log("Success:", object);
  } catch (e) {
    console.error("Error from AI SDK:", e);
  }
}

run();
