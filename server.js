import express from "express";
import cors from "cors";
import sessionsRouter from "./routes/sessions.js";
import authRouter from "./routes/auth.js";
import templatesRouter from "./routes/templates.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "2mb" })); // higher limit to allow pasted .ics files

app.use("/sessions", sessionsRouter);
app.use("/auth", authRouter);
app.use("/templates", templatesRouter);

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "whenworks-backend" });
});

app.listen(PORT, () => {
  console.log(`WhenWorks API running at http://localhost:${PORT}`);
});
