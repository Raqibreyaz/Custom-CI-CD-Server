import redisClient from "../config/redis.config.js";

// How long to retain full deployment logs in Redis (7 days).
const LOG_TTL_SECONDS = 60 * 60 * 24 * 7;

// Maximum bytes we'll store per run (prevent runaway log bloat).
const MAX_LOG_BYTES = 200_000;

// ---------------------------------------------------------------------------
// persistDeploymentLogs — stores the full log output for a deployment run.
//
// @param {string} runId   — unique identifier for this run (e.g. GitHub
//                           delivery-id or a uuid generated at dispatch time)
// @param {string} logChunk — the combined stdout+stderr text from the runner
// @returns {Promise<void>}
// ---------------------------------------------------------------------------

export async function persistDeploymentLogs(runId, logChunk) {
  if (!runId || !logChunk) return;

  const key = `cicd:logs:${runId}`;
  const payload = String(logChunk).slice(-MAX_LOG_BYTES);

  try {
    await redisClient.set(key, payload, {
      expiration: { type: "EX", value: LOG_TTL_SECONDS },
    });
    console.log(`[persistDeploymentLogs] Stored ${payload.length} bytes → ${key}`);
  } catch (error) {
    // Non-fatal: log persistence failure must never interrupt the notify step.
    console.error("[persistDeploymentLogs] Failed to store logs:", error.message);
  }
}
