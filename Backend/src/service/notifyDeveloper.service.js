import TelegramBot from "node-telegram-bot-api";
import {
  defaultSummary,
  formatDateTime,
  formatDuration,
  oneLine,
  trimBlock,
} from "../helpers/notifyLogs.helpers.js";

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

const bot = telegramToken
  ? new TelegramBot(telegramToken, { polling: false })
  : null;

// ---------------------------------------------------------------------------
// notifyDeveloper — sends a compact deployment summary via Telegram.
//
// @param {object} notificationPayload
//   {
//     status:        "success" | "failed",
//     repo:          string,
//     branch:        string,
//     commitMessage: string,
//     pusher:        string,
//     runId:         string,   // delivery/run id for cross-referencing logs
//     shouldInstall: boolean,
//     startedAt:     Date,
//     finishedAt:    Date,
//     durationMs:    number,
//     exitCode:      number,
//     signal:        string | null,
//     summary:       string,          // optional override for the headline
//     logExcerpt:    string,          // short tail of the log (not the full log)
//   }
// @returns {Promise<void>}
// ---------------------------------------------------------------------------

export async function notifyDeveloper(notificationPayload) {
  if (!bot || !telegramChatId) {
    console.warn(
      "[notifyDeveloper] Skipped — TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set.",
    );
    return;
  }

  const {
    status,
    repo,
    branch,
    commitMessage,
    pusher,
    runId,
    shouldInstall,
    startedAt,
    finishedAt,
    durationMs,
    exitCode,
    signal,
    summary,
    logExcerpt,
  } = notificationPayload;

  const statusIcon =
    status === "success" ? "✅" :
    status === "failed"  ? "❌" :
    "🚀";

  const lines = [
    `${statusIcon} ${summary || defaultSummary(notificationPayload)}`,
    `Repo:    ${repo      ?? "-"}`,
    `Branch:  ${branch    ?? "-"}`,
    `Commit:  ${commitMessage ? oneLine(commitMessage) : "-"}`,
    `By:      ${pusher    ?? "-"}`,
    `Install: ${shouldInstall ? "yes" : "no"}`,
  ];

  if (startedAt)                   lines.push(`Started:  ${formatDateTime(startedAt)}`);
  if (finishedAt)                  lines.push(`Finished: ${formatDateTime(finishedAt)}`);
  if (typeof durationMs === "number") lines.push(`Duration: ${formatDuration(durationMs)}`);
  if (status === "failed")         lines.push(`Exit: code=${exitCode ?? "null"} signal=${signal ?? "null"}`);
  if (runId)                       lines.push(`Run ID: ${runId}`);

  if (logExcerpt) {
    lines.push("", "Last logs:", trimBlock(logExcerpt, 30, 2_500));
  }

  const messageText = lines.join("\n").slice(0, 4_000);

  try {
    await bot.sendMessage(telegramChatId, messageText);
  } catch (error) {
    console.error("[notifyDeveloper] Failed to send Telegram message:", error.message);
  }
}