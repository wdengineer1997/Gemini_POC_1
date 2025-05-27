import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server as IOServer } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { generateAudioReplyWithDbFunction } from "./services/geminiFunctionService.js";

dotenv.config();

const PORT = process.env.PORT || 5000;
const REQUEST_TIMEOUT = 90000; // 90 seconds timeout for requests

const app = express();
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: {
    origin: "*",
  },
  pingTimeout: 30000,
  pingInterval: 10000
});
app.use(cors());
app.use(express.json({ limit: "2mb" }));
const __dirname = dirname(fileURLToPath(import.meta.url));
const staticPath = join(__dirname, "../frontend/public");
app.use(express.static(staticPath));

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY missing in environment variables");
  process.exit(1);
}

// REST API endpoint for /ask
app.post('/ask', async (req, res) => {
  // Set timeout for the request
  req.setTimeout(REQUEST_TIMEOUT);
  
  try {
    const { message, systemInstruction = "" } = req.body;
    
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "'message' is required" });
    }
    
    console.log(`Processing request with message: "${message}"`);
    if (systemInstruction) {
      console.log(`Using system instruction: "${systemInstruction}"`);
    } else {
      console.log("No system instruction provided");
    }
    
    const result = await generateAudioReplyWithDbFunction(message, systemInstruction);
    
    if (result.error) {
      console.error("Error generating response:", result.error);
      return res.status(500).json({ 
        error: result.error,
        text: result.text || "Failed to generate response"
      });
    }
    
    res.json(result);
  } catch (err) {
    console.error('REST API Error:', err);
    res.status(500).json({ error: "Failed to generate response: " + err.message });
  }
});

// Socket.io handler
io.on("connection", (socket) => {
  console.log("Socket client connected", socket.id);

  socket.on("ask", async (data, ack) => {
    const requestStartTime = Date.now();
    const message = data?.message;
    const systemInstruction = typeof data?.systemInstruction === "string" ? data.systemInstruction : "";
    
    if (!message || typeof message !== "string") {
      if (typeof ack === "function") ack({ error: "'message' is required" });
      return;
    }
    
    console.log(`Socket request with message: "${message}"`);
    if (systemInstruction) {
      console.log(`Using socket system instruction: "${systemInstruction}"`);
    } else {
      console.log("No system instruction provided for socket request");
    }
    
    try {
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out after 80 seconds")), 80000);
      });

      // Race between the actual request and the timeout
      const result = await Promise.race([
        generateAudioReplyWithDbFunction(message, systemInstruction),
        timeoutPromise
      ]);
      
      const processingTime = ((Date.now() - requestStartTime) / 1000).toFixed(2);
      console.log(`Response generated in ${processingTime}s`);
      
      if (result.error) {
        console.error("Error in socket response:", result.error);
      }
      
      // Ensure we have text in the response
      if (result.text) {
        console.log(`Sending text transcription to client: "${result.text.substring(0, 100)}${result.text.length > 100 ? '...' : ''}"`);
      } else {
        console.warn("No text transcription found in response");
        // Add a default text if none was returned
        result.text = "Response generated but no transcription available.";
      }
      
      // Add a separate transcription field for clarity
      if (!result.transcription && result.text) {
        result.transcription = result.text;
      }
      
      if (typeof ack === "function") ack(result);
    } catch (err) {
      console.error("Socket request error:", err);
      if (typeof ack === "function") {
        ack({ 
          error: "Failed to generate response: " + err.message,
          text: "Sorry, there was an error processing your request. Please try again."
        });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected", socket.id);
  });
});

// Set server timeout
httpServer.timeout = REQUEST_TIMEOUT;

httpServer.listen(PORT, () => {
  console.log(`Server (HTTP + WebSocket) listening on port ${PORT}`);
  console.log(`Request timeout set to ${REQUEST_TIMEOUT/1000} seconds`);
}); 