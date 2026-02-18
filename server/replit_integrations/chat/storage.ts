import { db } from "../../db";
import { conversations, messages } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

// NOTE: This chat storage interface is designed for a simple AI chat feature
// but the actual schema has evolved. The interface uses string IDs to match
// the conversations table schema. The messages table doesn't have a conversationId
// column in the current schema, so message-related methods are stubbed.

export interface IChatStorage {
  getConversation(id: string): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string, creatorUserId: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: string): Promise<void>;
  getMessagesByConversation(conversationId: string): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: string, role: string, content: string, senderId: string, senderName: string): Promise<typeof messages.$inferSelect>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: string) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  },

  async getAllConversations() {
    return db.select().from(conversations).orderBy(desc(conversations.createdAt));
  },

  async createConversation(title: string, creatorUserId: string) {
    const [conversation] = await db.insert(conversations).values({ 
      title, 
      creatorUserId,
      type: "direct",
      status: "active"
    }).returning();
    return conversation;
  },

  async deleteConversation(id: string) {
    // Note: Messages table doesn't have conversationId in current schema
    // This would need a proper messages-to-conversation relationship
    await db.delete(conversations).where(eq(conversations.id, id));
  },

  async getMessagesByConversation(_conversationId: string) {
    // Note: Current messages schema doesn't have conversationId
    // Messages are linked via different relationships
    // Return empty array as this feature needs schema update
    return [];
  },

  async createMessage(_conversationId: string, role: string, content: string, senderId: string, senderName: string) {
    // Create a message with the actual schema fields
    const [message] = await db.insert(messages).values({ 
      senderId,
      senderRole: role,
      senderName,
      content,
      environment: "demo"
    }).returning();
    return message;
  },
};
