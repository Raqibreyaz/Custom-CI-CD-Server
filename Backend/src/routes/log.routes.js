import express from "express";
import { streamLogs } from "../controllers/log.controllers.js";

const router = express.Router();

router.get("/:deliveryId", streamLogs);

export default router;
