# Deploy — SDHub online (repo próprio, Vercel + Supabase)

Repositório **estático dedicado**, sem build. Separado do DashboardIndex.

## 1. Git → GitHub (rodar no Mac)

O `.git` precisa ser criado no Mac (o ambiente que preparou os arquivos não grava
`.git` na pasta montada). No terminal:

```bash
cd "/Users/regespaulowerlang/Documents/1 - Coordenação/IA/totvs-dashboard/sdhub-vercel"

git init
git branch -M main
# crie um repo vazio em github.com (ex.: regeswerlang-oss/sdhub-vercel) e:
git remote add origin https://github.com/regeswerlang-oss/sdhub-vercel.git

git add .
git status                 # CONFIRA: nenhum .env, senha, .db ou .xlsx
git commit -m "feat: SDHub Service Desk online (Vercel + Supabase) — kanban Movidesk + acoes"
git push -u origin main
```

O `.gitignore` já barra `.env`, `*.db`, `*.xlsx` e segredos. **Só a chave
publishable/anon** (que já está em `supabase-data.js`) vai ao repo — ela é pública.

## 2. Importar na Vercel

1. Vercel → **Add New… → Project** → importe `regeswerlang-oss/sdhub-vercel`.
2. **Root Directory:** `./`.
3. **Framework Preset:** `Other` (o `vercel.json` força sem build).
4. **Deploy.** A home fica em `https://<projeto>.vercel.app/` (o `index.html`).
5. **Settings → Deployment Protection** → Vercel Authentication (recomendado).

Cada `git push` na `main` dispara deploy automático.

## 3. Secrets das Edge Functions (Supabase)

As funções rodam no projeto `kpimalwnswxalwbidkog` (já deployadas):
**`create-task-sc`**, **`movidesk-comment`** e **`movidesk-ticket`**.

- **Criar Task SC** já funciona: reusa os secrets de Tasks SC (`TASKS_USERNAME`,
  `TASKS_PASSWORD`) que as demais functions do ecossistema já usam.
- **Histórico de mensagens** (`movidesk-ticket`) e **Comentar no Movidesk**
  (`movidesk-comment`) precisam do secret **`MOVIDESK_TOKEN`**:

```bash
# via Supabase CLI (ou pelo painel: Project → Edge Functions → Secrets)
supabase secrets set MOVIDESK_TOKEN="<token do Movidesk>" --project-ref kpimalwnswxalwbidkog

# opcionais (têm default):
supabase secrets set MOVIDESK_RESOLVED_STATUS_NAME="Resolvido" --project-ref kpimalwnswxalwbidkog
supabase secrets set MOVIDESK_RESOLVED_JUSTIFICATION="Resolvido pela consultoria" --project-ref kpimalwnswxalwbidkog
```

O `MOVIDESK_TOKEN` está no seu `conf/.env` local (do sdhub). **Nunca** commite esse
valor. Sem ele, o **histórico de mensagens** não carrega e o botão "Comentar no
Movidesk" retorna erro claro (503) — o kanban e o Criar Task SC continuam funcionando.

## 4. Acesso / login

Ao abrir o site, aparece o modal de login Supabase (mesmo do DashboardIndex).
As ações de escrita exigem **perfil interno** (tabela `totvs.profiles`, `role='interno'`).

## Checklist pós-deploy

- [ ] Home abre; `supabase-data.js` carrega sem 404; modal de login autentica.
- [ ] Kanban lista os tickets Movidesk; filtros e KPIs funcionam.
- [ ] Criar Task SC: cria a Task, mostra o `id` e o card passa a exibir "Task ####".
- [ ] `MOVIDESK_TOKEN` setado → Comentar no Movidesk funciona.
- [ ] Deployment Protection ativa; `git status` limpo (sem segredo/`.db`).

## Endpoints usados (referência)

- Tasks SC (criar): `POST https://api.tscst.com.br/restAPI/custom/tscst/tasks/tickets`
  + confirmação `GET .../tickets?uuid_ticket=<UUID>&fields=id,title`.
- Movidesk (comentar): `PATCH https://api.movidesk.com/public/v1/tickets?token=…&id=<id>`.
