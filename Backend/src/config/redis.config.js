import { createClient } from "redis";

const redisUrl = process.env.REDIS_URI;

export const publisher = createClient({ url: redisUrl });
export const subscriber = publisher.duplicate();

publisher.on("error", (error) => {
  console.error("Redis client error:", error.message);
});

publisher.on("reconnecting", () => {
  console.warn("Redis: attempting to reconnect...");
});

publisher.on("ready", () => {
  console.log("Redis: connection ready.");
});

await publisher.connect();
await subscriber.connect();
console.log("Memory Store Connected!");

process.on("SIGINT", async () => {
  await publisher.quit();
  await subscriber.quit();
  process.exit(0);
});

export default publisher;
