import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { getCollectionCount } from "../utils/mongoClient.js";
import { generateAudioReply } from "./geminiService.js";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY missing in environment variables");
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
  const userTurn = { role: "user", parts: [{ text: userText }] };
  let systemInstructionPayload;

  if (systemInstruction && systemInstruction.trim().length > 0) {
    systemInstructionPayload = { 
      parts: [{ text: systemInstruction.trim() }] 
    };
  }

  const firstResp = await ai.models.generateContent({
    model: FUNCTION_MODEL_ID,
    contents: [userTurn],   
    systemInstruction: systemInstructionPayload,    
    config: {
      temperature: 0,
      topP: 0.0,
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
    return generateAudioReply("Sorry, I couldn't generate a response.");
  }

  function findFuncPart(cand) {
    const parts = cand.content?.parts || [];
    return parts.find((p) => p.functionCall) || parts[0] || {};
  }

  const firstPart = findFuncPart(candidate);

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
      // funcRespPayload.response.count = "unavailable"; // Alternative to sending an error string
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
    // console.log("Contents for second Gemini call:", JSON.stringify(secondCallContents, null, 2)); // For debugging

    const followResp = await ai.models.generateContent({
      model: FUNCTION_MODEL_ID,
      contents: secondCallContents, // Conversational history
      systemInstruction: systemInstructionPayload, // Pass system instruction here again
      config: {
        temperature: 0,
        topP: 0.0,
        tools: [mongoCountTool],
        toolConfig: {
          functionCallingConfig: {
            mode: "NONE",
          },
        },
      }
    });
    // console.log("Gemini Follow-up Response:", JSON.stringify(followResp, null, 2)); // For debugging

    let finalText = findFuncPart(followResp.candidates?.[0] || {}).text;

    if (!finalText) { 
        if (functionCallSuccessful) {
            finalText = `There are ${countResult} documents in the ${collection} collection.`;
        } else {
            finalText = `Sorry, I encountered an issue retrieving the document count for '${collection}'. ${errorMessage}`; 
        }
    }
    return generateAudioReply(finalText, systemInstruction);
  } else {
    console.error(
      "Model did not return the expected 'get_document_count' function call, despite mode: ANY.",
      "First part received:", JSON.stringify(firstPart, null, 2)
    );
    const modelGeneratedText = firstPart.text || "I was unable to process your request to count documents as expected. Please ensure your query is clear or try rephrasing.";
    return generateAudioReply(modelGeneratedText, systemInstruction);
  }
} 