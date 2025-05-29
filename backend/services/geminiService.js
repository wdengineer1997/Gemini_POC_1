import { GoogleGenAI, Modality, MediaResolution } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const MODEL_ID = "models/gemini-2.0-flash-live-001";

// Create a WAV header for the audio data
function createWavHeader(dataLength, options = {}) {
  const {
    numChannels = 1,
    sampleRate = 24000,
    bitsPerSample = 16,
  } = options;

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);                      // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
  buffer.write('WAVE', 8);                      // Format
  buffer.write('fmt ', 12);                     // Subchunk1ID
  buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);        // NumChannels
  buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
  buffer.writeUInt32LE(byteRate, 28);           // ByteRate
  buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
  buffer.write('data', 36);                     // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

  return buffer;
}

export async function generateDirectAudioResponse(audioData, systemInstruction = "", apiKey = null, mimeType = "audio/webm") {
  try {
    // Validate input
    if (!audioData) {
      return { 
        error: "'audioData' is required",
        text: "Please provide audio data"
      };
    }
    
    // Additional validation for audioData length
    if (audioData.length < 500) {
      return {
        error: "Audio data too short",
        text: "The recorded audio is too short. Please try recording a longer message."
      };
    }
    
    console.log(`Processing audio data (${audioData.length} characters) with MIME type: ${mimeType}`);
    
    // Create the AI client with the provided API key or fall back to env variable
    const ai = new GoogleGenAI({ 
      apiKey: apiKey || process.env.GEMINI_API_KEY
    });
    
    const audioParts = [];
    let responseText = "";
    let done = false;
    
    // Configure the Live API session for audio input/output
    const session = await ai.live.connect({
      model: MODEL_ID,
      callbacks: {
        onopen: function() {
          console.log("Live API Session opened");
        },
        onmessage: function(message) {
          // Add more detailed message type debugging
          console.log("Received message:", {
            type: message.type || "undefined",
            hasServerContent: !!message.serverContent,
            hasModelTurn: !!message.serverContent?.modelTurn,
            hasParts: !!message.serverContent?.modelTurn?.parts,
            turnComplete: !!message.serverContent?.turnComplete
          });
          
          // Process audio parts
          if (message.serverContent?.modelTurn?.parts) {
            for (const part of message.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                console.log("Received audio data chunk from Live API, data length:", part.inlineData.data.length);
                audioParts.push(part.inlineData.data);
              }
              if (part.text) {
                console.log("Received text response:", part.text);
                responseText += part.text;
              }
            }
          }
          
          // Check if turn is complete
          if (message.serverContent?.turnComplete) {
            console.log("Turn complete, closing session");
            done = true;
            setTimeout(() => session.close(), 500);
          }
        },
        onerror: function(error) {
          console.error("Gemini Live API session error:", error);
          done = true;
        },
        onclose: function(event) {
          console.log("Live API Session closed:", event ? event.reason : "No reason provided");
          done = true;
        }
      },
      config: {
        // Configure for audio response
        responseModalities: [Modality.AUDIO], 
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
        speechConfig: {
          languageCode: 'en-US',
          voiceConfig: {
            prebuiltVoiceConfig: { 
              voiceName: "Puck", // Using Puck voice from the reference code
              sampleRateHertz: 24000,
            },
          },
          audioConfig: {
            encoding: "LINEAR16",
            sampleRateHertz: 24000,
            audioChannelCount: 1,
          },
        },
        // Context compression to extend session duration
        contextWindowCompression: {
          triggerTokens: '25600',
          slidingWindow: { targetTokens: '12800' },
        },
        // Include system instruction if provided
        ...(systemInstruction && systemInstruction.trim().length > 0 && {
          systemInstruction: {
            parts: [{ text: systemInstruction.trim() }],
          },
        }),
      },
    });

    console.log("Sending audio data to Gemini Live API");

    // Try using the right sending method based on the reference code
    try {
      // Use clientContent approach
      session.sendClientContent({
        turns: [
          {
            role: "user", 
            parts: [
              {
                inlineData: {
                  mimeType: mimeType, 
                  data: audioData
                }
              }
            ]
          }
        ],
        turnComplete: true
      });
      console.log("Audio data sent via sendClientContent");
    } catch (error) {
      console.error("Error with sendClientContent, trying fallback method:", error);
      
      // Fallback to realtimeInput if clientContent fails
      session.sendRealtimeInput({
        audio: {
          data: audioData,
          mimeType: mimeType
        }
      });
      console.log("Audio data sent via sendRealtimeInput");
    }

    // Wait for response with timeout
    const timeout = 90000; // 90 seconds
    const startTime = Date.now();
    
    // Poll for completion
    let waitInterval = 500; // Start with 500ms interval
    
    while (!done && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, waitInterval));
      
      // Increase wait interval gradually to reduce CPU usage
      if (waitInterval < 2000) {
        waitInterval += 100;
      }
    }
    
    if ((Date.now() - startTime) >= timeout) {
      console.error("Response timeout reached");
      session.close();
      throw new Error("Response timeout after 90 seconds");
    }

    // Process the response
    console.log(`Received ${audioParts.length} audio parts`);
    
    if (audioParts.length === 0 && responseText) {
      // If no audio was generated but we have text, return the text
      return { 
        text: responseText
      };
    } else if (audioParts.length > 0) {
      // Process the audio parts
      try {
        const buffers = audioParts.map(part => {
          // Validate each part is proper base64 before converting
          if (!/^[A-Za-z0-9+/=]+$/.test(part)) {
            console.error("Invalid base64 data in audio part");
            return Buffer.from([]);
          }
          return Buffer.from(part, 'base64');
        });
        
        const audioDataBuffer = Buffer.concat(buffers);
        console.log("Converted audio parts to buffer, size:", audioDataBuffer.length);
        
        if (audioDataBuffer.length === 0) {
          console.error("Audio buffer is empty after conversion");
          return { 
            error: "Failed to process audio data",
            text: responseText || "I couldn't generate audio. Here's my text response instead."
          };
        }
        
        // Create a proper WAV file from the raw audio data
        const wavHeader = createWavHeader(audioDataBuffer.length, {
          sampleRate: 24000,
          numChannels: 1,
          bitsPerSample: 16
        });
        
        const fullAudio = Buffer.concat([wavHeader, audioDataBuffer]);
        const audioBase64 = fullAudio.toString('base64');
        
        console.log("Generated WAV audio with size:", fullAudio.length, "bytes");
        console.log("Audio base64 sample (first 30 chars):", audioBase64.substring(0, 30));
        
        // Validate the base64 output
        if (!/^[A-Za-z0-9+/=]+$/.test(audioBase64)) {
          console.error("Generated invalid base64 data for audio");
          return { 
            error: "Invalid audio data generated",
            text: responseText || "Audio conversion failed. Here's my text response."
          };
        }
        
        return {
          audioData: audioBase64,
          mimeType: "audio/wav",
          text: responseText
        };
      } catch (conversionError) {
        console.error("Error converting audio data:", conversionError);
        return {
          error: "Audio conversion error: " + conversionError.message,
          text: responseText || "I couldn't convert the audio. Here's my text response instead."
        };
      }
    } else {
      return { 
        error: "No response received from Gemini",
        text: "Failed to generate audio response. Please try again."
      };
    }
  } catch (err) {
    console.error("Error in generateDirectAudioResponse:", err);
    return { 
      error: "Failed to generate audio response: " + err.message,
      text: "An error occurred while processing your request. Please try again in a moment."
    };
  }
} 