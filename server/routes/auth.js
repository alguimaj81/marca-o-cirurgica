const express = require("express");
const db = require("../db");
const { conferirSenha, emitirToken, definirCookie, limparCookie, requireAuth } = require("../auth");
const { registrarAuditoria } = require("../auditoria");

const router = express.Router();

// Freio simples contra tentativas repetidas de senha (por processo, não distribuído —
// suficiente para um posto único; numa instalação com vários servidores, mover para o banco).
const tentativas = new Map();
const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 15 * 60 * 1000;

function bloqueado(usuario) {
  const registro = tentativas.get(usuario);
  if (!registro) return false;
  if (Date.now() - registro.desde > JANELA_MS) {
    tentativas.delete(usuario);
    return false;
  }
  return registro.contagem >= LIMITE_TENTATIVAS;
}

function registrarFalha(usuario) {
  const registro = tentativas.get(usuario) || { contagem: 0, desde: Date.now() };
  registro.contagem++;
  tentativas.set(usuario, registro);
}

function limparFalhas(usuario) {
  tentativas.delete(usuario);
}

router.post("/login", (req, res) => {
  const { usuario, senha } = req.body || {};
  if (!usuario || !senha) return res.status(400).json({ erro: "Informe usuário e senha." });

  if (bloqueado(usuario)) {
    return res.status(429).json({ erro: "Muitas tentativas. Aguarde alguns minutos e tente novamente." });
  }

  const row = db.prepare("SELECT * FROM usuarios WHERE usuario = ?").get(usuario);
  if (!row || !conferirSenha(senha, row.senha_hash)) {
    registrarFalha(usuario);
    registrarAuditoria(usuario, "login_falhou", null, "Usuário ou senha incorretos");
    return res.status(401).json({ erro: "Usuário ou senha incorretos." });
  }

  limparFalhas(usuario);
  const token = emitirToken(row);
  definirCookie(res, token);
  registrarAuditoria(row.nome, "login", null, null);
  res.json({ nome: row.nome, usuario: row.usuario, setor: row.setor });
});

router.post("/logout", requireAuth, (req, res) => {
  registrarAuditoria(req.usuario.nome, "logout", null, null);
  limparCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.usuario);
});

module.exports = router;
