import type { Express, Request, Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { chatStorage } from './storage';

/*
Supported models: gemini-2.5-flash (fast), gemini-2.5-pro (advanced reasoning)
Usage: Include httpOptions with baseUrl and empty apiVersion when using AI Integrations (required)
*/

// This is using Replit's AI Integrations service, which provides Gemini-compatible API access without requiring your own Gemini API key.
const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: '',
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// NOTE: These routes are NOT registered in the main app - they conflict with
// the existing conversations API in routes.ts. This file is kept for reference
// but the registerChatRoutes function should NOT be called.

export function registerChatRoutes(app: Express): void {
  // Get all conversations
  app.get('/api/ai-chat/conversations', async (_req: Request, res: Response) => {
    try {
      const conversations = await chatStorage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  // Get single conversation with messages
  app.get('/api/ai-chat/conversations/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  // Create new conversation
  app.post('/api/ai-chat/conversations', async (req: Request, res: Response) => {
    try {
      const { title } = req.body;
      const userId = (req.headers['x-user-id'] as string) || 'anonymous';
      const conversation = await chatStorage.createConversation(title || 'New Chat', userId);
      res.status(201).json(conversation);
    } catch (error) {
      console.error('Error creating conversation:', error);
      res.status(500).json({ error: 'Failed to create conversation' });
    }
  });

  // Delete conversation
  app.delete('/api/ai-chat/conversations/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  });

  // Send message and get AI response (streaming)
  app.post('/api/ai-chat/conversations/:id/messages', async (req: Request, res: Response) => {
    try {
      const conversationId = req.params.id;
      const { content } = req.body;
      const userId = (req.headers['x-user-id'] as string) || 'anonymous';
      const userName = (req.headers['x-user-name'] as string) || 'User';

      // Save user message
      await chatStorage.createMessage(conversationId, 'user', content, userId, userName);

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = messages.map((m) => ({
        role: m.senderRole as 'user' | 'model',
        parts: [{ text: m.content }],
      }));

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Stream response from Gemini
      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        history: chatMessages,
      });

      const stream = await (await chat).sendMessageStream(content);
      let fullResponse = '';

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      // Save AI response
      await chatStorage.createMessage(conversationId, 'model', fullResponse, 'ai', 'AI Assistant');

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error('Error in chat:', error);
      res.write(`data: ${JSON.stringify({ error: 'Failed to get AI response' })}\n\n`);
      res.end();
    }
  });
}
