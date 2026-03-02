const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.resolve(__dirname, '../data');
const dbPath = path.join(dbDir, 'agent.db');

if (!fs.existsSync(dbDir)) {
	console.error('Database directory does not exist:', dbDir);
	process.exit(1);
}

if (!fs.existsSync(dbPath)) {
	console.error('Database file does not exist:', dbPath);
	process.exit(1);
}

const db = new Database(dbPath);

console.log('--- Sessions ---');
const sessions = db.prepare('SELECT * FROM sessions').all();
console.table(sessions);

console.log('\n--- Messages ---');
const messages = db.prepare('SELECT * FROM messages').all();
const truncatedMessages = messages.map(msg => ({
	...msg,
	content: typeof msg.content === 'string' && msg.content.length > 20
		? msg.content.slice(0, 20) + '...'
		: msg.content
}));
console.table(truncatedMessages);
