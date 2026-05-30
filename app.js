import express from "express";
import deployRoutes from "./src/routes/deploy.routes.js";
import logRoutes from "./src/routes/log.routes.js";

const app = express();

const port = process.env.PORT || 8080;

app.use("/deploy", deployRoutes);

app.use('/logs',logRoutes)

app.listen(port, () => console.log(`server is running at port ${port}`));
