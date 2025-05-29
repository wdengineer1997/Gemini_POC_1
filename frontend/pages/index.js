import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";

export default function Home() {
  const [messages, setMessages] = useState([]);
  const [systemInstr, setSystemInstr] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const shouldListenRef = useRef(false);
  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const appendMessage = (text, sender, audioData = null, mimeType = null) => {
    setMessages((prev) => [
      ...prev,
      {
        sender,
        text,
        timestamp: new Date(),
        audioData,
        mimeType
      }
    ]);
  };

  const stopAudio = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  const playAudio = (base64, mimeType = "audio/wav") => {
    if (!base64) {
      console.error("[Frontend] playAudio: No audio data provided");
      return;
    }
    
    try {
      console.log("[Frontend] playAudio: Attempting to play audio. MimeType:", mimeType, 
        "Base64 length:", base64.length, 
        "First 30 chars:", base64.substring(0, 30), 
        "Last 30 chars:", base64.substring(base64.length - 30));
      
      // Validate the base64 data format
      if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
        console.error("[Frontend] playAudio: Invalid base64 data - contains non-base64 characters");
        return;
      }
      
      stopAudio(); // Ensure any existing audio is stopped
      
      // Create new Audio element
      const audio = new Audio();
      
      // Add event listeners for debugging
      audio.addEventListener('error', (e) => {
        console.error("[Frontend] Audio playback error:", e.target.error);
      });
      
      audio.addEventListener('canplaythrough', () => {
        console.log("[Frontend] Audio can play through");
      });
      
      audio.addEventListener('loadeddata', () => {
        console.log("[Frontend] Audio data loaded successfully");
      });
      
      // Set source after adding listeners
      audio.src = `data:${mimeType || 'audio/wav'};base64,${base64}`;
      audioRef.current = audio;
      
      // Play with proper error handling
      console.log("[Frontend] Attempting to play audio now");
      audio.play()
        .then(() => console.log("[Frontend] Audio playback started successfully"))
        .catch(e => {
          console.error("[Frontend] playAudio: Error playing audio:", e);
          
          // Try fallback to WAV if original type fails and it's not already WAV
          if (mimeType !== "audio/wav") {
            console.log("[Frontend] Trying fallback to audio/wav");
            playAudio(base64, "audio/wav");
          }
        });
    } catch (e) {
      console.error("[Frontend] Exception in playAudio:", e);
    }
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
    const socket = io("https://gemini-poc-1.onrender.com");
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
          console.log("[Frontend] Text request socket response received:", response ? "Response received" : "No response");
          
          if (err) {
            console.error("[Frontend] Socket error:", err);
            return reject(err);
          }
          
          if (!response) {
            console.error("[Frontend] Null/undefined response from server");
            return reject(new Error("No response from server"));
          }
          
          // Always resolve with the response, even if it contains an error
          resolve(response);
        });
    })
      .then((data) => {
        console.log("[Frontend] Text response data:", {
          hasError: !!data.error,
          hasText: !!data.text,
          hasAudioData: !!data.audioData
        });
        
        if (data.error) {
          console.error("[Frontend] Error in response:", data.error);
          appendMessage(`Error: ${data.error}`, "assistant");
          return;
        }
        
        let assistantText = data.text || "[Audio response]";

        console.log("[Frontend] sendToBackend: Received response with audioData. Calling playAudio.");
        appendMessage(assistantText, "assistant", data.audioData, data.mimeType);
        
        if (data.audioData) {
          playAudio(data.audioData, data.mimeType || "audio/wav");
        }
      })
      .catch((err) => {
        console.error(err);
        appendMessage("Error: " + err.message, "assistant");
      });
  };

  const sendAudioToBackend = async (audioData) => {
    if (!socketRef.current) {
      console.error("[Frontend] Socket not connected");
      appendMessage("Error: Socket not connected", "assistant");
      return;
    }

    appendMessage("Sending audio message...", "user");
    console.log("[Frontend] Sending audio to backend, length:", audioData.length);

    return new Promise((resolve, reject) => {
      // Set a timeout for the socket request
      const timeoutId = setTimeout(() => {
        console.error("[Frontend] Socket request timed out after 90 seconds");
        reject(new Error("Request timed out after 90 seconds"));
      }, 90000);
      
      socketRef.current.emit("audioInput", {
        audioData,
        systemInstruction: systemInstr,
        apiKey: apiKey.trim(),
        mimeType: "audio/webm"
      }, (response) => {
        // Clear the timeout as we got a response
        clearTimeout(timeoutId);
        
        // Add debug logging for socket response
        console.log("[Frontend] Socket response received:", {
          hasResponse: !!response,
          hasError: response && !!response.error,
          errorMessage: response && response.error,
          hasText: response && !!response.text,
          textLength: response && response.text ? response.text.length : 0,
          hasAudioData: response && !!response.audioData,
          audioDataLength: response && response.audioData ? response.audioData.length : 0,
          mimeType: response && response.mimeType
        });
        
        // Check for undefined or null response
        if (!response) {
          console.error("[Frontend] Socket callback received null/undefined response");
          reject(new Error("No response from server"));
          return;
        }
        
        // Always resolve with the response, even if it contains an error
        resolve(response);
      });
    })
      .then((data) => {
        setMessages(prev => {
          const newMessages = [...prev];
          if (newMessages.length > 0) {
            newMessages[newMessages.length - 1].text = "🎤 Audio message sent";
          }
          return newMessages;
        });

        // Now handle any errors from the response
        if (data.error) {
          console.error("[Frontend] Error in socket response:", data.error);
          appendMessage(`Error: ${data.error}`, "assistant");
          return; // Don't try to play audio if there's an error
        }

        let assistantText = data.text || "[Audio response]";

        if (data.audioData) {
          try {
            // Validate the audio data is proper base64 before trying to play it
            if (!/^[A-Za-z0-9+/=]+$/.test(data.audioData)) {
              console.error("[Frontend] Received invalid base64 audio data");
              appendMessage(assistantText + " (Audio playback failed - invalid data)", "assistant");
              return;
            }
            
            // Log detailed information about the received audio response
            console.log("[Frontend] sendAudioToBackend: Received valid audio data.", {
              mimeType: data.mimeType || "audio/wav",
              audioDataLength: data.audioData.length,
              textResponse: assistantText
            });
            
            // Add audio to the message and play it immediately
            // Ensure we explicitly set the correct MIME type
            const responseMimeType = data.mimeType || "audio/wav";
            appendMessage(assistantText, "assistant", data.audioData, responseMimeType);
            
            // Try to play the audio with proper MIME type
            console.log("[Frontend] Playing response audio with MIME type:", responseMimeType);
            playAudio(data.audioData, responseMimeType);
          } catch (e) {
            console.error("[Frontend] Error processing audio data:", e);
            appendMessage(assistantText + " (Audio playback failed)", "assistant");
          }
        } else {
          appendMessage(assistantText, "assistant");
        }
      })
      .catch((err) => {
        console.error("[Frontend] Audio processing error:", err);
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });


        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64data = reader.result.split(',')[1]; // Remove data URL prefix
          await sendAudioToBackend(base64data);
        };


        stream.getTracks().forEach(track => track.stop());
        setRecording(false);
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
      alert("Failed to access microphone. Please ensure microphone permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
    }
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

  // Create audio player for messages
  const AudioPlayer = ({ audioData, mimeType }) => {
    if (!audioData) return null;
    
    // Always ensure we have a valid MIME type with fallback
    const useMimeType = mimeType || 'audio/wav';
    
    // Log more details about the audio data
    console.log("[Frontend] AudioPlayer: Creating player with MIME type:", useMimeType, 
      "Audio data length:", audioData.length);
    
    // Create the data URL
    const audioUrl = `data:${useMimeType};base64,${audioData}`;
    
    // Use useEffect to add error handling to the audio element after it's rendered
    const audioRef = useRef(null);
    
    useEffect(() => {
      const audioElement = audioRef.current;
      if (audioElement) {
        audioElement.onerror = (e) => {
          console.error("[Frontend] AudioPlayer error:", e);
        };
      }
    }, []);

    return (
      <div className="audio-player-container">
        <audio
          ref={audioRef}
          controls
          src={audioUrl}
          className="message-audio-player"
          onLoadedData={() => console.log("[Frontend] Audio element loaded data successfully")}
          onCanPlay={() => console.log("[Frontend] Audio element can play")}
          autoPlay
          onError={(e) => {
            console.error("[Frontend] Audio element error:", e);
            // If error occurs and the MIME type isn't already WAV, try fallback
            if (useMimeType !== "audio/wav") {
              console.log("[Frontend] Audio element trying fallback to audio/wav");
              e.target.src = `data:audio/wav;base64,${audioData}`;
              e.target.load();
              e.target.play().catch(err => console.error("[Frontend] Fallback audio play error:", err));
            }
          }}
        />
      </div>
    );
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
            {recording && (
              <div className="status-indicator recording-indicator">
                🔴 Recording...
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
                      {message.audioData && message.sender === 'assistant' && (
                        <AudioPlayer
                          audioData={message.audioData}
                          mimeType={message.mimeType}
                        />
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

        {/* Controls */}
        <div className="controls-container">
          <button
            className={`record-button ${recording ? 'recording' : ''}`}
            onClick={recording ? stopRecording : startRecording}
            title={recording ? "Click to stop recording" : "Click to record audio message"}
            disabled={socketStatus !== "connected"}
          >
            {recording ? '⏹️' : '🎙️'}
          </button>
          <p className="control-text">
            {socketStatus !== "connected"
              ? "⏳ Waiting for server connection..."
              : recording
                ? "🔴 Recording audio message..."
                : shouldListenRef.current
                  ? "🔴 Click to stop listening"
                  : "🎙️ Choose speech-to-text or direct audio recording"
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