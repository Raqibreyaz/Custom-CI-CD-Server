import path from "node:path";
import { NodeSSH } from "node-ssh";

// ---------------------------------------------------------------------------
// Log collector
// ---------------------------------------------------------------------------

function createLogCollector(limit = 12_000) {
  let stdout = "";
  let stderr = "";

  const append = (current, chunk) => {
    const next = current + chunk;
    return next.length <= limit ? next : next.slice(next.length - limit);
  };

  return {
    onStdout(chunk) {
      const text = chunk.toString("utf8");
      process.stdout.write(text);
      stdout = append(stdout, text);
    },
    onStderr(chunk) {
      const text = chunk.toString("utf8");
      process.stderr.write(text);
      stderr = append(stderr, text);
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

// ---------------------------------------------------------------------------
// SSH helper
// ---------------------------------------------------------------------------

async function runRemoteCommand(
  sshClient,
  command,
  options,
  logCollector,
  ignoreError = false,
) {
  const result = await sshClient.execCommand(command, {
    ...options,
    onStdout: logCollector.onStdout,
    onStderr: logCollector.onStderr,
  });

  const exitCode = typeof result.code === "number" ? result.code : 0;
  if (exitCode !== 0 && !ignoreError) {
    const err = new Error(
      `Remote command failed (exit ${exitCode}): ${command}`,
    );
    err.exitCode = exitCode;
    err.stdout = result.stdout;
    err.stderr = result.stderr;
    throw err;
  }

  return result;
}

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

export async function runDeployment(deployConfig) {
  const sshClient = new NodeSSH();
  const logCollector = createLogCollector();
  const startedAt = new Date();

  const branch = deployConfig.trigger?.branch ?? "main";
  const projectRoot = deployConfig.target.projectPath;
  const projectName = path.posix.basename(projectRoot);
  const workDirFullPath = path.posix.join(
    projectRoot,
    deployConfig.workflow.workDir ?? "",
  );

  const sshPrivateKey = process.env[deployConfig.target.auth.sshKey];
  if (!sshPrivateKey) {
    throw new Error(
      "SSH private key env var is missing — cannot connect to remote host.",
    );
  }

  try {
    await sshClient.connect({
      host: deployConfig.target.host,
      username: deployConfig.target.username,
      privateKey: sshPrivateKey,
    });

    // maintain a backup version of old code to add roll-back mechanism
    await runRemoteCommand(
      sshClient,
      `mkdir -p "$HOME/code-backup/" && rm -rf "$HOME/code-backup/${projectName}"`,
      {},
      logCollector,
    );
    await runRemoteCommand(
      sshClient,
      `rsync -a "${projectRoot}" "$HOME/code-backup/"`, //ensure 'projectRoot' doesnt have trailing /
      {},
      logCollector,
    );

    await runRemoteCommand(
      sshClient,
      `git fetch origin ${branch}`,
      { cwd: projectRoot },
      logCollector,
    );

    await runRemoteCommand(
      sshClient,
      `git reset --hard origin/${branch}`,
      { cwd: projectRoot },
      logCollector,
    );

    if (deployConfig.shouldInstall && deployConfig.workflow.install) {
      await runRemoteCommand(
        sshClient,
        deployConfig.workflow.install,
        { cwd: workDirFullPath },
        logCollector,
      );
    }

    await runRemoteCommand(
      sshClient,
      deployConfig.workflow.start,
      { cwd: workDirFullPath },
      logCollector,
    );

    // do a health-check to confirm it is up and running
    const healthUrl = deployConfig.target.healthUrl || "http://127.0.0.1:3000/health";
    const healthResult = await runRemoteCommand(
      sshClient,
      `curl -fsS -o /dev/null ${healthUrl}`,
      {},
      logCollector,
      true, //ignore error
    );

    if (healthResult.code !== 0) {
      logCollector.onStdout("Health check failed. Starting rollback...");

      // roll back to previous code
      await runRemoteCommand(
        sshClient,
        `rsync -a --delete "$HOME/code-backup/${projectName}/" "${projectRoot}/"`,
        {},
        logCollector,
      );

      await runRemoteCommand(
        sshClient,
        deployConfig.workflow.start,
        { cwd: workDirFullPath },
        logCollector,
      );

      throw new Error("Health check failed. Rolled back to previous version.");
    }

    logCollector.onStdout("Server Health Check Passed Successfully.");

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
    return {
      status: "failed",
      startedAt,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt.getTime(),
      exitCode: error?.exitCode ?? 1,
      signal: null,
      fullLog:
        logCollector.getCombined() || error?.stderr || error?.message || "",
    };
  } finally {
    sshClient.dispose();
  }
}
