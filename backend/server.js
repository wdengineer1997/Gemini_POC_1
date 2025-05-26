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
const app = express();
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: {
    origin: "*",
  },
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
  try {
    const { message, systemInstruction = "" } = req.body;
    
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "'message' is required" });
    }
    
    const result = await generateAudioReplyWithDbFunction(message, systemInstruction);
    res.json(result);
  } catch (err) {
    console.error('REST API Error:', err);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

// Socket.io handler
io.on("connection", (socket) => {
  console.log("Socket client connected", socket.id);

  socket.on("ask", async (data, ack) => {
    const message = data?.message;
    const systemInstruction = typeof data?.systemInstruction === "string" ? data.systemInstruction : "";
    if (!message || typeof message !== "string") {
      if (typeof ack === "function") ack({ error: "'message' is required" });
      return;
    }
    try {
      const result = await generateAudioReplyWithDbFunction(message, systemInstruction);
      if (typeof ack === "function") ack(result);
    } catch (err) {
      console.error(err);
      if (typeof ack === "function") ack({ error: "Failed to generate response" });
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server (HTTP + WebSocket) listening on port ${PORT}`);
}); 