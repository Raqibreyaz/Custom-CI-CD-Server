import { subscriber } from "../config/redis.config.js";

export const streamLogs = async (req, res) => {
  const deliveryId = req.params.deliveryId;
  const channel = deliveryId ? `logs:${deliveryId}` : "logs";

  res.header("Content-Type", "text/event-stream");
  res.header("Cache-Control", "no-cache");
  res.header("Connection", "keep-alive");
  res.flushHeaders();

  let seq = 1;
  const listener = (msg) => {
    res.write(`id: ${seq++}\n`);
    res.write(`event:log\n`);
    res.write(`data:${msg}\n\n`);
  };

  await subscriber.subscribe(channel, listener);

  req.on("close", async () => {
    await subscriber.unsubscribe(channel, listener).catch(console.log);
    res.end();
  });
};
