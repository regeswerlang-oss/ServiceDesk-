# SDHub · Service Desk — Documentação do Projeto

Painel web (Vercel, estático) que centraliza os tickets do **Movidesk** e integra com o
**Tasks SC (TOTVS Protheus)**. Lê e grava tudo no **Supabase** compartilhado
(`kpimalwnswxalwbidkog`, schema `totvs`) via chave publishable + Edge Functions.

- **Repositório:** `regeswerlang-oss/ServiceDesk-`
- **Pasta local:** `totvs-dashboard/sdhub-vercel/`
- **Arquivos do site:** `index.html` (painel), `supabase-data.js` (camada de dados `window.TSC`), `vercel.json`
- **Owner:** Reges Paulo Werlang

---

## 1. Visão geral da arquitetura

```
Navegador (Vercel, site estático)
  index.html + supabase-data.js  ──►  Supabase (schema totvs)
        │                                 ├── tabelas (leitura direta com anon key + RLS)
        │                                 └── Edge Functions (escrita/integração; segredos aqui)
        │                                        ├── Tasks SC  (api.tscst.com.br, OAuth2)
        │                                        └── Movidesk  (api.movidesk.com, token)
        └── ao abrir um ticket: histórico ao vivo (1 ticket) para trazer HTML/imagens

pg_cron (Supabase) ── de hora em hora ──► movidesk-sync ──► atualiza movidesk_tickets
```

Princípios:

- O **navegador nunca guarda segredo**. Só a chave *publishable/anon* vai ao repositório.
- Credenciais do **Tasks SC** ficam nos secrets das Edge Functions; o **token do Movidesk**
  fica na tabela `totvs.app_config` (acessível só pelo service_role).
- O **board e o histórico** vêm do Supabase (rápido). O **HTML com imagens** de cada e‑mail
  é buscado ao vivo só quando o ticket é aberto.

---

## 2. Funcionalidades do painel

### 2.1. Board (kanban)

- Colunas dinâmicas por **status** do ticket (Novo, Em atendimento, Aguardando Consultoria,
  Resolvido…), ordenadas por prioridade.
- **KPIs:** ativos, novos, aguardando, sem Task SC, resolvidos.
- Cada card mostra: protocolo, assunto, empresa, urgência, idade, nº de ações, selo
  **arquivado** e vínculo **Task SC** (com/sem).
- "Ativo" é definido pelo **status** do ticket (não pelo `is_archived`), então tickets
  parados/aguardando continuam visíveis.

### 2.2. Filtros

- Busca textual (assunto, protocolo, empresa, contato).
- Empresa, Urgência, **Task SC** (todas / com / sem).
- **Atualização:** Hoje · Ontem · Esta semana · O restante (por `last_update`).
- Checkbox "mostrar resolvidos/arquivados".

### 2.3. Drawer do ticket (ao clicar num card)

**Cabeçalho:** empresa, contato (nome · ✉ e‑mail), urgência, equipe, datas, nº de ações,
base status, sync.

**Histórico de mensagens:**
- Renderiza instantâneo a partir do **Supabase** (texto).
- Em seguida busca **ao vivo** (1 ticket) e re‑renderiza em **HTML** com tabelas, links e
  imagens `https://` do e‑mail. Imagens embutidas `cid:` viram um selo
  "🖼️ imagem embutida (ver no Movidesk)" — a API pública do Movidesk **não** entrega esse binário.
- Cada mensagem tem: seleção (checkbox), "↩︎ usar na ocorrência", "Ver mensagem completa".
- Barra "Marque as mensagens e adicione as selecionadas" → **→ Descrição** / **→ Ocorrência**.

### 2.4. Criar / Alterar Task no Tasks SC

Campos:
- **Título** (pré‑preenchido `[protocolo] assunto`).
- **Código do cliente no Tasks SC** — sugestão automática por nome da empresa (tabela
  `movidesk_seed_clients`), com autocomplete.
- **Contato** (nome/e‑mail) com botões → Descrição / → Ocorrência.
- **Responsável (TOTVS SC)** — dropdown dos consultores (default Reges 000019).
- **Responsável do cliente** — usuários do cliente (endpoint `assigned_users`).
- **Observadores (múltiplos)** — dropdown com checkboxes (TOTVS SC + usuários do cliente).
- **Tag** — dropdown por nome, default **SERVICE DESK** (000232).
- **Estimativa (h)** — inicia vazia (0 se não preencher) — e **SLA (dias)**.
- **Descrição** — texto/nota + opção "anexar histórico completo (HTML)" que injeta o
  histórico em **HTML sanitizado** (com imagens `https`, tabelas e links).

Comportamento:
- **Sem Task vinculada** → botão **Criar Task SC**.
- **Com Task vinculada** → botão **Alterar descrição da Task** (GET→merge→PUT).
- Quando já existe Task, aparece o bloco **➕ Adicionar ocorrência** (grava no histórico da
  Task via `add-history`), com opção de incluir as mensagens públicas do Movidesk.

> **Detalhe técnico:** o POST de criação do Tasks SC **não persiste** descrição, responsável
> nem observadores, e a resposta do POST é não‑confiável. Por isso o `create-task-sc`
> localiza a Task real por *cliente + título* (maior id) e faz um **update** desses campos
> logo após criar — tudo num clique só.

### 2.5. Comentar no Movidesk

- Ação **pública** (visível ao cliente), assinada pelo agente (`createdBy.id` = `MOVIDESK_OWNER_ID`).
- **Inserir:** Nº Task · Link (Tspace) · Resp. cliente · Observadores.
- **Frases rápidas** pré‑preenchidas, com seleção em checkbox e botão "adicionar selecionadas";
  editáveis e salvas (localStorage do navegador).
- **Marcar como Resolvido:** exige **Status de encerramento** + **Fato gerador do atendimento**
  (campo personalizado 33760). O painel manda `status` + `justification` nativa + o custom field.

### 2.6. Classificação (IA)

- Botão "Classificar agora" → função `classify` (sugere categoria Tasks SC Melhoria/Projeto/Sustentação).

---

## 3. Sincronização (o "de hora em hora")

- Edge Function **`movidesk-sync`** puxa a **mesa do dono** (`owner/id = MOVIDESK_OWNER_ID`)
  no Movidesk, mapeia para o formato do painel e faz **upsert** em `totvs.movidesk_tickets`
  (por `movidesk_id`), **preservando** o vínculo de Task SC.
- Guarda o **histórico** (`payload.actions`: autor, origem, data, texto) para o board abrir rápido.
- Agendado por **pg_cron**: job `movidesk-sync-hourly`, cron `0 * * * *`, dispara a função via
  `pg_net` (assíncrono, sem corte de tempo).

Rodar manualmente (uso interno):
```sql
select net.http_get(
  url := 'https://kpimalwnswxalwbidkog.supabase.co/functions/v1/movidesk-sync?key=<MOVIDESK_SYNC_KEY>',
  timeout_milliseconds := 150000);
```
A chave está em `totvs.app_config` (`MOVIDESK_SYNC_KEY`). **Não** versionar essa chave.

---

## 4. Edge Functions (Supabase)

| Função | O que faz | Segredos |
|---|---|---|
| `movidesk-sync` | Sync horário da mesa → `movidesk_tickets` (com histórico) | MOVIDESK_TOKEN, OWNER_ID, SYNC_KEY (app_config) |
| `movidesk-ticket` | GET do ticket completo ao vivo (traz `htmlDescription`/imagens) | MOVIDESK_TOKEN |
| `movidesk-comment` | Ação pública + resolver (status+justificativa+Fato gerador) | MOVIDESK_TOKEN, OWNER_ID |
| `movidesk-reasons` | Descobre motivos (justification) por status | MOVIDESK_TOKEN |
| `create-task-sc` | Cria Task (POST → localiza real → update descrição/responsáveis/observadores) | TASKS_USERNAME/PASSWORD |
| `task-update` | Altera campos da Task (GET path → payload curado → PUT) | TASKS_USERNAME/PASSWORD |
| `task-history` | Grava ocorrência no histórico da Task (resolve uuid pelo id) | TASKS_USERNAME/PASSWORD |
| `classify` | Sugestão de categoria (IA) | ANTHROPIC_API_KEY |
| `tasks-sc` / `tasks-update` / `tasks-list` | Funções do ecossistema (assigned_users, tags, update, histórico) | TASKS_* |

Todas exigem **usuário interno** (perfil `interno` em `totvs.profiles`), exceto `movidesk-sync`
(protegida por `MOVIDESK_SYNC_KEY`, para o cron).

---

## 5. Tabelas usadas (schema `totvs`)

| Tabela | Conteúdo |
|---|---|
| `movidesk_tickets` | Tickets do Movidesk + `payload.actions` (histórico). Coluna única `movidesk_id`. |
| `app_config` | `MOVIDESK_TOKEN`, `MOVIDESK_OWNER_ID`, `MOVIDESK_SYNC_KEY` (só service_role lê). |
| `movidesk_seed_clients` | De‑para nome da empresa → código do cliente no Tasks SC. |
| `tasks_consultants` | Consultores TOTVS SC (código ↔ nome). |
| `tasks_tags` | Catálogo de tags do Tasks SC (código ↔ nome). |
| `movidesk_reasons` | Itens do "Fato gerador do atendimento" (custom field 33760). |
| `movidesk_close_statuses` | Status de encerramento válidos ↔ justificativa nativa. |
| `profiles` | Perfil (interno/cliente) usado nas Edge Functions e RLS. |

---

## 6. Deploy

Site **estático** (sem build). O `vercel.json` força isso. Cada `git push` na `main`
dispara deploy automático na Vercel.

```bash
cd "/Users/regespaulowerlang/Documents/1 - Coordenação/IA/totvs-dashboard/sdhub-vercel"
rm -f .git/index.lock          # se travar o lock
git add index.html supabase-data.js
git commit -m "..."
git push
```

Há também o script `../publicar-sdhub.sh` (usa `GITHUB_TOKEN` do `conf/.env`) para publicar
sem mexer no git manualmente.

### Configuração inicial (uma vez)

1. **Secrets do Tasks SC** já configurados nas Edge Functions do projeto.
2. **`MOVIDESK_TOKEN`** e **`MOVIDESK_OWNER_ID`** em `totvs.app_config` (ou como secret).
3. **Login** no painel: conta Supabase com perfil `interno` (mesma dos outros dashboards).
4. Deployment Protection recomendada na Vercel (uso interno).

---

## 7. Limitações conhecidas

- **Imagens embutidas (`cid:`)** de e‑mails **não são recuperáveis** pela API pública do
  Movidesk (o `attachments` da ação vem vazio). Aparecem como selo; imagens `https://` (ex.:
  assinaturas) carregam normalmente.
- O **sync** traz a **mesa do dono** (`owner/id = MOVIDESK_OWNER_ID`). Tickets sem você como
  owner não aparecem — ajustar o filtro se necessário.
- **Frases rápidas** ficam no **navegador** (localStorage). Para compartilhar entre
  máquinas/pessoas, migrar para uma tabela no Supabase.
- O **editor de Edição** do Tspace pode não renderizar descrições grandes; a aba **Descrição**
  (visualização) mostra corretamente.

---

## 8. Operação / solução de problemas

- **Ticket novo não aparece:** confira o último sync (`select max(payload->>'last_synced_at')
  from totvs.movidesk_tickets`) e se você é o owner. Force o sync manual (seção 3).
- **Descrição não gravou:** o Tasks SC rejeita HTML pesado; o painel já usa HTML sanitizado.
- **Resolver falha ("Reason"):** cada status tem sua justificativa; use um **Status de
  encerramento** cadastrado em `movidesk_close_statuses` + o **Fato gerador**.
- **Ação sem autor no Movidesk:** garantir `MOVIDESK_OWNER_ID` em `app_config`.
- **Logs das funções:** Supabase → Edge Functions → Logs; e `get_advisors`/`get_logs` para depurar.
