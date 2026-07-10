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

## Limites da v1

- O `movidesk_tickets` guarda um **resumo** do ticket (sem o array de ações / sem
  classificação IA). Por isso o drawer não traz a timeline de ações nem o bloco IA
  do Streamlit. Trazer isso exige o sync do sdhub empurrar `actions`/`classifications`
  para o Supabase (evolução futura).
- Dados dependem do sync que popula `movidesk_tickets` (hoje manual). Sem sync novo,
  o board reflete o último snapshot gravado.
