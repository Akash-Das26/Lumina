import { Router, type IRouter } from "express";
import { eq, count, desc } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import {
  CreateOpenaiConversationBody,
  GetOpenaiConversationParams,
  DeleteOpenaiConversationParams,
  ListOpenaiMessagesParams,
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
  GenerateOpenaiImageBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /openai/conversations
router.get("/openai/conversations", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt));
  res.json(rows);
});

// POST /openai/conversations
router.post("/openai/conversations", async (req, res): Promise<void> => {
  const parsed = CreateOpenaiConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [conv] = await db
    .insert(conversations)
    .values({ title: parsed.data.title, mode: parsed.data.mode ?? "chat" })
    .returning();
  res.status(201).json(conv);
});

// GET /openai/conversations/:id
router.get("/openai/conversations/:id", async (req, res): Promise<void> => {
  const params = GetOpenaiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, params.data.id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(messages.createdAt);
  res.json({ ...conv, messages: msgs });
});

// DELETE /openai/conversations/:id
router.delete("/openai/conversations/:id", async (req, res): Promise<void> => {
  const params = DeleteOpenaiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [conv] = await db
    .delete(conversations)
    .where(eq(conversations.id, params.data.id))
    .returning();
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.sendStatus(204);
});

// GET /openai/conversations/:id/messages
router.get(
  "/openai/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const params = ListOpenaiMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const msgs = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, params.data.id))
      .orderBy(messages.createdAt);
    res.json(msgs);
  },
);

// POST /openai/conversations/:id/messages (SSE streaming)
router.post(
  "/openai/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const params = SendOpenaiMessageParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SendOpenaiMessageBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const { id } = params.data;
    const { content, mode } = body.data;

    // Ensure conversation exists
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    // Persist user message
    await db.insert(messages).values({
      conversationId: id,
      role: "user",
      content: content ?? "",
    });

    // Build message history for context
    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(messages.createdAt);

    // Build system prompt based on mode
    const modePrompts: Record<string, string> = {
      chat: "You are a helpful, knowledgeable assistant. Be concise and clear.",
      search:
        "You are a web-aware assistant. Provide thorough, well-sourced answers as if you had searched the web. Cite your reasoning clearly.",
      write:
        "You are an expert writing coach and editor. Help the user write, refine, and improve their text. Focus on clarity, structure, and voice.",
      artist:
        "You are a creative director. Help the user craft vivid, detailed image prompts and describe visual concepts in rich detail.",
      translate:
        "You are a professional multilingual translator. Detect the source language and translate accurately, preserving tone and nuance. Explain any cultural context when relevant.",
    };

    const systemPrompt =
      modePrompts[mode ?? conv.mode ?? "chat"] ?? modePrompts["chat"];

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
      ...history.slice(-20).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const stream = await openai.chat.completions.create({
      model: "gpt-5.6-luna",
      max_completion_tokens: 4096,
      messages: chatMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
      }
    }

    // Persist assistant message
    await db.insert(messages).values({
      conversationId: id,
      role: "assistant",
      content: fullResponse,
    });

    // Auto-update conversation title from first message if it's still default
    if (conv.title === "New Chat" || conv.title === "New conversation") {
      const shortTitle = (content ?? "").slice(0, 60).trim();
      if (shortTitle) {
        await db
          .update(conversations)
          .set({ title: shortTitle })
          .where(eq(conversations.id, id));
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  },
);

// POST /openai/generate-image
router.post("/openai/generate-image", async (req, res): Promise<void> => {
  const body = GenerateOpenaiImageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const sizeMap: Record<string, "1024x1024" | "1536x1024" | "1024x1536"> = {
    "1024x1024": "1024x1024",
    "1536x1024": "1536x1024",
    "1024x1536": "1024x1536",
  };
  const size = sizeMap[body.data.size ?? "1024x1024"] ?? "1024x1024";
  const buffer = await generateImageBuffer(body.data.prompt, size);
  res.json({ b64_json: buffer.toString("base64") });
});

// GET /openai/stats
router.get("/openai/stats", async (_req, res): Promise<void> => {
  const [convCount] = await db.select({ value: count() }).from(conversations);
  const [msgCount] = await db.select({ value: count() }).from(messages);
  const recent = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.createdAt))
    .limit(5);
  res.json({
    totalConversations: convCount?.value ?? 0,
    totalMessages: msgCount?.value ?? 0,
    recentConversations: recent,
  });
});

export default router;
