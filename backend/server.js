import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server as IOServer } from "socket.io";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { generateAudioReply } from "./services/geminiService.js";
import { getCollectionCount } from "./utils/mongoClient.js";

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

// REST endpoint to fetch document count from MongoDB
app.get("/api/xyz-count", async (_req, res) => {
  try {
    const count = await getCollectionCount("xyz");
    res.json({ count });
  } catch (err) {
    console.error("Failed to fetch MongoDB count", err);
    res.status(500).json({ error: "Failed to fetch document count" });
  }
});

if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY missing in environment variables");
  process.exit(1);
}

// Socket.io handler
io.on("connection", (socket) => {
  console.log("Socket client connected", socket.id);

  socket.on("ask", async (data, ack) => {
    const message = data?.message;
    const systemInstruction = typeof data?.systemInstruction === "string" ? data.systemInstruction : "";
    const doFunctionCall = data?.functionCall === true;
    if (!message || typeof message !== "string") {
      if (typeof ack === "function") ack({ error: "'message' is required" });
      return;
    }
    try {
      const result = await generateAudioReply(message, systemInstruction);
      if (doFunctionCall) {
        try {
          result.docsCount = await getCollectionCount("xyz");
        } catch (err) {
          console.error("Error fetching docs count", err);
          result.docsCount = -1;
        }
      }
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