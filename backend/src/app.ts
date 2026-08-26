import express from 'express';
import process from 'process';
import { MongoClient } from 'mongodb';

if (process.env.MONGO_URI === undefined) {
  console.error("MONGO_URI environment variable is not set")
  process.exit(1)
}

// An express app you can use to mount routes on. Feel free to modify this,
// and add any middlewares you think are necessary.
const app = express();
// A MongoDB client you can use to connect to the database.
// No collections are setup by default
const dbClient = new MongoClient(process.env.MONGO_URI);

async function start() {
  try {
    await dbClient.connect();
    console.log("Connected to MongoDB");
  } catch (err) {
    console.error("Failed to connect to MongoDB");
    console.error(err);
    process.exit(1);
  }

  app.get('/', (req, res) => {
    res.send('Hello World!\n');
  });

  app.listen(process.env.PORT, () => {
    return console.log(`Express is listening at http://localhost:${process.env.PORT}`);
  });
}

void start();

process.on('SIGINT', () => {
  console.info("Received SIGINT, closing application")
  dbClient.close()
  process.exit(0)
})