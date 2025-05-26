import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGO_DB || "testdb";

let client;

async function getClient() {
  if (!client) {
    client = new MongoClient(uri, { maxPoolSize: 10 });
    await client.connect();
  }
  return client;
}

export async function getDb() {
  const c = await getClient();
  return c.db(dbName);
}

export async function getCollectionCount(collName) {
  const db = await getDb();
  return db.collection(collName).countDocuments();
}

export async function closeMongo() {
  if (client) await client.close();
} 