const chatEl = document.getElementById("chat");
const micBtn = document.getElementById("micBtn");

let recognizing = false;
let recognition;

function appendMessage(text, sender = "assistant") {
  const div = document.createElement("div");
  div.className = `message ${sender}`;
  div.textContent = text;
  chatEl.appendChild(div);
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
    micBtn.classList.add("listening");
  };
  recognition.onend = () => {
    recognizing = false;
    micBtn.classList.remove("listening");
  };
  recognition.onerror = (e) => {
    console.error("Speech recognition error", e);
    recognizing = false;
    micBtn.classList.remove("listening");
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
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    appendMessage(data.text || "[Audio response]", "assistant");
    if (data.audioBase64) {
      playAudio(data.audioBase64, data.mimeType || "audio/wav");
    }
  } catch (err) {
    console.error(err);
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