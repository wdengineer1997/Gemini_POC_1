import { seedMockData, getDocumentCount } from "../utils/mockCollection.js";

seedMockData();
console.log(`Seeded ${getDocumentCount()} documents into collection 'xyz'.`); 