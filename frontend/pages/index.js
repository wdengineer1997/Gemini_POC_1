import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";
import VoiceChat from "../components/VoiceChat";
import AudioPlayer from "../components/AudioPlayer";

export default function Home() {
  const [systemInstr, setSystemInstr] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [messages, setMessages] = useState([]);

  // Connect to socket on component mount
  useEffect(() => {
    if (typeof window === "undefined") return; // SSR guard

    setSocketStatus("connecting");
    const socket = io(process.env.NEXT_PUBLIC_API_WS || "http://localhost:5000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Frontend] Socket connected");
      setSocketStatus("connected");
    });

    socket.on("disconnect", () => {
      console.log("[Frontend] Socket disconnected");
      setSocketStatus("disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("[Frontend] Socket connection error:", err);
      setSocketStatus("disconnected");
    });

    return () => {
      socket?.disconnect();
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Format timestamp for messages
  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle new message
  const handleNewMessage = (text, sender, audioData = null, mimeType = null, isUpdate = false) => {
    setMessages((prev) => {
      // If this is an update to the last message from the same sender
      if (isUpdate && prev.length > 0 && prev[prev.length - 1].sender === sender) {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          ...newMessages[newMessages.length - 1],
          text,
          ...(audioData && { audioData, mimeType })
        };
        return newMessages;
      }
      
      // Otherwise add as a new message
      return [...prev, {
        sender,
        text,
        timestamp: new Date(),
        audioData,
        mimeType
      }];
    });
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
            <div className={`status-indicator ${
              socketStatus === "connected" ? "status-connected" : 
              socketStatus === "connecting" ? "status-connecting" : 
              "status-disconnected"
            }`}>
              <div className="status-dot"></div>
              {socketStatus === "connected" && "Connected"}
              {socketStatus === "connecting" && "Connecting..."}
              {socketStatus === "disconnected" && "Disconnected"}
            </div>
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
                      {message.audioData && message.sender === 'assistant' && (
                        <div className="audio-player-container">
                          <AudioPlayer 
                            audioData={message.audioData}
                            mimeType={message.mimeType || 'audio/wav'}
                          />
                        </div>
                      )}
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

        {/* Audio Chat Controls */}
        <VoiceChat 
          socket={socketRef}
          socketStatus={socketStatus}
          systemInstructions={systemInstr}
          apiKey={apiKey}
          onNewMessage={handleNewMessage}
        />

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