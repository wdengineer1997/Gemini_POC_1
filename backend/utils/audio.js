// Wave conversion utilities adopted from Google sample
import { writeFile } from "fs";
import mime from "mime";

export function saveBinaryFile(fileName, content) {
  return new Promise((resolve, reject) => {
    writeFile(fileName, content, "utf8", (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function convertToWav(rawBase64DataParts, mimeType) {
  const options = parseMimeType(mimeType);
  const dataLength = rawBase64DataParts.reduce((a, b) => a + Buffer.from(b, "base64").length, 0);
  const wavHeader = createWavHeader(dataLength, options);
  const buffer = Buffer.concat(rawBase64DataParts.map((data) => Buffer.from(data, "base64")));
  return Buffer.concat([wavHeader, buffer]);
}

function parseMimeType(mimeType = "audio/pcm;rate=24000") {
  const [fileType, ...params] = mimeType.split(";").map((s) => s.trim());
  const [, format] = fileType.split("/");
  const options = {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16,
  };
  if (format && format.startsWith("L")) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) options.bitsPerSample = bits;
  }
  params.forEach((param) => {
    const [key, value] = param.split("=").map((s) => s.trim());
    if (key === "rate") options.sampleRate = parseInt(value, 10);
  });
  return options;
}

function createWavHeader(dataLength, { numChannels, sampleRate, bitsPerSample }) {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = Buffer.alloc(44);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
} 