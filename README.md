# Gemini Direct Audio Chat

This is an updated version of the Gemini voice chat application that implements direct audio communication with Gemini, bypassing the text-to-speech and speech-to-text conversion steps for faster and more natural conversations.

## Key Features

- Direct audio input/output with Gemini
- Real-time voice recording
- Instant playback of audio responses
- System instructions support
- Optional API key configuration
- Modern, responsive UI

## Project Structure

```
.
├── backend_updated/
│   ├── server.js              # Express server with Socket.IO
│   ├── services/
│   │   └── geminiService.js   # Direct audio communication with Gemini
│   └── package.json           # Backend dependencies
└── frontend_updated/
    ├── pages/
    │   └── index.js           # Main React component
    ├── styles/
    │   └── globals.css        # Application styles
    └── package.json           # Frontend dependencies
```

## Setup Instructions

1. Clone the repository
2. Set up the backend:
   ```bash
   cd backend_updated
   npm install
   ```
3. Create a `.env` file in the backend directory with:
   ```
   GEMINI_API_KEY=your_api_key_here
   FRONTEND_URL=http://localhost:3000
   PORT=5000
   ```
4. Set up the frontend:
   ```bash
   cd frontend_updated
   npm install
   ```
5. Create a `.env` file in the frontend directory with:
   ```
   NEXT_PUBLIC_API_WS= https://gemini-poc-1.onrender.com
   ```

## Running the Application

1. Start the backend:
   ```bash
   cd backend_updated
   npm run dev
   ```
2. Start the frontend:
   ```bash
   cd frontend_updated
   npm run dev
   ```
3. Open http://localhost:3000 in your browser

## Usage

1. Grant microphone permissions when prompted
2. (Optional) Enter system instructions to customize Gemini's behavior
3. (Optional) Enter your Gemini API key if not configured in backend
4. Hold the microphone button to record your message
5. Release to send the audio to Gemini
6. Listen to Gemini's audio response
7. Repeat for natural conversation

## Technical Details

### Backend
- Uses Socket.IO for real-time communication
- Implements direct audio handling with Gemini API
- Supports system instructions for conversation context
- Handles API key management

### Frontend
- Built with Next.js and React
- Uses MediaRecorder API for audio capture
- Implements real-time audio playback
- Features a modern, responsive UI
- Supports both mouse and touch interactions

## Improvements Over Previous Version

1. **Faster Response Time**: By eliminating text conversion steps, the conversation flow is more natural and responsive
2. **Direct Audio Processing**: Audio is sent directly to and received directly from Gemini
3. **Improved UI/UX**: Enhanced visual feedback and more intuitive controls
4. **Better Error Handling**: Comprehensive error handling for audio recording and playback
5. **Mobile Support**: Full support for touch devices

## Requirements

- Node.js 14+
- Modern web browser with MediaRecorder API support
- Microphone access
- Gemini API key
