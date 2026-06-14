import "dotenv/config";
import "./src/config/db.config.js";
import express from "express";
import deployRoutes from "./src/routes/deploy.routes.js";
import logRoutes from "./src/routes/log.routes.js";

const app = express();

app.use("/deploy", deployRoutes);

app.use("/logs", logRoutes);

// Centralized error handler
app.use((err, req, res, next) => {
  console.error("[ServerError]", err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || "Internal Server Error",
    },
  });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`server is running at port ${port}`));
