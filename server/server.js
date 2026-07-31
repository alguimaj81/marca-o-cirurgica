const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const pacientesRouter = require("./routes/pacientes");
const authRouter = require("./routes/auth");
const auditoriaRouter = require("./routes/auditoria");
const { requireAuth } = require("./auth");
const { runTodasAutomacoes, iniciarAgendamentos } = require("./jobs/automations");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "..")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "jornada-cirurgica.html"));
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.use("/api", authRouter);

// A partir daqui, tudo exige sessão válida.
app.use("/api/pacientes", requireAuth, pacientesRouter);
app.use("/api/auditoria", requireAuth, auditoriaRouter);

app.post("/api/jobs/run", requireAuth, (req, res) => {
  const resultado = runTodasAutomacoes();
  res.json(resultado);
});

app.listen(PORT, () => {
  console.log(`Central Inteligente de Jornada Cirúrgica rodando em http://localhost:${PORT}`);
  iniciarAgendamentos();
});
