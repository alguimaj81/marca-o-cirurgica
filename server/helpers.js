function hojeISO() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return hoje.toISOString().split("T")[0];
}

function calcularDiasAte(dataStr) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const data = new Date(dataStr + "T00:00:00");
  return Math.ceil((data - hoje) / (1000 * 60 * 60 * 24));
}

// Status é sempre derivado das pendências reais, nunca armazenado separadamente.
function calcularStatusPaciente(pendenciasAtivas) {
  if (!pendenciasAtivas || pendenciasAtivas.length === 0) return "pronto";
  const temCritica = pendenciasAtivas.some((p) => calcularDiasAte(p.prazo) <= 1);
  return temCritica ? "risco" : "atencao";
}

function severidadePendencia(pendencia) {
  const dias = calcularDiasAte(pendencia.prazo);
  if (dias <= 1) return "red";
  if (dias <= 3) return "yellow";
  return "green";
}

function calcularPrazo(dias) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return data.toISOString().split("T")[0];
}

function gerarPendenciasIniciais(especialidade, observacoes) {
  const pends = [
    { tipo: "regulacao", descricao: "AIH pendente de autorização", responsavel: "Regulação", prazo: calcularPrazo(3) },
    { tipo: "avaliacao", descricao: "Avaliação anestésica pendente", responsavel: "Anestesia", prazo: calcularPrazo(7) },
    { tipo: "exame", descricao: "Exames pré-operatórios pendentes", responsavel: "Ambulatório", prazo: calcularPrazo(5) }
  ];

  const obsLower = (observacoes || "").toLowerCase();
  if (obsLower.includes("prótese") || obsLower.includes("protese")) {
    pends.push({ tipo: "material", descricao: "Prótese não confirmada", responsavel: "OPME", prazo: calcularPrazo(10) });
  }
  if (obsLower.includes("uti")) {
    pends.push({ tipo: "leito", descricao: "Reserva de UTI pendente", responsavel: "Internação", prazo: calcularPrazo(7) });
  }
  if (especialidade === "Ortopedia") {
    pends.push({ tipo: "material", descricao: "Material ortopédico a confirmar", responsavel: "OPME", prazo: calcularPrazo(10) });
  }

  return pends;
}

module.exports = {
  hojeISO,
  calcularDiasAte,
  calcularStatusPaciente,
  severidadePendencia,
  calcularPrazo,
  gerarPendenciasIniciais
};
