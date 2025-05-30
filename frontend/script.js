const chatEl = document.getElementById("chat");
const statusIndicator = document.getElementById("status-indicator");
const statusText = document.getElementById("status-text");
const listeningIndicator = document.getElementById("listening-indicator");
const controlText = document.getElementById("control-text");

let recognizing = false;
let recognition;
let connectionStatus = "disconnected";

// Initialize socket connection
let socket;

function updateConnectionStatus(status) {
  connectionStatus = status;
  
  // Remove all status classes
  statusIndicator.classList.remove("status-connected", "status-disconnected", "status-connecting");
  
  switch (status) {
    case "connected":
      statusIndicator.classList.add("status-connected");
      statusText.textContent = "Connected";
      break;
    case "connecting":
      statusIndicator.classList.add("status-connecting");
      statusText.textContent = "Connecting...";
      break;
    default:
      statusIndicator.classList.add("status-disconnected");
      statusText.textContent = "Disconnected";
  }
}

function updateListeningState(isListening) {
  if (isListening) {
    listeningIndicator.classList.remove("hidden");
    controlText.textContent = "🎙️ Listening... Click to stop";
  } else {
    listeningIndicator.classList.add("hidden");
    controlText.textContent = "🎙️ Click to start voice conversation";
  }
}

function appendMessage(text, sender = "assistant", audioData = null, mimeType = null) {
  // Create message container
  const messageContainer = document.createElement("div");
  messageContainer.className = `message-container ${sender}`;
  
  // Create message bubble
  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${sender === 'user' ? 'user-message' : 'assistant-message'}`;
  
  // Create avatar
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = sender === 'user' ? '👤' : '🤖';
  
  // Create message content
  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  
  // Create message text
  const messageText = document.createElement("p");
  messageText.className = "message-text";
  messageText.textContent = text;
  
  // Create timestamp
  const timestamp = document.createElement("p");
  timestamp.className = "message-time";
  timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Assemble the message
  messageContent.appendChild(messageText);
  messageContent.appendChild(timestamp);
  bubble.appendChild(avatar);
  bubble.appendChild(messageContent);
  messageContainer.appendChild(bubble);
  
  // Remove empty state if it exists
  const emptyState = chatEl.querySelector(".empty-state");
  if (emptyState) {
    emptyState.remove();
  }
  
  // Add message to chat
  chatEl.appendChild(messageContainer);
  chatEl.scrollTop = chatEl.scrollHeight;

  if (audioData) {
    // Add audio to the message and play it immediately
    appendMessage(text, "assistant", audioData, mimeType);
    playAudio(audioData, mimeType || "audio/wav");
  }
}

function playAudio(base64, mimeType) {
  const audio = new Audio(`data:${mimeType};base64,${base64}`);
  audio.play();
  
  // If speakWithAudio function is available (TalkingHead loaded), make the avatar speak
  if (typeof window.speakWithAudio === 'function') {
    window.speakWithAudio(base64);
  }
}

function startRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech Recognition not supported in this browser.");
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.onstart = () => {
    recognizing = true;
    updateListeningState(true);
  };
  recognition.onend = () => {
    recognizing = false;
    updateListeningState(false);
  };
  recognition.onerror = (e) => {
    console.error("Speech recognition error", e);
    recognizing = false;
    updateListeningState(false);
  };
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    appendMessage(transcript, "user");
    
    // If socket is connected, use it for sending the message
    if (socket && socket.connected) {
      try {
        updateConnectionStatus("connecting");
        const systemInstruction = document.getElementById("systemInstr").value;
        
        // Create a Promise to handle the acknowledgment
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Socket request timed out"));
          }, 60000); // 60 second timeout
          
          socket.emit("audioInput", {
            audioData: null, // No audio data for text input
            systemInstruction,
            mimeType: "text/plain",
            message: transcript // Add the transcript as a message
          }, (response) => {
            clearTimeout(timeout);
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response);
            }
          });
        });
        
        updateConnectionStatus("connected");
        if (response.error) throw new Error(response.error);
        appendMessage(response.text || "[Audio response]", "assistant", response.audioData, response.mimeType || "audio/wav");
      } catch (err) {
        console.error(err);
        updateConnectionStatus("disconnected");
        appendMessage("Error: " + err.message, "assistant");
      }
    } else {
      // Fallback to the old method
      await sendToBackend(transcript);
    }
  };
  recognition.start();
}

function initializeSocket() {
  if (socket) {
    socket.disconnect();
  }
  
  // Connect to the backend server
  socket = io();
  
  socket.on("connect", () => {
    console.log("Socket connected");
    updateConnectionStatus("connected");
  });
  
  socket.on("disconnect", () => {
    console.log("Socket disconnected");
    updateConnectionStatus("disconnected");
  });
  
  socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
    updateConnectionStatus("disconnected");
  });
}

// Initialize socket on page load
document.addEventListener('DOMContentLoaded', () => {
  initializeSocket();
  
  // Create and append the TalkingHead component container
  const talkingHeadContainer = document.createElement('div');
  talkingHeadContainer.id = 'talking-head';
  talkingHeadContainer.className = 'talking-head-wrapper';
  
  // Add it below the chat container
  const chatContainer = document.querySelector('.chat-container');
  if (chatContainer && chatContainer.parentNode) {
    chatContainer.parentNode.insertBefore(talkingHeadContainer, chatContainer.nextSibling);
  }
  
  // Add CSS for the TalkingHead container
  const style = document.createElement('style');
  style.textContent = `
    .talking-head-wrapper {
      width: 100%;
      height: 300px;
      margin: 20px 0;
      border-radius: 12px;
      overflow: hidden;
      background-color: #f5f5f5;
    }
  `;
  document.head.appendChild(style);

  // Initialize status
  updateConnectionStatus("disconnected");
  updateListeningState(false);

  // Add click handler for controlling speech recognition
  const controlsContainer = document.querySelector('.controls-container');
  if (controlsContainer) {
    controlsContainer.addEventListener('click', () => {
      if (recognizing) {
        recognition.stop();
      } else {
        startRecognition();
      }
    });
  }
});

async function sendToBackend(text) {
  try {
    updateConnectionStatus("connecting");
    
    if (socket && socket.connected) {
      // Use socket connection
      const systemInstruction = document.getElementById("systemInstr").value;
      
      // Create a Promise to handle the acknowledgment
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Socket request timed out"));
        }, 60000); // 60 second timeout
        
        socket.emit("audioInput", {
          audioData: null, // No audio data for text input
          systemInstruction,
          mimeType: "text/plain"
        }, (response) => {
          clearTimeout(timeout);
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response);
          }
        });
      });
      
      updateConnectionStatus("connected");
      if (response.error) throw new Error(response.error);
      appendMessage(response.text || "[Audio response]", "assistant", response.audioData, response.mimeType || "audio/wav");
    } else {
      // Fallback to REST API if socket not connected
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      
      updateConnectionStatus("connected");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      appendMessage(data.text || "[Audio response]", "assistant", data.audioData, data.mimeType || "audio/wav");
    }
  } catch (err) {
    console.error(err);
    updateConnectionStatus("disconnected");
    appendMessage("Error: " + err.message, "assistant");
  }
} 