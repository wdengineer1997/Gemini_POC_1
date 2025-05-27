import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { getCollectionCount } from "../utils/mongoClient.js";
import { generateAudioReply } from "./geminiService.js";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY missing in environment variables");
}

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  timeout: 60000 // Increase timeout to 60 seconds
});
const FUNCTION_MODEL_ID = "models/gemini-2.0-flash-001";

// Tool (function declaration) so Gemini can decide to call it
const mongoCountTool = {
  functionDeclarations: [
    {
      name: "get_document_count",
      description: "Return the number of documents that exist in the specified MongoDB collection.",
      parameters: {
        type: "object",
        properties: {
          collection: {
            type: "string",
            description: "Exact name of the MongoDB collection to query (case-sensitive)",
          },
        },
        required: ["collection"],
      },
    },
  ],
};


export async function generateAudioReplyWithDbFunction(userText, systemInstruction = "") {
  try {
    const userTurn = { role: "user", parts: [{ text: userText }] };
    let systemInstructionPayload = null;

    // Ensure system instruction is properly formatted
    if (systemInstruction && systemInstruction.trim().length > 0) {
      const trimmedInstruction = systemInstruction.trim();
      systemInstructionPayload = { 
        parts: [{ text: trimmedInstruction }] 
      };
      console.log("Using system instruction:", trimmedInstruction);
    }

    // First API call with system instruction and function calling
    console.log("Making first Gemini API call with function calling...");
    const firstResp = await ai.models.generateContent({
      model: FUNCTION_MODEL_ID,
      contents: [userTurn],   
      systemInstruction: systemInstructionPayload,    
      config: {
        temperature: 0.2, // Slightly increased temperature for more natural responses
        topP: 0.1,
        maxOutputTokens: 1024,
        tools: [mongoCountTool],
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: ["get_document_count"],
          },
        },
      }
    });

    const candidate = firstResp.candidates?.[0];
    if (!candidate) {
      console.error("No candidates returned from first API call");
      return await generateAudioReply("Sorry, I couldn't generate a response.", systemInstruction);
    }

    function findFuncPart(cand) {
      const parts = cand.content?.parts || [];
      return parts.find((p) => p.functionCall) || parts[0] || {};
    }

    const firstPart = findFuncPart(candidate);

    // Handle function calling logic
    if (firstPart.functionCall && firstPart.functionCall.name === "get_document_count") {
      const { collection } = firstPart.functionCall.args || {};
      let countResult = 0; 
      let functionCallSuccessful = false;
      let errorMessage = "";

      try {
        if (!collection || typeof collection !== 'string' || collection.trim() === '') {
          console.error("LLM provided invalid collection name:", collection);
          errorMessage = `Invalid collection name '${collection}' was provided for counting.`;
        } else {
          countResult = await getCollectionCount(collection);
          functionCallSuccessful = true;
        }
      } catch (err) {
        console.error(`Error running getCollectionCount for '${collection}':`, err);
        errorMessage = `Failed to retrieve count for collection '${collection}'. Database operation failed: ${err.message}`; 
      }

      const funcRespPayload = {
        name: "get_document_count",
        response: {
          collection: collection,
        },
      };

      if (functionCallSuccessful) {
        funcRespPayload.response.count = countResult;
      } else {
        funcRespPayload.response.error = errorMessage || `Could not retrieve count for collection '${collection}'.`;
      }

      const secondCallContents = [
        userTurn, // Original user turn
        {
          role: "model",
          parts: [firstPart],
        },
        {
          role: "user",
          parts: [{ functionResponse: funcRespPayload }],
        },
      ];
      
      // Second API call with function result and same system instruction
      console.log("Making second Gemini API call with function result...");
      const followResp = await ai.models.generateContent({
        model: FUNCTION_MODEL_ID,
        contents: secondCallContents, // Conversational history
        systemInstruction: systemInstructionPayload, // Pass system instruction here again
        config: {
          temperature: 0.2,
          topP: 0.1,
          maxOutputTokens: 1024,
          tools: [mongoCountTool],
          toolConfig: {
            functionCallingConfig: {
              mode: "NONE", // Don't allow function calling in the second response
            },
          },
        }
      });

      let finalText = findFuncPart(followResp.candidates?.[0] || {}).text;

      if (!finalText) { 
        if (functionCallSuccessful) {
          finalText = `There are ${countResult} documents in the ${collection} collection.`;
        } else {
          finalText = `Sorry, I encountered an issue retrieving the document count for '${collection}'. ${errorMessage}`; 
        }
      }
      
      console.log("Generating audio reply with:", finalText.substring(0, 100) + (finalText.length > 100 ? "..." : ""));
      return await generateAudioReply(finalText, systemInstruction);
    } else {
      // Handle case where model didn't use function calling
      console.log("Model did not use function calling, generating direct response");
      const modelGeneratedText = firstPart.text || "I was unable to process your request as expected. Please try rephrasing your question.";
      console.log("Generating audio reply with:", modelGeneratedText.substring(0, 100) + (modelGeneratedText.length > 100 ? "..." : ""));
      return await generateAudioReply(modelGeneratedText, systemInstruction);
    }
  } catch (err) {
    console.error("Error in generateAudioReplyWithDbFunction:", err);
    return { 
      text: "Sorry, an error occurred while processing your request: " + err.message,
      error: err.message
    };
  }
} 