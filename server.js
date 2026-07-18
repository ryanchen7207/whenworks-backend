import express from "express";
import cors from "cors";
import sessionsRouter from "./routes/sessions.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use("/sessions", sessionsRouter);

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "whenworks-backend" });
});

app.listen(PORT, () => {
  console.log(`WhenWorks API running at http://localhost:${PORT}`);
});
