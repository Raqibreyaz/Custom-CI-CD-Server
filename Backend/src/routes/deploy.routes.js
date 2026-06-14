import express from "express";
import {
  getDeployment,
  getDeployments,
  githubWebhook,
} from "../controllers/deploy.controllers.js";

const router = express.Router();

router.post(
  "/events",
  express.raw({ type: "application/json" }),
  githubWebhook,
);

router.use(express.json());

router.get("/", getDeployments);
router.get("/:runId", getDeployment);

export default router;
