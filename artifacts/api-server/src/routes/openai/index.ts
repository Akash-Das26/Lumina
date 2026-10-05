import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, lt, count } from "drizzle-orm";
import { db, conversations, messages } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server/image";
import {
  CreateOpenaiConversationBody,
  GetOpenaiConversationParams,
  ListOpenaiMessagesParams,
  ListOpenaiConversationsQueryParams,
  ListOpenaiMessagesQueryParams,
  SendOpenaiMessageParams,
  SendOpenaiMessageBody,
  GenerateOpenaiImageBody,
} from "@workspace/api-zod";
import { requireAuth } from "../../lib/session";

const router: IRouter = Router();

// Every conversation route is user-scoped (BUG-003): requests without a valid
// session cookie are rejected before any handler runs.
router.use(requireAuth);

type SearchSource = {
  title: string;
  url: string;
  snippet: string;
  domain: string;
};

async function searchPublicSources(query: string): Promise<SearchSource[]> {
  const encoded = encodeURIComponent(query.trim());
  const sources: SearchSource[] = [];

  // Fetch Wikipedia and DuckDuckGo concurrently. The two public endpoints are
  // independent and never block each other; running them sequentially meant a
  // slow Wikipedia response delayed the DuckDuckGo call and prolonged the
  // latency of every search. allSettled keeps the old failure isolation: one
  // provider being unreachable must not cost the other's results. The cap
  // below keeps the result set bounded even when both sources report more
  // topics than the frontend asks for.
  const [wikipediaSettled, duckduckgoSettled] = await Promise.allSettled([
    fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encoded}&limit=5&namespace=0&format=json`,
      { headers: { "User-Agent": "LuminaAI/1.0 research feature" } },
    ),
    fetch(
      `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "User-Agent": "LuminaAI/1.0 research feature" } },
    ),
  ]);
  const wikipediaResponse =
    wikipediaSettled.status === "fulfilled" ? wikipediaSettled.value : null;
  const duckduckgoResponse =
    duckduckgoSettled.status === "fulfilled" ? duckduckgoSettled.value : null;

  try {
    if (wikipediaResponse?.ok) {
      const data = (await wikipediaResponse.json()) as [string, string[], string[], string[]];
      const titles = data[1] ?? [];
      const descriptions = data[2] ?? [];
      const urls = data[3] ?? [];
      titles.forEach((title, index) => {
        if (urls[index]) {
          sources.push({
            title,
            url: urls[index],
            snippet: descriptions[index] || `Wikipedia article about ${title}.`,
            domain: "wikipedia.org",
          });
        }
      });
    }
  } catch {
    // Wikipedia was unreachable; DuckDuckGo is still tried below.
  }

  try {
    if (duckduckgoResponse?.ok) {
      const data = (await duckduckgoResponse.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        Heading?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };
      if (data.AbstractText && data.AbstractURL) {
        sources.unshift({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.AbstractText,
          domain: new URL(data.AbstractURL).hostname.replace(/^www\./, ""),
        });
      }
      for (const topic of data.RelatedTopics ?? []) {
        if (topic.Text && topic.FirstURL && sources.length < 6) {
          sources.push({
            title: topic.Text.split(" - ")[0].slice(0, 90),
            url: topic.FirstURL,
            snippet: topic.Text,
            domain: new URL(topic.FirstURL).hostname.replace(/^www\./, ""),
          });
        }
      }
    }
  } catch {
    // Return any Wikipedia results collected above.
  }

  return sources.slice(0, 6);
}

router.get("/openai/search", async (req, res): Promise<void> => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length < 2) {
    res.status(400).json({ error: "Search query must be at least 2 characters." });
    return;
  }
  try {
    const sources = await searchPublicSources(query);
    res.json({ query, sources });
  } catch {
    res.status(502).json({ error: "Live search is temporarily unavailable." });
  }
});

// GET /openai/conversations — user-scoped, cursor-paginated (newest first).
router.get("/openai/conversations", async (req, res): Promise<void> => {
  const parsed = ListOpenaiConversationsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { limit, cursor } = parsed.data;

  // Cursor = id of the last item on the previous page. The list is newest
  // first (desc), so the next page holds ids SMALLER than the cursor
  // (BUG-004: gt() here made every page repeat the first one).
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, req.userId),
        cursor ? lt(conversations.id, cursor) : undefined,
      ),
    )
    .orderBy(desc(conversations.id))
    .limit(limit + 1);

  // The extra row exists purely to detect a next page; it is never returned.
  res.json(rows.slice(0, limit));
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
    .values({
      userId: req.userId,
      title: parsed.data.title,
      mode: parsed.data.mode ?? "chat",
    })
    .returning();
  res.status(201).json(conv);
});

// Loads a conversation owned by the current user, or null. Id-scoped routes
// treat another user's conversation exactly like a missing one (404).
async function findOwnedConversation(userId: number, id: number) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return conv ?? null;
}

// GET /openai/conversations/:id
router.get("/openai/conversations/:id", async (req, res): Promise<void> => {
  const params = GetOpenaiConversationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const conv = await findOwnedConversation(req.userId, params.data.id);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt));
  res.json({ ...conv, messages: msgs });
});// DELETE /openai/conversations/:id
// Audit 2 (F-01, F-05): the id is taken from the path param only. The old
// zod params schema accepted extra body fields, so a crafted DELETE body
// could smuggle values past body-parsing validation. A plain numeric check
// keeps the contract strict and parsing-free.
router.delete("/openai/conversations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Missing or invalid conversation id." });
    return;
  }
  const [conv] = await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, req.userId)))
    .returning();
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.sendStatus(204);
});

// GET /openai/conversations/:id/messages — cursor-paginated (oldest first).
router.get(
  "/openai/conversations/:id/messages",
  async (req, res): Promise<void> => {
    const params = ListOpenaiMessagesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const conv = await findOwnedConversation(req.userId, params.data.id);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    const parsed = ListOpenaiMessagesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { limit, cursor } = parsed.data;

    const msgs = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conv.id),
          cursor ? gt(messages.id, cursor) : undefined,
        ),
      )
      .orderBy(asc(messages.id))
      .limit(limit + 1);

    res.json(msgs.slice(0, limit));
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

    const conv = await findOwnedConversation(req.userId, id);
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
      .orderBy(asc(messages.createdAt));

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
    const suppliedContext =
      typeof req.body.context === "string" ? req.body.context.slice(0, 24000) : "";
    const groundedPrompt = suppliedContext
      ? `${systemPrompt}\n\nUse the following supplied context when it is relevant. Do not claim you searched beyond these materials. If the context is insufficient, say so.\n\n${suppliedContext}`
      : systemPrompt;

    const chatMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: groundedPrompt },
      ...history.slice(-20).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // SSE headers are withheld until the provider produces its first content
    // chunk (BUG-002): a provider failure before any content becomes a clean
    // HTTP 502 the client can retry, while failures after streaming began can
    // only travel as an in-band SSE error frame.
    let sseStarted = false;
    const startSse = () => {
      if (sseStarted) return;
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();
      sseStarted = true;
    };

    let fullResponse = "";

    try {
      const stream = await openai.chat.completions.create({
        model: "openai/gpt-oss-120b",
        max_tokens: 4096,
        messages: chatMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          startSse();
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : "The AI provider is temporarily unavailable.";
      if (res.headersSent) {
        // Mid-stream failure: headers are already out, only an SSE frame can carry the error.
        res.write(`data: ${JSON.stringify({ error: detail })}\n\n`);
        res.end();
      } else {
        // Provider failed before any content: clean HTTP error the client can retry on.
        res.status(502).json({ error: detail });
      }
      return;
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

    // An empty but successful completion still needs valid SSE framing.
    startSse();
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
  const { prompt, size: requestedSize, conversationId, replaceMessageId } = body.data;
  const sizeMap: Record<string, "1024x1024" | "1536x1024" | "1024x1536"> = {
    "1024x1024": "1024x1024",
    "1536x1024": "1536x1024",
    "1024x1536": "1024x1536",
  };
  const size = sizeMap[requestedSize ?? "1024x1024"] ?? "1024x1024";

  if (replaceMessageId !== undefined && conversationId === undefined) {
    res.status(400).json({ error: "replaceMessageId requires conversationId." });
    return;
  }

  // Supplying a conversationId persists the exchange so the image survives a
  // reload. Ownership is verified before we spend a provider call.
  let conv: { id: number; title: string } | null = null;
  if (conversationId !== undefined) {
    const found = await findOwnedConversation(req.userId, conversationId);
    if (!found) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    conv = found;
  }

  // Regenerating replaces an existing image message. Verify the target belongs
  // to the conversation up front so a bad id never costs a provider call.
  if (conv && replaceMessageId !== undefined) {
    const [target] = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.id, replaceMessageId), eq(messages.conversationId, conv.id)),
      );
    if (!target) {
      res.status(404).json({ error: "Message not found" });
      return;
    }
  }

  let buffer: Buffer;
  try {
    buffer = await generateImageBuffer(prompt, size);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "The image provider is temporarily unavailable.";
    res.status(502).json({ error: detail });
    return;
  }
  const b64 = buffer.toString("base64");

  const imageMarkdown = `![Generated image](data:image/png;base64,${b64})`;

  if (conv && replaceMessageId !== undefined) {
    // Regenerate in place: overwrite the existing image message, no new rows.
    await db
      .update(messages)
      .set({ content: imageMarkdown })
      .where(eq(messages.id, replaceMessageId));
  } else if (conv) {
    // Persist user prompt + assistant image together, only after generation
    // succeeds, so a failed generation never leaves an orphaned prompt.
    await db.insert(messages).values({ conversationId: conv.id, role: "user", content: prompt });
    await db.insert(messages).values({
      conversationId: conv.id,
      role: "assistant",
      content: imageMarkdown,
    });

    // Auto-title from the prompt if the conversation still has its default name.
    if (conv.title === "New Chat" || conv.title === "New conversation") {
      const shortTitle = prompt.slice(0, 60).trim();
      if (shortTitle) {
        await db
          .update(conversations)
          .set({ title: shortTitle })
          .where(eq(conversations.id, conv.id));
      }
    }
  }

  res.json({ b64_json: b64 });
});

// GET /openai/stats — per-user usage summary.
router.get("/openai/stats", async (req, res): Promise<void> => {
  const [convCount] = await db
    .select({ value: count() })
    .from(conversations)
    .where(eq(conversations.userId, req.userId));
  const [msgCount] = await db
    .select({ value: count() })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(eq(conversations.userId, req.userId));
  const recent = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, req.userId))
    .orderBy(desc(conversations.createdAt))
    .limit(5);
  res.json({
    totalConversations: convCount?.value ?? 0,
    totalMessages: msgCount?.value ?? 0,
    recentConversations: recent,
  });
});

export default router;
