import { GoogleGenAI, Modality, MediaResolution } from "@google/genai";
import dotenv from "dotenv";
import { EventEmitter } from "events";
import { convertToWav } from "../utils/audio.js";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY missing in environment variables");
}

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  timeout: 60000 // Increase timeout to 60 seconds
});
const MODEL_ID = "models/gemini-2.0-flash-live-001";

export async function generateAudioReply(text, systemInstruction = "") {
  const responseQueue = [];
  const queueEmitter = new EventEmitter();
  const audioParts = [];
  let collectedText = "";

  try {
    const session = await ai.live.connect({
      model: MODEL_ID,
      callbacks: {
        onopen() {
          console.debug("Live session opened");
        },
        onmessage(message) {
          responseQueue.push(message);
          queueEmitter.emit("msg");
        },
        onerror(e) {
          console.error("Live session error", e.message);
          queueEmitter.emit("error", e);
        },
        onclose(e) {
          console.debug("Live session closed", e?.reason || "unknown reason");
          queueEmitter.emit("done");
        },
      },
      config: (() => {
        const baseCfg = {
          responseModalities: [Modality.AUDIO], // Only use AUDIO modality
          mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" },
            },
          },
        };
        
        // Handle system instructions properly
        if (systemInstruction && systemInstruction.trim().length > 0) {
          const trimmedInstruction = systemInstruction.trim();
          console.log("Live API using system instruction:", trimmedInstruction);
          baseCfg.systemInstruction = {
            parts: [{ text: trimmedInstruction }],
          };
        }
        
        return baseCfg;
      })(),
    });

    session.sendClientContent({ turns: [text] });

    let done = false;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Audio generation timed out after 45 seconds")), 45000);
    });

    while (!done) {
      try {
        const message = await Promise.race([
          waitMessage(responseQueue, queueEmitter),
          timeoutPromise
        ]);
        
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
      } catch (err) {
        console.error("Error during message processing:", err);
        done = true;
      }
    }

    session.close();

    // If we collected no audio parts, return an error message
    if (audioParts.length === 0) {
      console.error("No audio generated in the response");
      return { 
        text: collectedText || "Sorry, I couldn't generate an audio response. Please try again.",
        error: "No audio generated"
      };
    }

    // convert to wav buffer
    const wavBuffer = convertToWav(audioParts, "audio/pcm;rate=24000");
    const base64Audio = wavBuffer.toString("base64");
    return { text: collectedText, audioBase64: base64Audio, mimeType: "audio/wav" };
  } catch (err) {
    console.error("Error in generateAudioReply:", err);
    return { 
      text: "Sorry, an error occurred while generating the audio response: " + err.message,
      error: err.message
    };
  }
}

function waitMessage(queue, emitter) {
  if (queue.length) {
    return Promise.resolve(queue.shift());
  }
  return new Promise((resolve, reject) => {
    const handler = () => {
      if (queue.length) {
        emitter.off("msg", handler);
        emitter.off("error", errorHandler);
        emitter.off("done", doneHandler);
        resolve(queue.shift());
      }
    };
    
    const errorHandler = (err) => {
      emitter.off("msg", handler);
      emitter.off("error", errorHandler);
      emitter.off("done", doneHandler);
      reject(err);
    };
    
    const doneHandler = () => {
      emitter.off("msg", handler);
      emitter.off("error", errorHandler);
      emitter.off("done", doneHandler);
      resolve({ serverContent: { turnComplete: true } });
    };
    
    emitter.on("msg", handler);
    emitter.on("error", errorHandler);
    emitter.on("done", doneHandler);
  });
} 