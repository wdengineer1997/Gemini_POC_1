const xyzCollection = [];

export function seedMockData(count = 20) {
  if (xyzCollection.length > 0) return;
  for (let i = 1; i <= count; i++) {
    xyzCollection.push({ id: i, name: `Document ${i}`, timestamp: Date.now() });
  }
}

export function getDocumentCount() {
  return xyzCollection.length;
} 