import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [systemInstr, setSystemInstr] = useState("");
  const [listening, setListening] = useState(false);
  const [useFunctionCall, setUseFunctionCall] = useState(false);
  const shouldListenRef = useRef(false);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const socketRef = useRef(null);

  const appendMessage = (text, sender) => {
    setMessages((prev) => [...prev, { sender, text }]);
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  const playAudio = (base64, mimeType = "audio/wav") => {
    if (!base64) return;
    const audio = new Audio(`data:${mimeType};base64,${base64}`);
    audioRef.current = audio;
    audio.play();
  };

  useEffect(() => {
    if (typeof window === "undefined") return; // SSR guard
    // connect once on mount
    socketRef.current = io(process.env.NEXT_PUBLIC_API_WS || "http://localhost:5000");
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  const sendToBackend = async (text) => {
    if (!socketRef.current) return;
    return new Promise((resolve, reject) => {
      socketRef.current
        .timeout(20000)
        .emit("ask", { message: text, systemInstruction: systemInstr, functionCall: useFunctionCall }, (err, response) => {
          if (err) return reject(err);
          resolve(response);
        });
    })
      .then((data) => {
        if (!data) throw new Error("No response from server");
        if (data.error) throw new Error(data.error);
        let assistantText = data.text || "[Audio response]";
        if (typeof data.docsCount === "number") {
          assistantText += `\n(Document count: ${data.docsCount})`;
        }
        appendMessage(assistantText, "assistant");
        if (data.audioBase64) {
          playAudio(data.audioBase64, data.mimeType);
        }
      })
      .catch((err) => {
        console.error(err);
        appendMessage("Error: " + err.message, "assistant");
      });
  };

  const initRecognition = () => {
    const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SpeechRecognition) {
      alert("Speech Recognition not supported in this browser.");
      return null;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true; // keep mic open
    recognition.lang = "en-US";
    recognition.interimResults = true;

    recognition.onstart = () => setListening(true);
    recognition.onerror = (e) => {
      console.error("Speech recognition error", e);
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      if (shouldListenRef.current) {
        // restart automatically for continuous conversation
        recognition.start();
      }
    };

    recognition.onresult = async (event) => {
      // iterate over results to find final transcripts
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript.trim();
          if (!transcript) continue;
          stopAudio(); // interrupt any current assistant speech
          appendMessage(transcript, "user");
          await sendToBackend(transcript);
        }
      }
    };

    return recognition;
  };

  const toggleMic = () => {
    if (shouldListenRef.current) {
      // stop listening completely and dispose of recognition instance
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null; // prevent auto-restart logic
        recognitionRef.current.abort(); // abort instead of stop to cancel quickly
        recognitionRef.current = null;
      }
      setListening(false);
    } else {
      // start listening
      shouldListenRef.current = true;
      if (!recognitionRef.current) {
        recognitionRef.current = initRecognition();
      }
      recognitionRef.current?.start();
    }
  };

  return (
    <div className="container">
      <h2>Gemini POC 1</h2>
      <textarea
        placeholder="Enter optional system instructions (e.g. 'You are a friendly assistant')"
        value={systemInstr}
        onChange={(e) => setSystemInstr(e.target.value)}
        rows={3}
        style={{ width: "100%", marginBottom: "0.75rem" }}
      />
      <div style={{ margin: '0.5rem 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            checked={useFunctionCall}
            onChange={(e) => setUseFunctionCall(e.target.checked)}
          />
          Enable document count function call
        </label>
      </div>
      <div className="chat">
        {messages.map((m, idx) => (
          <div key={idx} className={`message ${m.sender}`}>{m.text}</div>
        ))}
      </div>
      <div className="controls">
        <button
          className={shouldListenRef.current ? "mic listening" : "mic"}
          onClick={toggleMic}
          title={shouldListenRef.current ? "Click to stop mic" : "Click to start mic"}
        >
          🎤
        </button>
      </div>

      <style jsx>{`
        .container {
          padding: 1rem;
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 0 auto;
        }
        h2 {
          text-align: center;
        }
        .chat {
          background: #fff;
          padding: 1rem;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          max-height: 70vh;
          overflow-y: auto;
        }
        .message {
          margin-bottom: 1rem;
        }
        .user {
          text-align: right;
          color: #1a73e8;
        }
        .assistant {
          text-align: left;
          color: #222;
        }
        .controls {
          display: flex;
          justify-content: center;
          margin-top: 1rem;
        }
        .mic {
          background: #1a73e8;
          color: #fff;
          border: none;
          padding: 0.8rem 1.2rem;
          border-radius: 50%;
          cursor: pointer;
          font-size: 1.2rem;
          outline: none;
        }
        .mic.listening {
          background: #d93025;
        }
      `}</style>
    </div>
  );
} 