const chatEl = document.getElementById("chat");

let recognizing = false;
let recognition;

const socket = io();

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
  };
  recognition.onend = () => {
    recognizing = false;
  };
  recognition.onerror = (e) => {
    console.error("Speech recognition error", e);
    recognizing = false;
  };
  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    appendMessage(transcript, "user");
    await sendToBackend(transcript);
  };
  recognition.start();
}

async function sendToBackend(text) {
  const systemInstruction = document.getElementById("sysInstr")?.value || "";
  return new Promise((resolve, reject) => {
    socket
      .timeout(20000)
      .emit("ask", { message: text, systemInstruction }, (err, response) => {
        if (err) return reject(err);
        resolve(response);
      });
  })
    .then((data) => {
      if (!data) throw new Error("No response from server");
      if (data.error) throw new Error(data.error);
      appendMessage(data.text || "[Audio response]", "assistant");
      if (data.audioBase64) {
        playAudio(data.audioBase64, data.mimeType || "audio/wav");
      }
    })
    .catch((err) => {
      console.error(err);
      appendMessage("Error: " + err.message, "assistant");
    });
}

