export default async function runRemoteCommand(
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
