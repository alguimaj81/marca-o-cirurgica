const express = require("express");
const db = require("../db");
const { encrypt, decrypt, hashBusca } = require("../crypto-helper");
const { registrarAuditoria } = require("../auditoria");
const {
  hojeISO,
  calcularStatusPaciente,
  gerarPendenciasIniciais
} = require("../helpers");

const router = express.Router();

const ESPECIALIDADES_VALIDAS = [
  "Cirurgia Geral", "Ortopedia", "Ginecologia", "Urologia",
  "Neurocirurgia", "Cardiologia", "Oftalmologia"
];

function descriptografarPaciente(row) {
  return {
    ...row,
    nome: decrypt(row.nome),
    cns: decrypt(row.cns),
    nascimento: decrypt(row.nascimento),
    telefone: decrypt(row.telefone),
    observacoes: decrypt(row.observacoes)
  };
}

function montarPaciente(pacienteRow) {
  const paciente = descriptografarPaciente(pacienteRow);
  const pendencias = db
    .prepare("SELECT * FROM pendencias WHERE paciente_id = ? AND resolvida_em IS NULL ORDER BY prazo ASC")
    .all(paciente.id);
  const eventos = db
    .prepare("SELECT * FROM eventos WHERE paciente_id = ? ORDER BY criado_em ASC, id ASC")
    .all(paciente.id);
  const mensagensEnviadas = eventos.filter((e) => e.tipo === "mensagem_simulada").length;

  return {
    ...paciente,
    confirmado: !!paciente.confirmado,
    status: calcularStatusPaciente(pendencias),
    pendencias,
    eventos,
    concluidos: eventos.filter((e) => e.tipo === "etapa").map((e) => e.descricao),
    comunicacoes: { confirmado: !!paciente.confirmado, mensagensEnviadas }
  };
}

// GET /api/pacientes
router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM pacientes ORDER BY data ASC").all();
  registrarAuditoria(req.usuario.nome, "listar_pacientes", null, `${rows.length} paciente(s)`);
  res.json(rows.map(montarPaciente));
});

// GET /api/pacientes/:id
router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM pacientes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ erro: "Paciente não encontrado" });
  const paciente = montarPaciente(row);
  registrarAuditoria(req.usuario.nome, "ver_paciente", paciente.id, paciente.nome);
  res.json(paciente);
});

// POST /api/pacientes
router.post("/", (req, res) => {
  const b = req.body || {};
  const erros = {};

  const nome = (b.nome || "").trim();
  if (!nome) erros.nome = "Nome é obrigatório.";

  const cns = (b.cns || "").trim();
  let cnsHash = null;
  if (!/^\d{15}$/.test(cns)) {
    erros.cns = "O CNS deve ter exatamente 15 dígitos numéricos.";
  } else {
    cnsHash = hashBusca(cns);
    const existente = db.prepare("SELECT id FROM pacientes WHERE cns_hash = ?").get(cnsHash);
    if (existente) erros.cns = "Já existe um paciente cadastrado com este CNS.";
  }

  const especialidade = b.especialidade;
  if (!ESPECIALIDADES_VALIDAS.includes(especialidade)) erros.especialidade = "Especialidade inválida.";

  const lateralidade = b.lateralidade || "Não se aplica";
  if (especialidade === "Ortopedia" && lateralidade === "Não se aplica") {
    erros.lateralidade = "Para procedimentos ortopédicos, a lateralidade é obrigatória.";
  }

  const cirurgiao = (b.cirurgiao || "").trim();
  if (!cirurgiao) erros.cirurgiao = "Cirurgião responsável é obrigatório.";

  const procedimento = (b.procedimento || "").trim();
  if (!procedimento) erros.procedimento = "Procedimento é obrigatório.";

  const dataPrevista = b.data_prevista || b.data;
  if (!dataPrevista) {
    erros.data_prevista = "Data prevista é obrigatória.";
  } else if (dataPrevista < hojeISO()) {
    erros.data_prevista = "A data prevista não pode estar no passado.";
  }

  if (Object.keys(erros).length > 0) {
    return res.status(400).json({ erros });
  }

  const prioridade = b.prioridade || "Eletiva";
  const observacoes = b.observacoes || "";

  const inserirPaciente = db.prepare(`
    INSERT INTO pacientes (nome, cns, cns_hash, nascimento, telefone, procedimento, especialidade, lateralidade, cirurgiao, data, prioridade, observacoes, confirmado)
    VALUES (@nome, @cns, @cns_hash, @nascimento, @telefone, @procedimento, @especialidade, @lateralidade, @cirurgiao, @data, @prioridade, @observacoes, 0)
  `);
  const inserirPendencia = db.prepare(`
    INSERT INTO pendencias (paciente_id, tipo, descricao, responsavel, prazo)
    VALUES (@paciente_id, @tipo, @descricao, @responsavel, @prazo)
  `);
  const inserirEvento = db.prepare(`
    INSERT INTO eventos (paciente_id, tipo, descricao)
    VALUES (@paciente_id, @tipo, @descricao)
  `);

  const criarTudo = db.transaction(() => {
    const info = inserirPaciente.run({
      nome: encrypt(nome),
      cns: encrypt(cns),
      cns_hash: cnsHash,
      nascimento: encrypt(b.nascimento || null),
      telefone: encrypt(b.telefone || null),
      procedimento, especialidade, lateralidade, cirurgiao,
      data: dataPrevista, prioridade,
      observacoes: encrypt(observacoes)
    });
    const pacienteId = info.lastInsertRowid;

    // Distribuição automática de pendências aos setores responsáveis
    const pendenciasIniciais = gerarPendenciasIniciais(especialidade, observacoes);
    for (const p of pendenciasIniciais) {
      inserirPendencia.run({ paciente_id: pacienteId, ...p });
    }

    inserirEvento.run({ paciente_id: pacienteId, tipo: "etapa", descricao: "Solicitação cadastrada" });
    inserirEvento.run({
      paciente_id: pacienteId,
      tipo: "sistema",
      descricao: `Jornada criada e ${pendenciasIniciais.length} pendência(s) distribuída(s) automaticamente aos setores responsáveis.`
    });

    return pacienteId;
  });

  const pacienteId = criarTudo();
  const row = db.prepare("SELECT * FROM pacientes WHERE id = ?").get(pacienteId);
  const paciente = montarPaciente(row);
  registrarAuditoria(req.usuario.nome, "criar_paciente", paciente.id, paciente.nome);
  res.status(201).json(paciente);
});

// DELETE /api/pacientes/:id
router.delete("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM pacientes WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ erro: "Paciente não encontrado" });
  const nome = decrypt(row.nome);
  db.prepare("DELETE FROM pacientes WHERE id = ?").run(req.params.id);
  registrarAuditoria(req.usuario.nome, "excluir_paciente", Number(req.params.id), nome);
  res.status(204).end();
});

// POST /api/pacientes/:id/pendencias/:pendenciaId/resolver
router.post("/:id/pendencias/:pendenciaId/resolver", (req, res) => {
  const pendencia = db
    .prepare("SELECT * FROM pendencias WHERE id = ? AND paciente_id = ? AND resolvida_em IS NULL")
    .get(req.params.pendenciaId, req.params.id);
  if (!pendencia) return res.status(404).json({ erro: "Pendência não encontrada ou já resolvida" });

  const transacao = db.transaction(() => {
    db.prepare("UPDATE pendencias SET resolvida_em = datetime('now') WHERE id = ?").run(pendencia.id);
    db.prepare("INSERT INTO eventos (paciente_id, tipo, descricao) VALUES (?, 'etapa', ?)").run(
      req.params.id,
      pendencia.descricao
    );
  });
  transacao();

  registrarAuditoria(req.usuario.nome, "resolver_pendencia", Number(req.params.id), pendencia.descricao);

  const row = db.prepare("SELECT * FROM pacientes WHERE id = ?").get(req.params.id);
  res.json(montarPaciente(row));
});

module.exports = router;
