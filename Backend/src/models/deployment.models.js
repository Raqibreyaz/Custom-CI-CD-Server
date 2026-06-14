import mongoose from "mongoose";

const deploymentSchema = new mongoose.Schema({
  runId: {
    type: String,
    required: true,
    unique: true,
  },
  repoFullName: {
    type: String,
    required: true,
  },
  branch: {
    type: String,
    required: true,
  },
  commitSha: {
    type: String,
    required: true,
  },
  commitMessage: {
    type: String,
    default: "",
  },

  targetType: {
    type: String,
    enum: ["ssh", "s3", "local"],
  },

  targetDir: {
    type: String,
    default: "/",
  },
  status: {
    type: String,
    enum: [
      "queued",
      "running",
      "success",
      "failed",
      "rolled_back",
      "cancelled",
    ],
    required: true,
  },
  logs: {
    type: String,
    default: "",
  },
  exitCode: {
    type: Number,
    default: null,
  },
  trigger: {
    type: String,
    enum: ["webhook", "manual_retry"],
    required: true,
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  finishedAt: {
    type: Date,
  },
});

const Deployment = mongoose.model("Deployment", deploymentSchema);
export default Deployment;
