import { useState, useRef, useEffect } from "react";

// Simple event bus for audio playback status communication
export const audioEvents = {
  listeners: {},
  
  subscribe: (event, callback) => {
    if (!audioEvents.listeners[event]) {
      audioEvents.listeners[event] = [];
    }
    audioEvents.listeners[event].push(callback);
    return () => {
      audioEvents.listeners[event] = audioEvents.listeners[event].filter(cb => cb !== callback);
    };
  },
  
  publish: (event, data) => {
    if (audioEvents.listeners[event]) {
      audioEvents.listeners[event].forEach(callback => callback(data));
    }
  }
};

export default function VoiceChat({ 
  socket, 
  socketStatus, 
  systemInstructions, 
  apiKey, 
  onNewMessage 
}) {
  // UI States
  const [micActive, setMicActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [responseReceived, setResponseReceived] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  // Technical refs
  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timeoutRef = useRef(null);

  // Listen for audio playback events
  useEffect(() => {
    const unsubscribeStart = audioEvents.subscribe('audio-play-start', () => {
      console.log("[VoiceChat] Detected audio playback start");
      setAudioPlaying(true);
      
      // Stop recognition while audio is playing to prevent it from picking up the response
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch (e) {
          console.error("[VoiceChat] Error stopping recognition during audio playback:", e);
        }
      }
    });
    
    const unsubscribeEnd = audioEvents.subscribe('audio-play-end', () => {
      console.log("[VoiceChat] Detected audio playback end");
      setAudioPlaying(false);
      
      // Restart recognition after a short delay when audio ends
      if (micActive && !processing) {
        timeoutRef.current = setTimeout(() => {
          if (micActive && !processing) {
            startSpeechRecognition();
          }
        }, 500);
      }
    });
    
    return () => {
      unsubscribeStart();
      unsubscribeEnd();
    };
  }, [micActive, processing]);

  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      cleanupResources();
    };
  }, []);

  // Force restart recognition when response is received
  useEffect(() => {
    if (responseReceived && micActive && !processing && !audioPlaying) {
      console.log("[VoiceChat] Response received, restarting recognition");
      setResponseReceived(false);
      
      // Allow a brief pause before restarting
      timeoutRef.current = setTimeout(() => {
        if (micActive && !processing && !audioPlaying) {
          startSpeechRecognition();
        }
      }, 500);
    }
  }, [responseReceived, micActive, processing, audioPlaying]);

  /**
   * Full cleanup of all resources
   */
  const cleanupResources = () => {
    // Clear any pending timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Stop speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      } catch (e) {
        console.error("[VoiceChat] Error stopping recognition during cleanup:", e);
      }
    }

    // Stop media stream
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      } catch (e) {
        console.error("[VoiceChat] Error stopping stream during cleanup:", e);
      }
    }

    // Reset recorder
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
  };

  /**
   * Toggle microphone on/off
   */
  const toggleMicrophone = () => {
    if (micActive) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  };

  /**
   * Start microphone and begin listening
   */
  const startMicrophone = () => {
    if (socketStatus !== "connected") {
      console.error("[VoiceChat] Cannot start mic - socket not connected");
      return;
    }

    console.log("[VoiceChat] Starting microphone");
    setMicActive(true);
    
    // Small delay to ensure UI updates before starting recognition
    setTimeout(() => {
      startSpeechRecognition();
    }, 100);
  };

  /**
   * Stop microphone and all associated processes
   */
  const stopMicrophone = () => {
    console.log("[VoiceChat] Stopping microphone");
    setMicActive(false);
    cleanupResources();
    setListening(false);
    setRecording(false);
  };

  /**
   * Initialize and start the speech recognition
   */
  const startSpeechRecognition = () => {
    // Don't start recognition if audio is playing
    if (audioPlaying) {
      console.log("[VoiceChat] Not starting recognition while audio is playing");
      return;
    }
    
    console.log("[VoiceChat] Starting speech recognition");
    
    // Clear any existing timeouts
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Clean up any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {
        console.error("[VoiceChat] Error aborting existing recognition:", e);
      }
      recognitionRef.current = null;
    }
    
    const SpeechRecognition = typeof window !== "undefined" && 
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser.");
      setMicActive(false);
      return;
    }

    try {
      // Create a new recognition instance for each session
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 1;

      // Speech recognition started
      recognition.onstart = () => {
        console.log("[VoiceChat] Speech recognition started");
        setListening(true);
        startAudioRecording();
      };

      // Handle speech recognition errors
      recognition.onerror = (event) => {
        console.error(`[VoiceChat] Speech recognition error: ${event.error}`);
        
        // No speech error is common and not fatal
        if (event.error === "no-speech") {
          setListening(false);
          
          // If mic is still active, restart after a short delay
          if (micActive && !processing) {
            timeoutRef.current = setTimeout(() => {
              if (micActive && !processing) {
                startSpeechRecognition();
              }
            }, 300);
          }
          return;
        }
        
        // Handle other errors
        setListening(false);
        
        // If not manually aborted and mic is still active, try to restart
        if (event.error !== "aborted" && micActive && !processing) {
          timeoutRef.current = setTimeout(() => {
            if (micActive && !processing) {
              startSpeechRecognition();
            }
          }, 500);
        }
      };

      // Handle speech recognition ending
      recognition.onend = () => {
        console.log("[VoiceChat] Speech recognition ended normally");
        setListening(false);
        
        // If mic should still be active and we're not processing, restart
        if (micActive && !processing && !responseReceived) {
          timeoutRef.current = setTimeout(() => {
            if (micActive && !processing) {
              startSpeechRecognition();
            }
          }, 300);
        }
      };

      // Handle speech recognition results
      recognition.onresult = async (event) => {
        let finalTranscript = "";
        
        // Extract final transcript
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }
        
        // Process final speech result
        if (finalTranscript.trim()) {
          console.log("[VoiceChat] Final transcript:", finalTranscript);
          
          // Stop speech recognition to prevent capturing response
          try {
            recognition.abort();
            recognitionRef.current = null;
          } catch (e) {
            console.error("[VoiceChat] Error stopping recognition after result:", e);
          }
          
          setListening(false);
          
          // Add user message to UI
          onNewMessage(finalTranscript, "user");
          
          // Get audio data and send to backend
          const audioData = await stopAudioRecordingAndGetData();
          if (audioData) {
            setProcessing(true);
            
            try {
              await sendAudioToBackend(audioData);
            } catch (err) {
              console.error("[VoiceChat] Error sending audio to backend:", err);
              onNewMessage(`Error: ${err.message}`, "assistant");
            } finally {
              setProcessing(false);
              setResponseReceived(true);
            }
          } else {
            console.log("[VoiceChat] No valid audio data to send");
            // If mic is still active, restart recognition
            if (micActive) {
              timeoutRef.current = setTimeout(() => {
                if (micActive) {
                  startSpeechRecognition();
                }
              }, 300);
            }
          }
        }
      };

      // Store and start
      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error("[VoiceChat] Error setting up speech recognition:", e);
      setMicActive(false);
      setListening(false);
      
      // Try to restart after a short delay if this was a temporary error
      if (micActive) {
        timeoutRef.current = setTimeout(() => {
          if (micActive) {
            startSpeechRecognition();
          }
        }, 1000);
      }
    }
  };

  /**
   * Start recording audio
   */
  const startAudioRecording = async () => {
    // Clean up any existing recording first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    try {
      console.log("[VoiceChat] Starting audio recording");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start(100); // Collect data in 100ms chunks
      setRecording(true);
    } catch (e) {
      console.error("[VoiceChat] Error starting audio recording:", e);
      alert("Could not access microphone. Please check permissions.");
      setMicActive(false);
      setRecording(false);
    }
  };

  /**
   * Stop audio recording and return the audio data
   */
  const stopAudioRecordingAndGetData = () => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") {
        console.log("[VoiceChat] No active recording to stop");
        resolve(null);
        return;
      }
      
      console.log("[VoiceChat] Stopping audio recording and getting data");
      
      const handleStop = () => {
        if (!audioChunksRef.current.length) {
          console.log("[VoiceChat] No audio chunks collected");
          cleanupAudioResources();
          resolve(null);
          return;
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        console.log("[VoiceChat] Audio recording complete, size:", audioBlob.size, "bytes");
        
        if (audioBlob.size < 1000) {
          console.log("[VoiceChat] Audio too small, ignoring");
          cleanupAudioResources();
          resolve(null);
          return;
        }
        
        // Convert to base64
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          cleanupAudioResources();
          resolve(base64data);
        };
        
        reader.onerror = () => {
          console.error("[VoiceChat] Error reading audio blob");
          cleanupAudioResources();
          resolve(null);
        };
      };
      
      const cleanupAudioResources = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setRecording(false);
      };
      
      // Set stop handler and stop recording
      mediaRecorderRef.current.onstop = handleStop;
      
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("[VoiceChat] Error stopping media recorder:", e);
        cleanupAudioResources();
        resolve(null);
      }
    });
  };

  /**
   * Send audio data to the backend
   */
  const sendAudioToBackend = async (audioData) => {
    if (!socket.current) {
      throw new Error("Socket not connected");
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Request timed out after 90 seconds"));
      }, 90000);
      
      console.log("[VoiceChat] Sending audio to backend");
      
      // Update user message to show sending state
      onNewMessage("Sending your message...", "user", null, null, true);
      
      socket.current.emit("audioInput", {
        audioData,
        systemInstruction: systemInstructions,
        apiKey: apiKey.trim(),
        mimeType: "audio/webm"
      }, (response) => {
        clearTimeout(timeoutId);
        
        if (!response) {
          reject(new Error("No response from server"));
          return;
        }
        
        resolve(response);
      });
    })
    .then((data) => {
      // Update user message to show completion
      onNewMessage("🎤 Message sent", "user", null, null, true);
      
      // Handle errors in response
      if (data.error) {
        throw new Error(data.error);
      }
      
      // Process response
      const assistantText = data.text || "[Audio response]";
      
      // Check for valid audio data
      if (data.audioData) {
        onNewMessage(
          assistantText, 
          "assistant", 
          data.audioData, 
          data.mimeType || "audio/wav"
        );
      } else {
        onNewMessage(assistantText, "assistant");
      }
    });
  };

  // Render UI with video call styling
  return (
    <div className="video-call-controls-wrapper">
      <div className="call-status-indicator">
        {socketStatus !== "connected" ? (
          <span className="status-badge connecting">Connecting...</span>
        ) : processing ? (
          <span className="status-badge processing">Processing...</span>
        ) : recording && !listening ? (
          <span className="status-badge recording">Recording...</span>
        ) : listening ? (
          <span className="status-badge listening">Listening...</span>
        ) : micActive ? (
          <span className="status-badge ready">Ready</span>
        ) : (
          <span className="status-badge idle">Call Ready</span>
        )}
      </div>
      
      <div className="video-call-actions">
        <button
          className={`video-call-button mic-button ${micActive ? 'active' : ''}`}
          onClick={toggleMicrophone}
          disabled={socketStatus !== "connected" || processing}
          title={micActive ? "End call" : "Start call"}
        >
          {micActive ? (
            <span className="button-icon">📞</span>
          ) : (
            <span className="button-icon">📞</span>
          )}
        </button>
        
        {micActive && (
          <button
            className="video-call-button mute-button"
            onClick={stopMicrophone}
            title="Mute microphone"
          >
            <span className="button-icon">🔇</span>
          </button>
        )}
      </div>
      
      <style jsx>{`
        .video-call-controls-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin: 20px 0;
        }
        
        .call-status-indicator {
          margin-bottom: 15px;
        }
        
        .status-badge {
          padding: 6px 12px;
          border-radius: 16px;
          font-size: 14px;
          font-weight: 500;
          color: white;
        }
        
        .connecting {
          background: #007aff;
        }
        
        .processing {
          background: #ff9500;
        }
        
        .recording {
          background: #ff3b30;
          animation: pulse 1.5s infinite;
        }
        
        .listening {
          background: #34c759;
          animation: pulse 1.5s infinite;
        }
        
        .ready {
          background: #5856d6;
        }
        
        .idle {
          background: #8e8e93;
        }
        
        .video-call-actions {
          display: flex;
          gap: 16px;
        }
        
        .video-call-button {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          border: none;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #444;
          color: white;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .video-call-button:hover {
          transform: scale(1.05);
        }
        
        .video-call-button:active {
          transform: scale(0.95);
        }
        
        .video-call-button:disabled {
          background: #555;
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .mic-button {
          background: ${micActive ? '#ff3b30' : '#34c759'};
          transform: ${micActive ? 'rotate(135deg)' : 'rotate(0)'};
        }
        
        .mic-button.active {
          background: #ff3b30;
        }
        
        .mute-button {
          background: #007aff;
        }
        
        .button-icon {
          font-size: 24px;
        }
        
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.8; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
} 