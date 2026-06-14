import redisClient from "../config/redis.config.js";
import { notifyDeveloper } from "../service/notifyDeveloper.service.js";
import runBackendDeployment from "../service/backendDeploy.service.js";
import runFrontendDeployment from "../service/frontendDeploy.service.js";
import verifyGithubWebhookSignature from "../helpers/verifyGithubWebhookSignature.helpers.js";
import checkChangesAndInstallationRequirement from "../helpers/checkChangesAndInstallationRequirement.helpers.js";
import settings from "../config/settings.json" with { type: "json" };
import Deployment from "../models/deployment.models.js";

export const githubWebhook = async (req, res) => {
  const webhookSignature = req.headers["x-hub-signature-256"];
  const githubEvent = req.headers["x-github-event"];
  const deliveryId = req.headers["x-github-delivery"];

  // 1. Verify the HMAC signature sent by GitHub.
  console.log("[webhook] Verifying signature…");
  if (!verifyGithubWebhookSignature(webhookSignature, req.body)) {
    console.warn("[webhook] Invalid signature — rejecting.");
    return res.sendStatus(400);
  }
  console.log("[webhook] Signature verified.");

  // 2. Reject events without a delivery id.
  if (!deliveryId) return res.sendStatus(400);

  // 3. Deduplicate: skip if we have already processed this delivery.
  const inserted = await redisClient.set(`github:webhook:${deliveryId}`, "1", {
    expiration: { type: "EX", value: 60 * 15 },
    condition: "NX",
  });
  if (inserted === null) {
    console.log("[webhook] Duplicate delivery — skipping.");
    return res.sendStatus(200);
  }

  // 4. Parse payload.
  const githubPayload = JSON.parse(req.body.toString("utf-8"));
  const repoFullName = githubPayload.repository.full_name;
  const headCommit =
    githubPayload.head_commit ??
    githubPayload.commits?.[githubPayload.commits.length - 1];
  const commitMessage = headCommit?.message ?? "";
  const commitSha = headCommit?.id ?? "";
  const pusher =
    githubPayload.pusher?.name ?? githubPayload.sender?.login ?? "";
  const branch =
    githubPayload.ref?.replace("refs/heads/", "") ??
    githubPayload.pull_request?.base?.ref;

  const repoConfigs = settings.filter(
    (cfg) => cfg.trigger.repo === repoFullName,
  );
  if (repoConfigs.length === 0) {
    console.log("[webhook] Repo not registered — ignoring.");
    return res.sendStatus(403);
  }

  const eventConfigs = repoConfigs.filter((cfg) =>
    cfg.trigger.events.includes(githubEvent),
  );
  if (eventConfigs.length === 0) {
    console.log("[webhook] Event type not registered — ignoring.");
    return res.sendStatus(200);
  }

  const matchingConfigs = eventConfigs.filter(
    (cfg) => cfg.trigger.branch === branch,
  );
  if (matchingConfigs.length === 0) {
    console.log("[webhook] Branch not registered - ignoring.");
    return res.sendStatus(403);
  }

  // 7. ACK GitHub immediately so it doesn't time out waiting for us.
  res.sendStatus(200);

  // 8. Determine which directories actually changed and need a deploy.
  const deployableConfigs = matchingConfigs
    .map((cfg) => {
      const changeStatus = checkChangesAndInstallationRequirement(
        githubPayload.commits,
        cfg.workflow.workDir,
        cfg.workflow.packageManifest,
      );
      if (!changeStatus.hasChanges) return null;
      return { ...cfg, shouldInstall: changeStatus.shouldInstall };
    })
    .filter(Boolean);

  // 9. Run deployments sequentially.
  for (const deployConfig of deployableConfigs) {
    let deployResult = null;
    let isFrontend = false;

    // Step 1 - execute deployment steps and take the result
    if (deployConfig.target.type === "s3") {
      isFrontend = true;
      deployResult = await runFrontendDeployment(
        deployConfig,
        deliveryId,
        commitSha,
      );
    } else {
      deployResult = await runBackendDeployment(
        deployConfig,
        deliveryId,
        commitSha,
      );
    }
    const runId = `${deliveryId}:${isFrontend ? "frontend" : "backend"}`;

    // Step 2 - store the logs at a persistance storage
    await Deployment.create({
      runId: runId,
      repoFullName: repoFullName,
      branch: branch,
      commitSha: commitSha,
      commitMessage: commitMessage,
      targetType: deployConfig.target.type,
      targetDir: deployConfig.workflow.workDir,
      status: deployResult.status,
      logs: deployResult.fullLog,
      exitCode: deployResult.exitCode,
      trigger: "webhook",
      startedAt: deployResult.startedAt,
      finishedAt: deployResult.finishedAt,
    });

    // Step 3 — send a compact summary to the developer.
    await notifyDeveloper({
      status: deployResult.status,
      repo: deployConfig.trigger.repo,
      branch: deployConfig.trigger.branch,
      commitMessage,
      pusher,
      runId,
      shouldInstall: deployConfig.shouldInstall,
      startedAt: deployResult.startedAt,
      finishedAt: deployResult.finishedAt,
      durationMs: deployResult.durationMs,
      exitCode: deployResult.exitCode,
      signal: deployResult.signal,
      logExcerpt: deployResult.fullLog,
      summary:
        deployResult.status === "success"
          ? "Deployment succeeded"
          : "Deployment failed",
    });
  }
};

export const getDeployments = async (req, res) => {
  const deployments = await Deployment.find().sort({ startedAt: -1 }).lean();

  res.json({ message: "deployments fetched successfully!", deployments });
};

export const getDeployment = async (req, res) => {
  const runId = req.params.runId;
  const deployment = await Deployment.findOne({ runId }).lean();
  res.json({ message: "deployment fetched successfully!", deployment });
};
