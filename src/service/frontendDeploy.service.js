import { spawn } from "node:child_process";

/*
TODO:
1. install pnpm conditionally
2. install aws cli conditionally
3. configure aws credentials conditionally
*/
export async function runFrontendDeployment(directory) {
  const repoOnlyName = directory.trigger.repo.split("/").slice(-1);
  const script = `
        mkdir -p /var/s3
        cd /var/s3
        git clone ${directory.trigger.repo}
        cd ${repoOnlyName}
        ${directory.workflow.workDir !== "/" ? `cd ${directory.workDir.workDir}` : ""}
        ${directory.workflow.install}
        ${directory.workflow.build}
        aws s3 sync ${directory.target.buildDir} s3://${directory.target.bucket}
        aws cloudfront create-invalidation \
        --distribution-id ${directory.target.cloudfrontId} \
        --paths "/*"
    `;

  const childProcess = spawn("bash", [script]);
}
