import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { users } from "./users";

export const conversations = pgTable(
  "conversations",
  {
    id: serial("id").primaryKey(),
    // Nullable for migration safety: rows created before auth landed have no
    // owner until AUTH_AUTO_PROVISION=1 assigns them to the first user.
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    mode: text("mode").notNull().default("chat"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("conversations_user_created_idx").on(table.userId, table.createdAt)],
);

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
