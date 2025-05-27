import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [systemInstr, setSystemInstr] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [listening, setListening] = useState(false);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const shouldListenRef = useRef(false);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);

  const appendMessage = (text, sender) => {
    setMessages((prev) => [...prev, { sender, text, timestamp: new Date() }]);
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return; // SSR guard
    
    setSocketStatus("connecting");
    const socket = io(process.env.NEXT_PUBLIC_API_WS || "http://localhost:5000");
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketStatus("connected");
    });

    socket.on("disconnect", () => {
      setSocketStatus("disconnected");
    });

    socket.on("connect_error", () => {
      setSocketStatus("disconnected");
    });

    return () => {
      socket?.disconnect();
    };
  }, []);

  const sendToBackend = async (text) => {
    if (!socketRef.current) return;
    return new Promise((resolve, reject) => {
      socketRef.current
        .timeout(20000)
        .emit("ask", { 
          message: text, 
          systemInstruction: systemInstr,
          apiKey: apiKey.trim() // Send API key to backend
        }, (err, response) => {
          if (err) return reject(err);
          resolve(response);
        });
    })
      .then((data) => {
        if (!data) throw new Error("No response from server");
        if (data.error) throw new Error(data.error);
        let assistantText = data.text || "[Audio response]";
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
    recognition.continuous = true;
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
        recognition.start();
      }
    };

    recognition.onresult = async (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript.trim();
          if (!transcript) continue;
          stopAudio();
          appendMessage(transcript, "user");
          await sendToBackend(transcript);
        }
      }
    };

    return recognition;
  };

  const toggleMic = () => {
    if (shouldListenRef.current) {
      shouldListenRef.current = false;
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      setListening(false);
    } else {
      shouldListenRef.current = true;
      if (!recognitionRef.current) {
        recognitionRef.current = initRecognition();
      }
      recognitionRef.current?.start();
    }
  };

  const getStatusClass = () => {
    switch (socketStatus) {
      case "connected": return "status-connected";
      case "connecting": return "status-connecting";
      default: return "status-disconnected";
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="main-container">
      <div className="content-wrapper">
        {/* Header */}
        <div className="header">
          <h1 className="main-title">
            🤖 Gemini Voice Chat
          </h1>
          <div className="status-container">
            <div className={`status-indicator ${getStatusClass()}`}>
              <div className="status-dot"></div>
              {socketStatus === "connected" && "Connected"}
              {socketStatus === "connecting" && "Connecting..."}
              {socketStatus === "disconnected" && "Disconnected"}
            </div>
            {listening && (
              <div className="status-indicator listening-indicator">
                🎤 Listening...
              </div>
            )}
          </div>
        </div>

        {/* System Instructions */}
        <div className="card">
          <h3 className="card-header">
            ⚙️ System Instructions
          </h3>
          <textarea
            className="system-textarea"
            placeholder="Enter optional system instructions (e.g. 'You are a friendly assistant who speaks like a pirate')"
            value={systemInstr}
            onChange={(e) => setSystemInstr(e.target.value)}
            rows={3}
          />
        </div>
        
        {/* API Key Input */}
        <div className="card">
          <h3 className="card-header">
            🔑 Gemini API Key
          </h3>
          <div className="api-key-container">
            <div className="api-key-input-wrapper">
              <input
                type={showApiKey ? "text" : "password"}
                className="api-key-input"
                placeholder="Enter your Gemini API key (optional)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button 
                className="toggle-visibility-button"
                onClick={() => setShowApiKey(!showApiKey)}
                type="button"
              >
                {showApiKey ? "🙈" : "👁️"}
              </button>
            </div>
            <p className="api-key-info">
              {apiKey ? "✅ API key provided" : "⚠️ Using server's API key. You can provide your own for better reliability."}
            </p>
          </div>
        </div>

        {/* Chat Container */}
        <div className="chat-container">
          <div className="chat-header">
            💬 Conversation
          </div>
          <div 
            ref={chatContainerRef}
            className="chat-messages"
          >
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🗣️</div>
                <p className="empty-title">Start a conversation by clicking the microphone</p>
                <p className="empty-subtitle">Your voice will be converted to text and sent to Gemini</p>
              </div>
            ) : (
              messages.map((message, idx) => (
                <div key={idx} className={`message-container ${message.sender}`}>
                  <div className={`message-bubble ${message.sender === 'user' ? 'user-message' : 'assistant-message'}`}>
                    <div className="message-avatar">
                      {message.sender === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="message-content">
                      <p className="message-text">{message.text}</p>
                      <p className="message-time">
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="controls-container">
          <button
            className={`mic-button ${shouldListenRef.current ? 'mic-active' : 'mic-inactive'}`}
            onClick={toggleMic}
            title={shouldListenRef.current ? "Click to stop listening" : "Click to start listening"}
            disabled={socketStatus !== "connected"}
          >
            {listening ? '🛑' : '🎤'}
          </button>
          <p className="control-text">
            {socketStatus !== "connected" 
              ? "⏳ Waiting for server connection..." 
              : shouldListenRef.current 
                ? "🔴 Click to stop listening" 
                : "🎙️ Click to start voice conversation"
            }
          </p>
        </div>

        {/* Features */}
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎙️</div>
            <h4 className="feature-title">Voice Input</h4>
            <p className="feature-description">Speak naturally and your voice will be converted to text using advanced speech recognition</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <h4 className="feature-title">AI Processing</h4>
            <p className="feature-description">Powered by Google's Gemini AI for intelligent, contextual responses</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔊</div>
            <h4 className="feature-title">Audio Output</h4>
            <p className="feature-description">Get natural-sounding audio responses that you can hear clearly</p>
          </div>
        </div>
      </div>
    </div>
  );
} 