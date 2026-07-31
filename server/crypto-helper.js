const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEY_PATH = path.join(__dirname, ".encryption-key");

// Chave de 32 bytes (AES-256) gerada uma única vez e persistida localmente.
// Perder este arquivo torna os dados criptografados já salvos irrecuperáveis.
function carregarOuCriarChave() {
  if (fs.existsSync(KEY_PATH)) {
    return Buffer.from(fs.readFileSync(KEY_PATH, "utf8").trim(), "hex");
  }
  const chave = crypto.randomBytes(32);
  fs.writeFileSync(KEY_PATH, chave.toString("hex"), { mode: 0o600 });
  return chave;
}

const CHAVE = carregarOuCriarChave();
const ALGORITMO = "aes-256-gcm";

// Retorna null quando a entrada é null/undefined, para não obrigar todo
// campo opcional (ex: telefone) a existir.
function encrypt(texto) {
  if (texto === null || texto === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITMO, CHAVE, iv);
  const encriptado = Buffer.concat([cipher.update(String(texto), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encriptado]).toString("base64");
}

function decrypt(payload) {
  if (payload === null || payload === undefined) return null;
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const encriptado = buffer.subarray(28);
  const decipher = crypto.createDecipheriv(ALGORITMO, CHAVE, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encriptado), decipher.final()]).toString("utf8");
}

// Hash determinístico (HMAC) do CNS, usado só para permitir checar duplicidade
// sem descriptografar toda a tabela — o valor em si continua irreversível.
function hashBusca(texto) {
  return crypto.createHmac("sha256", CHAVE).update(String(texto)).digest("hex");
}

module.exports = { encrypt, decrypt, hashBusca };
