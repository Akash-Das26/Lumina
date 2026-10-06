import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import { messages } from "./messages";

/**
 * Generated-image bytes live here instead of inside messages.content (Audit 3
 * F-03 / BUG-008). A 1024x1024 PNG is ~1.5 MB of base64; keeping it in the
 * message text meant every conversation load shipped it, every refetch
 * re-rendered it, and the raw data URI was replayed into the provider context
 * on later turns. The message row now stores only a short reference
 * (`![Generated image](/api/openai/images/<id>.<ext>)`) and the bytes are
 * fetched on demand from `GET /api/openai/images/:id`.
 *
 * `data` is the base64 payload without the `data:` prefix; `mediaType` is the
 * format sniffed from the bytes (see lib/image-media.ts) so the endpoint can
 * answer with the correct Content-Type.
 */
export const messageImages = pgTable(
  "message_images",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull(),
    data: text("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("message_images_message_idx").on(table.messageId)],
);

export type MessageImage = typeof messageImages.$inferSelect;
export type InsertMessageImage = typeof messageImages.$inferInsert;
