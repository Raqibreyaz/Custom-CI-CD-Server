import { publisher } from "../config/redis.config.js";

export default function createLogCollector(runId) {
  let stdout = "";
  let stderr = "";
  const channel = runId ? `logs:${runId}` : "logs";

  return {
    async onStdout(chunk) {
      const text = chunk.toString("utf8");

      // write to terminal and stream channel
      process.stdout.write(text);
      await publisher.publish(channel, text);

      stdout = stdout + text;
    },
    async onStderr(chunk) {
      const text = chunk.toString("utf8");

      process.stderr.write(text);
      await publisher.publish(channel, text);

      stderr = stderr + text;
    },
    getStdout() {
      return stdout;
    },
    getStderr() {
      return stderr;
    },
    getCombined() {
      return [stdout, stderr].filter(Boolean).join("\n");
    },
  };
}
