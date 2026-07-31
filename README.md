# marca-o-cirurgica

Central Inteligente de Jornada Cirúrgica (SUS) — vamos agendar pacientes de forma autônoma e mais segura possível.

## Estrutura

- `jornada-cirurgica.html` — front-end (login, dashboard, cadastro de pacientes, fluxo da jornada, auditoria). Consome a API do backend em `/api`.
- `server/` — backend Node.js/Express que persiste tudo em SQLite, autentica usuários e roda as automações.
  - `db.js` — schema do banco (`pacientes`, `pendencias`, `eventos`, `usuarios`, `auditoria`) e dados de exemplo (seed, só roda se o banco estiver vazio).
  - `helpers.js` — regras de negócio (status derivado das pendências, geração automática de pendências por especialidade/observações).
  - `crypto-helper.js` — criptografia dos campos sensíveis do paciente (AES-256-GCM) + hash pesquisável do CNS.
  - `auth.js` — hash de senha (bcrypt), emissão/validação de sessão (JWT em cookie httpOnly), middleware `requireAuth`.
  - `auditoria.js` — grava eventos de acesso/alteração para rastreabilidade.
  - `routes/auth.js` — login, logout, usuário atual.
  - `routes/pacientes.js` — API REST de pacientes (listar, cadastrar, excluir; resolver pendência) — protegida por login.
  - `routes/auditoria.js` — consulta do log de auditoria — protegida por login.
  - `jobs/automations.js` — automações agendadas (ver abaixo).
  - `server.js` — sobe o servidor, serve o próprio `jornada-cirurgica.html` e monta as rotas.

## Banco de dados

SQLite local, em arquivo (`server/jornada.sqlite`, criado automaticamente na primeira execução — não versionado). Sem necessidade de instalar ou configurar um servidor de banco separado.

**Campos sensíveis do paciente são criptografados em disco** (nome, CNS, data de nascimento, telefone, observações) com AES-256-GCM. A chave fica em `server/.encryption-key`, gerada automaticamente no primeiro start e **não versionada** — se esse arquivo se perder, os dados já salvos ficam irrecuperáveis (faça backup dele junto com o `.sqlite` se for usar com dados reais). O CNS também guarda um hash (`cns_hash`) só para permitir checar duplicidade sem descriptografar a tabela toda.

## Login e usuários

O sistema exige login (usuário/senha) para qualquer acesso a dados de paciente. Sessão via cookie httpOnly (JWT), expira em 8h.

Na primeira execução é criado um usuário padrão:
```
usuário: admin
senha:   trocar123
```
**Troque essa senha antes de usar com dados reais.** Ainda não existe tela de gestão de usuários — para trocar a senha ou criar outro usuário por enquanto, é direto no banco (ex: script Node usando `hashSenha` de `auth.js`).

## Auditoria

Toda ação relevante fica registrada (usuário, ação, paciente afetado, quando): login, tentativa de login falha, listar pacientes, abrir paciente, cadastrar, excluir, resolver pendência — inclusive as automações rodam como usuário `Sistema (automação)`. Visível na aba **🔒 Auditoria** do painel, ou via `GET /api/auditoria`.

## Automações

1. **Distribuição automática de pendências**: ao cadastrar uma solicitação, o backend já gera e atribui as pendências certas aos setores responsáveis (regulação, anestesia, ambulatório, OPME, internação) com base na especialidade e nas observações.
2. **Alertas de pendência crítica**: job diário (agendado às 08:00 via `node-cron`) que varre as pendências em aberto e registra um alerta no histórico do paciente quando o prazo está a até 1 dia (ou já venceu). Não duplica alerta no mesmo dia para a mesma pendência.
3. **Mensagens de confirmação 72h/24h**: mesmo job diário verifica cirurgias a 3 ou 1 dia de distância e registra uma mensagem simulada de confirmação no histórico do paciente (ainda não integrado a um canal real de envio — WhatsApp/SMS/e-mail podem ser plugados depois sem mudar o restante do sistema).

Além do agendamento diário, o painel tem um botão **"Executar automações agora"** que dispara os dois jobs na hora (útil para demonstração/teste, sem esperar até 08:00).

## Como rodar

```bash
cd server
npm install     # só na primeira vez
npm start
```

Depois abra **http://localhost:3000** no navegador e entre com `admin` / `trocar123`.

## Limitações conhecidas (protótipo — ver antes de usar com paciente real)

- Sem HTTPS — em rede local já ajuda, mas para produção precisa de TLS na frente (proxy reverso, por exemplo).
- Sem tela de gestão de usuários (criar/desativar usuário, trocar senha) — só via banco por enquanto.
- Sem controle de permissão por setor — qualquer usuário logado vê e mexe em tudo.
- Mensagens de confirmação são simuladas (só ficam no histórico), não saem de fato para o paciente.
- Log de auditoria não tem rotação/expurgo — cresce indefinidamente; para uso real, definir política de retenção.

## Próximos passos possíveis

- Plugar um canal real de mensageria (WhatsApp via n8n + Evolution API, SMS ou e-mail) no lugar da simulação.
- Tela de gestão de usuários e permissões por setor.
- Migrar de SQLite para Postgres (ex: Supabase) se o uso deixar de ser em uma única máquina/posto.
- Se for tratar dado real de paciente do SUS: revisão formal de compliance LGPD (base legal, DPO, plano de resposta a incidente) antes de ir para produção.
