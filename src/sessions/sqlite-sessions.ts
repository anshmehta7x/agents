
import { v4 as uuidv4 } from "uuid";
import { db, initDatabase } from "../db/sqlite";
import { SessionService } from "./session-service";
import { Role, Message } from "../model/types";

export class SQLiteSessionService implements SessionService {
    constructor(){
        initDatabase();
    }

  async createSession(): Promise<string> {
    const sessionId = uuidv4();

    const stmt = db.prepare(`
      INSERT INTO sessions (id)
      VALUES (?)
    `);

    stmt.run(sessionId);

    return sessionId;
  }

  async getMessages(sessionId: string): Promise<Message[]> {
    const stmt = db.prepare(`
      SELECT role, content
      FROM messages
      WHERE session_id = ?
      ORDER BY id ASC
    `);

    const rows = stmt.all(sessionId) as {
      role: string;
      content: string;
    }[];

    return rows.map(row => ({
      role: row.role as Role,
      content: row.content,
    }));
  }

  async addMessage(
    sessionId: string,
    role: Role,
    content: string
  ): Promise<void> {
    const insertStmt = db.prepare(`
      INSERT INTO messages (session_id, role, content)
      VALUES (?, ?, ?)
    `);

    insertStmt.run(sessionId, role, content);

    const updateStmt = db.prepare(`
      UPDATE sessions
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    updateStmt.run(sessionId);
  }
}