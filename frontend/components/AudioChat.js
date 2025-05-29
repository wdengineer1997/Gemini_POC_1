import { useState, useRef, useEffect } from "react";

export default function AudioChat({ 
  socket, 
  socketStatus, 
  systemInstructions, 
  apiKey, 
  onNewMessage 
}) {
  const [micActive, setMicActive] = useState(false);
  const [listening, setListening] = useState(false);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);

  const recognitionRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const toggleMicrophone = () => {
    if (micActive) {
      stopMicrophone();
    } else {
      startMicrophone();
    }
  };

  const startMicrophone = () => {
    if (socketStatus !== "connected") {
      console.error("[AudioChat] Cannot start mic - socket not connected");
      return;
    }

    console.log("[AudioChat] Starting microphone");
    setMicActive(true);
    startSpeechRecognition();
  };

  const stopMicrophone = () => {
    console.log("[AudioChat] Stopping microphone");
    setMicActive(false);
    stopSpeechRecognition();
    stopAudioRecording();
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = typeof window !== "undefined" && 
      (window.SpeechRecognition || window.webkitSpeechRecognition);
    
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[AudioChat] Speech recognition started");
      setListening(true);
      startAudioRecording();
    };

    recognition.onerror = (event) => {
      console.error(`[AudioChat] Speech recognition error: ${event.error}`);
      
      if (event.error === "no-speech" && micActive) {
        try {
          setTimeout(() => {
            if (micActive && !processing) {
              recognition.start();
            }
          }, 100);
        } catch (e) {
          console.error("[AudioChat] Error restarting after no-speech:", e);
        }
        return;
      }
      
      setListening(false);
      if (event.error !== "aborted" && micActive && !processing) {
        try {
          setTimeout(() => {
            if (micActive && !processing) {
              recognition.start();
            }
          }, 300);
        } catch (e) {
          console.error("[AudioChat] Error restarting after error:", e);
        }
      }
    };

    recognition.onend = () => {
      console.log("[AudioChat] Speech recognition ended");
      setListening(false);
      
      if (micActive && !processing) {
        try {
          setTimeout(() => {
            if (micActive && !processing) {
              recognition.start();
            }
          }, 200);
        } catch (e) {
          console.error("[AudioChat] Error restarting recognition:", e);
        }
      }
    };

    recognition.onresult = async (event) => {
      let finalTranscript = "";
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        }
      }
      
      if (finalTranscript.trim()) {
        console.log("[AudioChat] Final transcript:", finalTranscript);
        
        stopSpeechRecognition();
        
        onNewMessage(finalTranscript, "user");
        
        const audioData = await stopAudioRecordingAndGetData();
        if (audioData) {
          setProcessing(true);
          try {
            await sendAudioToBackend(audioData);
          } finally {
            setProcessing(false);
            
            if (micActive) {
              startSpeechRecognition();
            }
          }
        } else {
          if (micActive) {
            startSpeechRecognition();
          }
        }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error("[AudioChat] Error starting speech recognition:", e);
      setMicActive(false);
    }
  };

  const stopSpeechRecognition = () => {
    if (!recognitionRef.current) return;
    
    try {
      recognitionRef.current.abort();
    } catch (e) {
      console.error("[AudioChat] Error stopping speech recognition:", e);
    } finally {
      recognitionRef.current = null;
      setListening(false);
    }
  };

  const startAudioRecording = async () => {
    if (audioStreamRef.current) return;
    
    try {
      console.log("[AudioChat] Starting audio recording");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.start();
      setRecording(true);
    } catch (e) {
      console.error("[AudioChat] Error starting audio recording:", e);
      alert("Could not access microphone. Please check permissions.");
      setMicActive(false);
    }
  };

  const stopAudioRecordingAndGetData = () => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") {
        resolve(null);
        return;
      }
      
      const handleStop = () => {
        if (audioChunksRef.current.length === 0) {
          cleanupRecording();
          resolve(null);
          return;
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        console.log("[AudioChat] Audio recording complete, size:", audioBlob.size, "bytes");
        
        if (audioBlob.size < 1000) {
          cleanupRecording();
          resolve(null);
          return;
        }
        
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          cleanupRecording();
          resolve(base64data);
        };
      };
      
      const cleanupRecording = () => {
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
        setRecording(false);
      };
      
      mediaRecorderRef.current.onstop = handleStop;
      mediaRecorderRef.current.stop();
    });
  };

  const stopAudioRecording = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
    
    console.log("[AudioChat] Stopping audio recording");
    
    mediaRecorderRef.current.onstop = () => {
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      setRecording(false);
    };
    
    mediaRecorderRef.current.stop();
  };

  const sendAudioToBackend = async (audioData) => {
    if (!socket.current) {
      console.error("[AudioChat] Socket not connected");
      onNewMessage("Error: Socket not connected", "assistant");
      return;
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        console.error("[AudioChat] Request timed out");
        reject(new Error("Request timed out after 90 seconds"));
      }, 90000);
      
      console.log("[AudioChat] Sending audio to backend");
      socket.current.emit("audioInput", {
        audioData,
        systemInstruction: systemInstructions,
        apiKey: apiKey.trim(),
        mimeType: "audio/webm"
      }, (response) => {
        clearTimeout(timeoutId);
        
        if (!response) {
          console.error("[AudioChat] Null response from server");
          reject(new Error("No response from server"));
          return;
        }
        
        resolve(response);
      });
    })
    .then((data) => {
      onNewMessage("🎤 Audio message sent", "user", null, null, true);
      
      if (data.error) {
        console.error("[AudioChat] Error in response:", data.error);
        onNewMessage(`Error: ${data.error}`, "assistant");
        return;
      }
      
      const assistantText = data.text || "[Audio response]";
      onNewMessage(
        assistantText, 
        "assistant", 
        data.audioData, 
        data.mimeType || "audio/wav"
      );
    })
    .catch((err) => {
      console.error("[AudioChat] Error processing response:", err);
      onNewMessage("Error: " + err.message, "assistant");
    });
  };

  return (
    <div className="controls-container">
      <button
        className={`mic-button ${micActive ? 'mic-active' : 'mic-inactive'}`}
        onClick={toggleMicrophone}
        title={micActive ? "Click to stop listening" : "Click to start listening"}
        disabled={socketStatus !== "connected" || processing}
      >
        {listening ? '🎤 (Listening)' : recording ? '🎤 (Recording)' : processing ? '⏳' : '🎤'}
      </button>
      <p className="control-text">
        {socketStatus !== "connected"
          ? "⏳ Waiting for server connection..."
          : processing
            ? "⏳ Processing your message..."
            : recording
              ? "🔴 Recording audio message..."
              : listening
                ? "🎤 Listening to your voice..."
                : micActive
                  ? "🎤 Waiting for you to speak..."
                  : "🎙️ Click the microphone to start"
        }
      </p>
    </div>
  );
} 