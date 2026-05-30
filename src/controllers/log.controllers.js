import { getDeploymentLogs } from "../service/persistDeploymentLogs.service.js";

export const getLogs = async (req, res) => {
  const deliveryId = req.params.deliveryId;

  const logs = await getDeploymentLogs(deliveryId);

  res.json({ message: "Logs fetched successfully!", logs });
};
