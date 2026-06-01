import path from "node:path";
import { NodeSSH } from "node-ssh";
import createLogCollector from "../helpers/createLogCollector.js";
import runRemoteCommand from "../helpers/runRemoteCommand.js";
import setDeployStatus from "./deployStatus.service.js";

// ---------------------------------------------------------------------------
// runDeployment — executes all SSH steps, returns a structured DeploymentResult
//
// @param {object} deployConfig  — one entry from settings.json, enriched with
//                                 `shouldInstall` by the controller.
// @returns {DeploymentResult}
//   {
//     status:     "success" | "failed",
//     startedAt:  Date,
//     finishedAt: Date,
//     durationMs: number,
//     exitCode:   number,
//     signal:     string | null,
//     fullLog:    string,   // combined stdout+stderr (up to collector limit)
//   }
// ---------------------------------------------------------------------------
export default async function runBackendDeployment(deployConfig, deliveryId, commitSha) {
  const sshClient = new NodeSSH();
  const logCollector = createLogCollector();
  const startedAt = new Date();

  const deployContext = deployConfig.trigger.context;
  const repoFullName = deployConfig.trigger.repo;
  const [repoOwner, repoName] = deployConfig.trigger.repo.split("/");
  const branch = deployConfig.trigger?.branch ?? "main";
  const projectRoot = deployConfig.target.projectPath;
  const workingDirName = deployConfig.workflow.workDir ?? "";

  let logsTargetUrl;

  const updateStatus = async (state, description) => {
    try {
      await setDeployStatus({
        owner: repoOwner,
        context: deployContext,
        description,
        repo: repoName,
        sha: commitSha,
        state,
        targetUrl: logsTargetUrl,
      });
    } catch (err) {
      console.error(`[deployStatus] Failed to update status to ${state}:`, err);
    }
  };

  try {
    const releaseDirName = new Date().toISOString().replace(/[:.]/g, "-");
    const releaseRoot = `${projectRoot}/releases/${releaseDirName}`;
    const workingDirFullPath = path.posix.join(releaseRoot, workingDirName);

    const sshPrivateKey = process.env[deployConfig.target.auth.sshKey];
    if (!sshPrivateKey) {
      throw new Error("SSH private key env var is missing — cannot connect to remote host.");
    }

    const logServerUrl = process.env.LOG_SERVER_URL;
    if (!logServerUrl) {
      throw new Error("Log server URL env var is missing.");
    }
    const runId = `${deliveryId}:backend`;
    logsTargetUrl = `${logServerUrl}/logs/${runId}`;

    await updateStatus("pending", "Backend Deployment in Progress...");

    await sshClient.connect({
      host: deployConfig.target.host,
      username: deployConfig.target.username,
      privateKey: sshPrivateKey,
    });

    // create a release directory into the releases dir
    await runRemoteCommand(
      sshClient,
      `mkdir -p "${projectRoot}/releases"`,
      {},
      logCollector,
    );

    // clone the repo as the new release directory(only required branch)
    await runRemoteCommand(
      sshClient,
      `git clone -b "${branch}" --single-branch "https://github.com/${repoFullName}" "${releaseRoot}"`,
      {},
      logCollector,
    );

    // install dependencies into the new release directory
    await runRemoteCommand(
      sshClient,
      deployConfig.workflow.install,
      { cwd: workingDirFullPath },
      logCollector,
    );

    // build the project(if needed)
    if (deployConfig.workflow.build) {
      await runRemoteCommand(
        sshClient,
        deployConfig.workflow.build,
        { cwd: workingDirFullPath },
        logCollector,
      );
    }

    // symlink the shared .env file
    await runRemoteCommand(
      sshClient,
      `ln -sfn "${projectRoot}/shared/.env" "${workingDirFullPath}/.env"`,
      {},
      logCollector,
    );

    // store the previous release dir for rollback case
    const previousReleaseResult = await runRemoteCommand(
      sshClient,
      `readlink ./current`,
      { cwd: projectRoot },
      logCollector,
      true,
    );
    const previousReleaseDir = previousReleaseResult.stdout?.trim() || null;

    // update the 'current' symlink to point on the new working dir release
    await runRemoteCommand(
      sshClient,
      `ln -sfn "${releaseRoot}" ./current`,
      { cwd: projectRoot },
      logCollector,
    );

    // reload the server
    await runRemoteCommand(
      sshClient,
      deployConfig.workflow.reload,
      { cwd: projectRoot },
      logCollector,
    );

    // do a health-check to confirm it is up and running
    const healthUrl =
      deployConfig.target.healthUrl || "http://127.0.0.1:3000/health";
    const healthResult = await runRemoteCommand(
      sshClient,
      `curl -fsS -o /dev/null "${healthUrl}"`,
      {},
      logCollector,
      true, //ignore error
    );

    if (healthResult.code !== 0) {
      logCollector.onStdout("Health check failed. Starting rollback...");

      /* roll back to previous code */
      if (previousReleaseDir) {
        // update the 'current' symlink to point on the previous release
        await runRemoteCommand(
          sshClient,
          `ln -sfn "${previousReleaseDir}" ./current`,
          { cwd: projectRoot },
          logCollector,
        );
        // reload the server
        await runRemoteCommand(
          sshClient,
          deployConfig.workflow.reload,
          { cwd: projectRoot },
          logCollector,
        );

        // remove the current release directory
        await runRemoteCommand(
          sshClient,
          `rm -rf "${releaseRoot}"`,
          {},
          logCollector,
        );
      }

      throw new Error("Health check failed. Rolled back to previous version.");
    }

    logCollector.onStdout("Server Health Check Passed Successfully.");

    await updateStatus("success", "Backend Deployment successfully Completed.");

    return {
      status: "success",
      startedAt,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      exitCode: 0,
      signal: null,
      fullLog: logCollector.getCombined(),
    };
  } catch (error) {
    logCollector.onStderr(`Deployment execution error: ${error.message}`);
    await updateStatus("failure", "Backend Deployment failed.");

    return {
      status: "failed",
      startedAt,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      exitCode: 1,
      signal: null,
      fullLog: logCollector.getCombined(),
    };
  } finally {
    sshClient.dispose();
  }
}
