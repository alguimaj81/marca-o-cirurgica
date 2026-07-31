const path = require("path");
const Database = require("better-sqlite3");
const { encrypt, hashBusca } = require("./crypto-helper");
const { hashSenha } = require("./auth");

const DB_PATH = path.join(__dirname, "jornada.sqlite");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS pacientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cns TEXT NOT NULL,
  cns_hash TEXT NOT NULL UNIQUE,
  nascimento TEXT,
  telefone TEXT,
  procedimento TEXT NOT NULL,
  especialidade TEXT NOT NULL,
  lateralidade TEXT DEFAULT 'Não se aplica',
  cirurgiao TEXT NOT NULL,
  data TEXT NOT NULL,
  prioridade TEXT NOT NULL DEFAULT 'Eletiva',
  observacoes TEXT,
  confirmado INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pendencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  responsavel TEXT NOT NULL,
  prazo TEXT NOT NULL,
  resolvida_em TEXT
);

CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  usuario TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  setor TEXT NOT NULL DEFAULT 'Coordenação',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auditoria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_nome TEXT NOT NULL,
  acao TEXT NOT NULL,
  paciente_id INTEGER,
  detalhes TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pendencias_paciente ON pendencias(paciente_id);
CREATE INDEX IF NOT EXISTS idx_eventos_paciente ON eventos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_paciente ON auditoria(paciente_id);
`);

function seedUsuarioAdmin() {
  const { total } = db.prepare("SELECT COUNT(*) AS total FROM usuarios").get();
  if (total > 0) return;

  db.prepare(`
    INSERT INTO usuarios (nome, usuario, senha_hash, setor)
    VALUES (@nome, @usuario, @senha_hash, @setor)
  `).run({
    nome: "Administrador",
    usuario: "admin",
    senha_hash: hashSenha("trocar123"),
    setor: "Coordenação Cirúrgica"
  });

  console.log('[setup] Usuário padrão criado — login "admin", senha "trocar123". Troque assim que possível.');
}

function seedPacientesSeVazio() {
  const { total } = db.prepare("SELECT COUNT(*) AS total FROM pacientes").get();
  if (total > 0) return;

  const hoje = new Date();
  const emDias = (n) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };

  const inserirPaciente = db.prepare(`
    INSERT INTO pacientes (nome, cns, cns_hash, nascimento, telefone, procedimento, especialidade, lateralidade, cirurgiao, data, prioridade, observacoes, confirmado)
    VALUES (@nome, @cns, @cns_hash, @nascimento, @telefone, @procedimento, @especialidade, @lateralidade, @cirurgiao, @data, @prioridade, @observacoes, @confirmado)
  `);
  const inserirPendencia = db.prepare(`
    INSERT INTO pendencias (paciente_id, tipo, descricao, responsavel, prazo)
    VALUES (@paciente_id, @tipo, @descricao, @responsavel, @prazo)
  `);
  const inserirEvento = db.prepare(`
    INSERT INTO eventos (paciente_id, tipo, descricao)
    VALUES (@paciente_id, @tipo, @descricao)
  `);

  const seed = [
    {
      paciente: { nome: "Maria da Silva", cns: "123456789012345", nascimento: "1978-04-12", telefone: "(31) 99999-0001", procedimento: "Colecistectomia laparoscópica", especialidade: "Cirurgia Geral", lateralidade: "Não se aplica", cirurgiao: "Dr. Carlos Mendes", data: emDias(27), prioridade: "Eletiva", observacoes: "", confirmado: 0 },
      pendencias: [
        { tipo: "exame", descricao: "Hemograma vencido", responsavel: "Ambulatório", prazo: emDias(1) },
        { tipo: "avaliacao", descricao: "Avaliação anestésica pendente", responsavel: "Anestesia", prazo: emDias(2) }
      ],
      concluidos: ["Solicitação cadastrada", "AIH autorizada", "Consulta cirúrgica", "Material confirmado"]
    },
    {
      paciente: { nome: "João Pereira", cns: "987654321098765", nascimento: "1965-11-03", telefone: "(31) 99999-0002", procedimento: "Artroplastia de joelho", especialidade: "Ortopedia", lateralidade: "Esquerdo", cirurgiao: "Dra. Fernanda Lima", data: emDias(2), prioridade: "Eletiva", observacoes: "necessita prótese", confirmado: 1 },
      pendencias: [
        { tipo: "material", descricao: "Prótese não confirmada", responsavel: "OPME", prazo: emDias(0) },
        { tipo: "leito", descricao: "UTI não reservada", responsavel: "Internação", prazo: emDias(1) }
      ],
      concluidos: ["Solicitação cadastrada", "AIH autorizada", "Avaliação anestésica", "Exames atualizados"]
    },
    {
      paciente: { nome: "Ana Beatriz Souza", cns: "456789123456789", nascimento: "1990-02-20", telefone: "(31) 99999-0003", procedimento: "Histerectomia", especialidade: "Ginecologia", lateralidade: "Não se aplica", cirurgiao: "Dra. Ana Paula Costa", data: emDias(13), prioridade: "Eletiva", observacoes: "", confirmado: 1 },
      pendencias: [],
      concluidos: ["Solicitação cadastrada", "AIH autorizada", "Consulta cirúrgica", "Exames atualizados", "Avaliação anestésica", "Material confirmado", "Paciente confirmou presença"]
    },
    {
      paciente: { nome: "Roberto Almeida", cns: "789123456789123", nascimento: "1955-07-08", telefone: "(31) 99999-0004", procedimento: "Cirurgia de catarata", especialidade: "Oftalmologia", lateralidade: "Direito", cirurgiao: "Dr. Roberto Silva", data: emDias(7), prioridade: "Eletiva", observacoes: "", confirmado: 0 },
      pendencias: [
        { tipo: "contato", descricao: "Paciente não confirmou presença", responsavel: "Central Cirúrgica", prazo: emDias(5) }
      ],
      concluidos: ["Solicitação cadastrada", "AIH autorizada", "Exames atualizados", "Avaliação anestésica", "Material confirmado"]
    },
    {
      paciente: { nome: "Luciana Ferreira", cns: "321654987321654", nascimento: "1982-09-30", telefone: "(31) 99999-0005", procedimento: "Herniorrafia inguinal", especialidade: "Cirurgia Geral", lateralidade: "Direito", cirurgiao: "Dr. Carlos Mendes", data: emDias(30), prioridade: "Eletiva", observacoes: "", confirmado: 1 },
      pendencias: [],
      concluidos: ["Solicitação cadastrada", "AIH autorizada", "Consulta cirúrgica", "Exames atualizados", "Avaliação anestésica", "Material confirmado", "Paciente confirmou presença"]
    }
  ];

  const transacao = db.transaction(() => {
    for (const item of seed) {
      const p = item.paciente;
      const info = inserirPaciente.run({
        nome: encrypt(p.nome),
        cns: encrypt(p.cns),
        cns_hash: hashBusca(p.cns),
        nascimento: encrypt(p.nascimento),
        telefone: encrypt(p.telefone),
        procedimento: p.procedimento,
        especialidade: p.especialidade,
        lateralidade: p.lateralidade,
        cirurgiao: p.cirurgiao,
        data: p.data,
        prioridade: p.prioridade,
        observacoes: encrypt(p.observacoes),
        confirmado: p.confirmado
      });
      const pacienteId = info.lastInsertRowid;
      for (const pend of item.pendencias) {
        inserirPendencia.run({ paciente_id: pacienteId, ...pend });
      }
      for (const c of item.concluidos) {
        inserirEvento.run({ paciente_id: pacienteId, tipo: "etapa", descricao: c });
      }
    }
  });
  transacao();
}

seedUsuarioAdmin();
seedPacientesSeVazio();

module.exports = db;
