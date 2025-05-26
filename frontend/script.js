const chatEl = document.getElementById("chat");
const micBtn = document.getElementById("micBtn");
const statusIndicator = document.getElementById("status-indicator");
const statusText = document.getElementById("status-text");
const listeningIndicator = document.getElementById("listening-indicator");
const controlText = document.getElementById("control-text");

let recognizing = false;
let recognition;
let connectionStatus = "disconnected";

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

function updateListeningState(listening) {
  if (listening) {
    listeningIndicator.classList.remove("hidden");
    micBtn.innerHTML = "🛑";
    micBtn.classList.remove("mic-inactive");
    micBtn.classList.add("mic-active");
    controlText.textContent = "🔴 Click to stop listening";
  } else {
    listeningIndicator.classList.add("hidden");
    micBtn.innerHTML = "🎤";
    micBtn.classList.remove("mic-active");
    micBtn.classList.add("mic-inactive");
    controlText.textContent = "🎙️ Click to start voice conversation";
  }
}

function appendMessage(text, sender = "assistant") {
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
}

function playAudio(base64, mimeType) {
  const audio = new Audio(`data:${mimeType};base64,${base64}`);
  audio.play();
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
    await sendToBackend(transcript);
  };
  recognition.start();
}

async function sendToBackend(text) {
  try {
    updateConnectionStatus("connecting");
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    
    updateConnectionStatus("connected");
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    appendMessage(data.text || "[Audio response]", "assistant");
    if (data.audioBase64) {
      playAudio(data.audioBase64, data.mimeType || "audio/wav");
    }
  } catch (err) {
    console.error(err);
    updateConnectionStatus("disconnected");
    appendMessage("Error: " + err.message, "assistant");
  }
}

micBtn.addEventListener("click", () => {
  if (recognizing) {
    recognition.stop();
  } else {
    startRecognition();
  }
});

// Initialize status
updateConnectionStatus("disconnected");
updateListeningState(false); 