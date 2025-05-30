import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server as IOServer } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { generateDirectAudioResponse } from "./services/geminiService.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new IOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(cors({ origin: "*" }));

app.use(express.json({ limit: '50mb' }));
app.use(express.static(join(__dirname, 'public')));
app.use(express.static(join(__dirname, '../frontend')));
app.use('/components', express.static(join(__dirname, '../frontend/components')));
app.use('/public', express.static(join(__dirname, '../frontend/public')));
app.use('/talkinghead', express.static(join(__dirname, '../frontend/public/talkinghead')));

// Add route for TalkingHead component
app.get('/components/TalkingHead.js', (req, res) => {
  res.sendFile(join(__dirname, '../frontend/components/TalkingHead.js'));
});

const REQUEST_TIMEOUT = 120000; // 120 seconds (2 minutes)

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY missing in environment variables");
  process.exit(1);
}

// Socket.io handler
io.on("connection", (socket) => {
  console.log("Socket client connected", socket.id);

  socket.on("audioInput", async (data, ack) => {
    const requestStartTime = Date.now();
    
    // Check if acknowledgment function exists
    if (typeof ack !== "function") {
      console.error("Error: No acknowledgment function provided by client");
      return;
    }
    
    // Safely extract data with fallbacks
    const audioData = data?.audioData;
    const message = data?.message;
    const mimeType = data?.mimeType || 'audio/webm';
    const systemInstruction = data?.systemInstruction || "";
    const apiKey = data?.apiKey || "";
    
    // Check if we have either audioData or a text message
    if (!audioData && !message) {
      console.error("Error: Missing audioData or message in request");
      ack({ 
        error: "Either 'audioData' or 'message' is required", 
        text: "Please provide audio data or a text message" 
      });
      return;
    }

    // Process based on what we received
    if (message) {
      // Handle text message
      console.log(`Received text message: "${message}"`);
      
      // TODO: Process the text message through Gemini
      // For now, we'll return a simple response
      
      const mockResponse = {
        text: `You said: ${message}. This is a text-to-speech response that will be lip-synced by the avatar.`,
        audioData: null, // We'll need to generate this
        mimeType: "audio/wav"
      };
      
      // Add detailed logging
      if (systemInstruction) {
        console.log(`Using system instruction: "${systemInstruction}"`);
      }
      
      // Use API key from frontend if provided, otherwise use from .env
      const usedApiKey = apiKey?.trim() || process.env.GEMINI_API_KEY;
      if (!usedApiKey) {
        ack({ 
          error: "No API key available", 
          text: "API key is required. Please provide one or configure it on the server." 
        });
        return;
      }
      
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Request timed out after ${REQUEST_TIMEOUT/1000} seconds`)), REQUEST_TIMEOUT);
        });

        // Log that we're going to call the Gemini service
        console.log("Calling Gemini service with text message");

        // Race between the actual request and the timeout
        const result = await Promise.race([
          generateDirectAudioResponse(null, systemInstruction, usedApiKey, mimeType, message),
          timeoutPromise
        ]);
        
        const processingTime = ((Date.now() - requestStartTime) / 1000).toFixed(2);
        console.log(`Response generated in ${processingTime}s`);
        
        if (result.error) {
          console.error("Error in socket response:", result.error);
          if (result.text) {
            console.log("Fallback text response available:", result.text);
          }
        } else {
          console.log("Successfully generated audio response" + (result.text ? " with text" : ""));
          if (result.audioData) {
            console.log(`Audio response length: ${result.audioData.length} characters, MIME type: ${result.mimeType || "audio/wav"}`);
          }
        }
        
        // Always provide a response, even if there's an error
        ack({
          error: result.error || null,
          text: result.text || "Response processed",
          audioData: result.audioData || null,
          mimeType: result.mimeType || "audio/wav"
        });
        
        console.log("Socket acknowledgment sent to client");
      } catch (err) {
        console.error("Socket request error:", err);
        ack({ 
          error: "Failed to generate response: " + err.message,
          text: "An error occurred while processing your request"
        });
      }
    } else if (audioData) {
      // Handle audio data (existing code)
      // Validate audio data size
      if (audioData.length < 1000) {
        console.error("Error: Audio data too small, likely not valid audio");
        ack({ 
          error: "Audio data too small or invalid", 
          text: "Please record a longer message" 
        });
        return;
      }
      
      if (systemInstruction) {
        console.log(`Using system instruction: "${systemInstruction}"`);
      }
      
      // Use API key from frontend if provided, otherwise use from .env
      const usedApiKey = apiKey?.trim() || process.env.GEMINI_API_KEY;
      if (!usedApiKey) {
        ack({ 
          error: "No API key available", 
          text: "API key is required. Please provide one or configure it on the server." 
        });
        return;
      }
      
      try {
        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Request timed out after ${REQUEST_TIMEOUT/1000} seconds`)), REQUEST_TIMEOUT);
        });

        // Log that we're going to call the Gemini service
        console.log("Calling Gemini service with audio data");

        // Race between the actual request and the timeout
        const result = await Promise.race([
          generateDirectAudioResponse(audioData, systemInstruction, usedApiKey, mimeType),
          timeoutPromise
        ]);
        
        const processingTime = ((Date.now() - requestStartTime) / 1000).toFixed(2);
        console.log(`Response generated in ${processingTime}s`);
        
        if (result.error) {
          console.error("Error in socket response:", result.error);
          if (result.text) {
            console.log("Fallback text response available:", result.text);
          }
        } else {
          console.log("Successfully generated audio response" + (result.text ? " with text" : ""));
          if (result.audioData) {
            console.log(`Audio response length: ${result.audioData.length} characters, MIME type: ${result.mimeType || "audio/wav"}`);
          }
        }
        
        // Always provide a response, even if there's an error
        ack({
          error: result.error || null,
          text: result.text || "Response processed",
          audioData: result.audioData || null,
          mimeType: result.mimeType || "audio/wav"
        });
        
        console.log("Socket acknowledgment sent to client");
      } catch (err) {
        console.error("Socket request error:", err);
        ack({ 
          error: "Failed to generate response: " + err.message,
          text: "An error occurred while processing your request"
        });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 