import express from "express";
import { getLogs } from "../controllers/log.controllers.js";

const router = express.Router();

router.post("/:deliveryId", getLogs);

export default router;
