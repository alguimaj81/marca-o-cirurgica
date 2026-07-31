const cron = require("node-cron");
const db = require("../db");
const { calcularDiasAte } = require("../helpers");
const { decrypt } = require("../crypto-helper");
const { registrarAuditoria } = require("../auditoria");

const SISTEMA = "Sistema (automação)";

const inserirEvento = db.prepare(`
  INSERT INTO eventos (paciente_id, tipo, descricao)
  VALUES (@paciente_id, @tipo, @descricao)
`);

// Evita alertar/mensagear duas vezes o mesmo dia para o mesmo gatilho.
function jaExecutadoHoje(pacienteId, marcador) {
  const hoje = new Date().toISOString().split("T")[0];
  const row = db
    .prepare(`
      SELECT id FROM eventos
      WHERE paciente_id = ? AND descricao LIKE ? AND date(criado_em) = ?
    `)
    .get(pacienteId, `%${marcador}%`, hoje);
  return !!row;
}

// Automação 1: alerta de pendência vencendo/vencida (roda sobre pendências ainda abertas).
function runAlertasPendencias() {
  const pendenciasAbertas = db.prepare("SELECT * FROM pendencias WHERE resolvida_em IS NULL").all();
  let gerados = 0;

  for (const p of pendenciasAbertas) {
    const dias = calcularDiasAte(p.prazo);
    if (dias > 1) continue; // só alerta quando crítica (prazo em até 1 dia ou vencida)

    const marcador = `[alerta:pendencia:${p.id}]`;
    if (jaExecutadoHoje(p.paciente_id, marcador)) continue;

    const situacao = dias < 0 ? `vencida há ${Math.abs(dias)} dia(s)` : dias === 0 ? "vence hoje" : "vence amanhã";
    const descricao = `⚠️ ${marcador} Pendência crítica em ${p.responsavel}: "${p.descricao}" ${situacao}.`;
    inserirEvento.run({ paciente_id: p.paciente_id, tipo: "alerta", descricao });
    registrarAuditoria(SISTEMA, "alerta_pendencia_critica", p.paciente_id, descricao);
    gerados++;
  }
  return gerados;
}

// Automação 2: mensagem simulada de confirmação 72h/24h antes da cirurgia.
function runMensagensConfirmacao() {
  const pacientes = db.prepare("SELECT * FROM pacientes").all();
  let gerados = 0;

  for (const p of pacientes) {
    const dias = calcularDiasAte(p.data);
    let janela = null;
    if (dias === 3) janela = "72h";
    else if (dias === 1) janela = "24h";
    if (!janela) continue;

    const marcador = `[mensagem:${janela}]`;
    if (jaExecutadoHoje(p.id, marcador)) continue;

    const nome = decrypt(p.nome);
    const descricao = `📱 ${marcador} [SIMULADO] Mensagem de confirmação enviada a ${nome}: "Sua cirurgia (${p.procedimento}) está agendada para ${p.data}. Responda para confirmar presença."`;
    inserirEvento.run({ paciente_id: p.id, tipo: "mensagem_simulada", descricao });
    registrarAuditoria(SISTEMA, "mensagem_confirmacao_simulada", p.id, `janela ${janela}`);
    gerados++;
  }
  return gerados;
}

function runTodasAutomacoes() {
  const alertas = runAlertasPendencias();
  const mensagens = runMensagensConfirmacao();
  return { alertas, mensagens };
}

function iniciarAgendamentos() {
  // Diariamente às 08:00 — horário fictício, ajustável conforme rotina do setor.
  cron.schedule("0 8 * * *", () => {
    const resultado = runTodasAutomacoes();
    console.log(`[automacoes] execução agendada — alertas: ${resultado.alertas}, mensagens: ${resultado.mensagens}`);
  });

  // Roda uma vez ao subir o servidor, para o efeito ser visível imediatamente em demo/teste.
  const resultado = runTodasAutomacoes();
  console.log(`[automacoes] execução inicial — alertas: ${resultado.alertas}, mensagens: ${resultado.mensagens}`);
}

module.exports = { runTodasAutomacoes, iniciarAgendamentos };
