const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const readline = require("readline");

const dbDir = path.resolve(__dirname, "../data");
const dbPath = path.join(dbDir, "agent.db");

if (!fs.existsSync(dbDir)) {
  console.error("Database directory does not exist:", dbDir);
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.error("Database file does not exist:", dbPath);
  process.exit(1);
}

const db = new Database(dbPath);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Do you want to clear the database? (yes/no): ", (answer) => {
  if (answer.toLowerCase() === "yes") {
    try {
      db.prepare("DELETE FROM sessions").run();
      db.prepare("DELETE FROM messages").run();
      db.prepare("DELETE FROM events").run();
      console.log("Database cleared successfully.");
    } catch (error) {
      console.error("Error clearing the database:", error.message);
    }
  } else {
    console.log("Database not cleared.");
  }

  console.log("--- Sessions ---");
  const sessions = db.prepare("SELECT * FROM sessions").all();
  console.table(sessions);

  console.log("\n--- Messages ---");
  const messages = db.prepare("SELECT * FROM messages").all();
  const truncatedMessages = messages.map((msg) => ({
    ...msg,
    content:
      typeof msg.content === "string" && msg.content.length > 20
        ? msg.content.slice(0, 20) + "..."
        : msg.content,
  }));
  console.table(truncatedMessages);

  console.log("\n--- Events ---");
  const events = db.prepare("SELECT * FROM events ORDER BY id ASC").all();
  const truncatedEvents = events.map((e) => ({
    ...e,
    payload:
      typeof e.payload === "string" && e.payload.length > 40
        ? e.payload.slice(0, 40) + "..."
        : e.payload,
  }));
  console.table(truncatedEvents);

  rl.close();
});
