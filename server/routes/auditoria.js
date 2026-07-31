const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /api/auditoria?limite=100 — histórico de acesso/alteração para rastreabilidade (LGPD).
router.get("/", (req, res) => {
  const limite = Math.min(Number(req.query.limite) || 100, 500);
  const rows = db
    .prepare("SELECT * FROM auditoria ORDER BY criado_em DESC, id DESC LIMIT ?")
    .all(limite);
  res.json(rows);
});

module.exports = router;
