import {Role, Message} from "../model/types";

export interface SessionService {
  createSession(): Promise<string>;

  getMessages(sessionId: string): Promise<Message[]>;

  addMessage(
    sessionId: string,
    role: Role,
    content: string
  ): Promise<void>;
}