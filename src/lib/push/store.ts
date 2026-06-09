import type { PushSubscription as WebPushSubscription } from "web-push";

/* Server-side subscription store.
   In-memory by default (good for local/demo). When Supabase is configured,
   persist to the `push_subscriptions` table (see supabase/migrations/0003_push.sql).
   Kept on globalThis so it survives Next.js dev hot-reloads. */

export interface StoredSubscription {
  endpoint: string;
  subscription: WebPushSubscription;
  userId: string | null;
  createdAt: number;
}

const g = globalThis as unknown as { __treelogyPush?: Map<string, StoredSubscription> };
const store: Map<string, StoredSubscription> = (g.__treelogyPush ??= new Map());

export function saveSubscription(subscription: WebPushSubscription, userId: string | null) {
  store.set(subscription.endpoint, {
    endpoint: subscription.endpoint,
    subscription,
    userId,
    createdAt: Date.now(),
  });
}

export function removeSubscription(endpoint: string) {
  store.delete(endpoint);
}

export function listSubscriptions(userId?: string | null): StoredSubscription[] {
  const all = Array.from(store.values());
  if (userId) return all.filter((s) => s.userId === userId);
  return all;
}

export function countSubscriptions(): number {
  return store.size;
}
