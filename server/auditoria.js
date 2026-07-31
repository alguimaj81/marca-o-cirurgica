const db = require("./db");

const inserirAuditoria = db.prepare(`
  INSERT INTO auditoria (usuario_nome, acao, paciente_id, detalhes)
  VALUES (@usuario_nome, @acao, @paciente_id, @detalhes)
`);

function registrarAuditoria(usuarioNome, acao, pacienteId = null, detalhes = null) {
  inserirAuditoria.run({
    usuario_nome: usuarioNome,
    acao,
    paciente_id: pacienteId,
    detalhes
  });
}

module.exports = { registrarAuditoria };
