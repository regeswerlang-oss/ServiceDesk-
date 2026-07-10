# SDHub · Service Desk (Movidesk) — online

Painel **estático** (Vercel, sem build) do **Service Desk Hub**: um kanban dos
tickets **Movidesk** lendo o **Supabase compartilhado** (`kpimalwnswxalwbidkog`,
schema `totvs`, tabela `movidesk_tickets`) com chave publishable/anon + RLS.

É a versão **web/online** do `Movidesk/sdhub/` (que roda em Streamlit local). Não
substitui o app Streamlit — é uma camada de visibilidade + ações rápidas.

## Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | O painel: KPIs, filtros, kanban por status, drawer de detalhes com ações. |
| `supabase-data.js` | Camada de dados `window.TSC` (login, leitura, edge functions). Cópia do DashboardIndex + wrappers `createTaskSc` e `movideskComment`. |
| `vercel.json` | Força site estático (sem build). |
| `DEPLOY.md` | Passo a passo git + Vercel + secret do Movidesk. |

## O que o painel faz

**Leitura** (via `TSC.getMovidesk()` → `totvs.movidesk_tickets`):
- Kanban com colunas dinâmicas por status (Novo, Em atendimento, Aguardando
  Consultoria, Resolvido, …), ordenadas por prioridade.
- KPIs: ativos, novos, aguardando, sem Task SC, resolvidos.
- Filtros: busca textual, empresa, urgência, com/sem Task SC, mostrar resolvidos.
- Drawer com todos os campos do ticket (empresa, urgência, equipe, datas, nº de
  ações, base status, sync).

**Escrita** (Edge Functions do Supabase — só usuário interno):
- **Criar Task SC** (`create-task-sc`): OAuth2 Tasks SC → `POST /tickets` (UUID
  client-side p/ idempotência) → GET de confirmação → grava `tasks_id` de volta no
  `movidesk_tickets`. Confirmação em 2 passos.
- **Comentar no Movidesk** (`movidesk-comment`): PATCH ação pública, opcional
  marcar como Resolvido. Confirmação em 2 passos.

**Histórico de mensagens (timeline)**: ao abrir um ticket, o painel busca o ticket
completo **ao vivo** no Movidesk (Edge Function `movidesk-ticket`) e monta a timeline
de ações (tipo pública/interna, origem, autor, "você", ver mensagem completa, e
"↩︎ usar no comentário"). Requer o secret `MOVIDESK_TOKEN`.

**Classificação (IA)**: botão "Classificar agora" chama a função `classify` e sugere
a categoria Tasks SC (Melhoria/Projeto/Sustentação).

**Dropdown de cliente**: o código Tasks SC no Criar Task vem da tabela
`totvs.movidesk_seed_clients` (seed do `seed_clients.csv`), com sugestão automática
por nome da empresa. Dá para digitar um código livre também.

## Limites da v1

- O kanban lê o **resumo** de `movidesk_tickets` (status, empresa, datas, nº de ações,
  vínculo com Task SC). A timeline detalhada vem ao vivo por ticket (não do resumo).
- O seed de clientes tem os 22 do CSV. Para cobrir todos os ~3.456 clientes Tasks SC,
  evoluir para busca ao vivo no endpoint `/customer` (futuro).
- O board depende do sync que popula `movidesk_tickets` (hoje manual).
