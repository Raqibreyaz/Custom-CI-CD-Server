export const startDeploymentStatus = async () => {
  await fetch(
    `https://api.github.com/repos/${deployConfig.trigger.repo}/deployments`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer $Token`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: headCommit.id,
        environment: "",
        description: "",
      }),
    },
  );
};

export const updateDeploymentStatus = async (repo, state, deploymentId) => {
  await fetch(
    `https://api.github.com/repos/${repo}/deployments/${deploymentId}/statuses`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer $TOKEN",
      },
      body: JSON.stringify({
        state,
        description: "Rolling out to production",
        log_url: "https://deploy.example.com/runs/123",
        environment_url: "https://app.example.com",
      }),
    },
  );
};
