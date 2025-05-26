import { GoogleGenAI, Modality, MediaResolution } from "@google/genai";
import dotenv from "dotenv";
import { convertToWav } from "../utils/audio.js";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY missing in environment variables");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_ID = "models/gemini-2.0-flash-live-001";

export async function generateAudioReply(text, systemInstruction = "") {
  const responseQueue = [];
  const audioParts = [];
  let collectedText = "";

  const session = await ai.live.connect({
    model: MODEL_ID,
    callbacks: {
      onopen() {
        console.debug("Live session opened");
      },
      onmessage(message) {
        responseQueue.push(message);
      },
      onerror(e) {
        console.error("Live session error", e.message);
      },
      onclose(e) {
        console.debug("Live session closed", e.reason);
      },
    },
    config: (() => {
      const baseCfg = {
        responseModalities: [Modality.AUDIO],
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Zephyr" },
          },
        },
      };
      if (systemInstruction && systemInstruction.trim().length > 0) {
        baseCfg.systemInstruction = {
          parts: [{ text: systemInstruction.trim() }],
        };
      }
      return baseCfg;
    })(),
  });

  session.sendClientContent({ turns: [text] });

  let done = false;
  while (!done) {
    const message = await waitMessage(responseQueue);
    const parts = message.serverContent?.modelTurn?.parts;
    if (parts && parts.length) {
      const part = parts[0];
      if (part.inlineData?.data) {
        audioParts.push(part.inlineData.data);
      }
      if (part.text) {
        collectedText += part.text;
      }
    }

    if (message.serverContent?.turnComplete) {
      done = true;
    }
  }

  session.close();

  // convert to wav buffer
  const wavBuffer = convertToWav(audioParts, "audio/pcm;rate=24000");
  const base64Audio = wavBuffer.toString("base64");
  return { text: collectedText, audioBase64: base64Audio, mimeType: "audio/wav" };
}

function waitMessage(queue) {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      const msg = queue.shift();
      if (msg) {
        clearInterval(interval);
        resolve(msg);
      }
    }, 50);
  });
} 