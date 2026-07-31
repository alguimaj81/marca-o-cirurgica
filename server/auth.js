const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SECRET_PATH = path.join(__dirname, ".jwt-secret");

function carregarOuCriarSegredo() {
  if (fs.existsSync(SECRET_PATH)) {
    return fs.readFileSync(SECRET_PATH, "utf8").trim();
  }
  const segredo = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_PATH, segredo, { mode: 0o600 });
  return segredo;
}

const JWT_SECRET = carregarOuCriarSegredo();
const COOKIE_NOME = "token";
const EXPIRA_EM = "8h"; // duração de um plantão/turno típico

function hashSenha(senha) {
  return bcrypt.hashSync(senha, 10);
}

function conferirSenha(senha, hash) {
  return bcrypt.compareSync(senha, hash);
}

function emitirToken(usuario) {
  return jwt.sign(
    { sub: usuario.id, usuario: usuario.usuario, nome: usuario.nome, setor: usuario.setor },
    JWT_SECRET,
    { expiresIn: EXPIRA_EM }
  );
}

function definirCookie(res, token) {
  res.cookie(COOKIE_NOME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // ligar quando o app rodar atrás de HTTPS
    maxAge: 8 * 60 * 60 * 1000
  });
}

function limparCookie(res) {
  res.clearCookie(COOKIE_NOME);
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NOME];
  if (!token) return res.status(401).json({ erro: "Não autenticado" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.usuario = { id: payload.sub, usuario: payload.usuario, nome: payload.nome, setor: payload.setor };
    next();
  } catch (e) {
    return res.status(401).json({ erro: "Sessão inválida ou expirada" });
  }
}

module.exports = { hashSenha, conferirSenha, emitirToken, definirCookie, limparCookie, requireAuth };
