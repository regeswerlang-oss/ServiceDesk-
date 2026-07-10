/* =====================================================================
   supabase-data.js  —  Camada única de dados (window.TSC)
   ---------------------------------------------------------------------
   Substitui os backends locais (8080/8081/8085) e os arquivos Dados/*.json
   pelo Supabase cloud (projeto totvs-dashboard).

   Uso no HTML:
     <script src="supabase-data.js"></script>
     ... e troque os fetch('Dados/...'), localhost:8081, localhost:8085
     pelas funções TSC.* (todas retornam o MESMO shape dos JSON antigos).

   Auth: login Supabase (e-mail/senha). Sem sessão, qualquer chamada abre
   o modal de login. Sessão persiste no navegador.
   ===================================================================== */
(function () {
  "use strict";

  // ===== Projeto Supabase ativo =====
  // "compartilhado" = banco único kpimalwnswxalwbidkog, schema totvs (destino da migração).
  // "dedicado"      = banco antigo axiskjbobeiodldnwexg, schema public (backup, funciona já).
  // Troque PROJETO para alternar. (Ao trocar, faça login de novo: a sessão é por projeto.)
  const PROJETO = "compartilhado";
  const PROJETOS = {
    compartilhado: { url: "https://kpimalwnswxalwbidkog.supabase.co", anon: "sb_publishable_XVFQmyH8DmU9SJ09v4luZA__7Vxg0nD", schema: "totvs" },
    dedicado:      { url: "https://axiskjbobeiodldnwexg.supabase.co", anon: "sb_publishable_yG2XttnuFdp4lh3KnyzFPg_BkY8KT_z", schema: "public" },
  };
  const CFG = PROJETOS[PROJETO] || PROJETOS.compartilhado;
  const SUPA_URL  = CFG.url;
  const SUPA_ANON = CFG.anon;
  const SUPA_SCHEMA = CFG.schema;
  const FN_BASE   = SUPA_URL + "/functions/v1";
  const SDK_URL   = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";

  let sb = null;
  let _custCache = null;

  // ---------- bootstrap do SDK ----------
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if ([].slice.call(document.scripts).some(function (s) { return s.src === src; })) return res();
      const el = document.createElement("script");
      el.src = src; el.async = true;
      el.onload = res; el.onerror = function () { rej(new Error("Falha ao carregar " + src)); };
      document.head.appendChild(el);
    });
  }
  async function init() {
    if (sb) return sb;
    if (!window.supabase) await loadScript(SDK_URL);
    sb = window.supabase.createClient(SUPA_URL, SUPA_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "tsc-auth-" + PROJETO },
      db: { schema: SUPA_SCHEMA },
    });
    return sb;
  }

  // ---------- sessão / auth ----------
  async function getSession() { await init(); const r = await sb.auth.getSession(); return r.data.session; }
  async function token()      { const s = await getSession(); return s ? s.access_token : null; }
  async function currentUser(){ const s = await getSession(); return s ? s.user : null; }
  async function login(email, senha) {
    await init();
    const r = await sb.auth.signInWithPassword({ email: email, password: senha });
    if (r.error) throw r.error;
    _custCache = null;
    return r.data;
  }
  async function logout() { await init(); await sb.auth.signOut(); _custCache = null; }

  async function requireSession() {
    const s = await getSession();
    if (s) {
      // A sessão em cache pode estar expirada/revogada no servidor (o
      // autoRefreshToken não recupera se o refresh_token foi revogado).
      // Validamos o token de fato antes de confiar nele; se inválido,
      // limpamos e caímos no modal de login.
      try {
        const r = await sb.auth.getUser();
        if (!r.error && r.data && r.data.user) return s;
      } catch (e) { /* rede indisponível → segue para novo login */ }
      try { await sb.auth.signOut(); } catch (e) {}
      _custCache = null;
    }
    await showLoginModal();
    return await getSession();
  }

  // ---------- modal de login ----------
  function showLoginModal() {
    return new Promise(function (resolve) {
      if (document.getElementById("tsc-login-ov")) { return; }
      const ov = document.createElement("div");
      ov.id = "tsc-login-ov";
      ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(20,10,40,.55);display:flex;align-items:center;justify-content:center;font-family:system-ui,Segoe UI,Roboto,sans-serif";
      ov.innerHTML =
        '<div style="background:#fff;border-radius:14px;padding:28px 26px;width:340px;box-shadow:0 18px 50px rgba(0,0,0,.3)">' +
          '<div style="font-size:18px;font-weight:700;color:#5B2E91;margin-bottom:4px">TOTVS SC — Dashboards</div>' +
          '<div style="font-size:13px;color:#666;margin-bottom:18px">Entre com sua conta para acessar os dados.</div>' +
          '<input id="tsc-email" type="email" placeholder="e-mail" autocomplete="username" style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:10px;border:1px solid #d6cdec;border-radius:8px;font-size:14px">' +
          '<input id="tsc-pass" type="password" placeholder="senha" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px;margin-bottom:14px;border:1px solid #d6cdec;border-radius:8px;font-size:14px">' +
          '<button id="tsc-btn" style="width:100%;padding:11px;background:#5B2E91;color:#fff;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">Entrar</button>' +
          '<div id="tsc-err" style="color:#c0392b;font-size:12px;margin-top:10px;min-height:14px"></div>' +
        '</div>';
      document.body.appendChild(ov);
      const $ = function (id) { return document.getElementById(id); };
      async function go() {
        const btn = $("tsc-btn"); btn.disabled = true; btn.textContent = "Entrando…"; $("tsc-err").textContent = "";
        try {
          await login($("tsc-email").value.trim(), $("tsc-pass").value);
          ov.remove(); resolve();
        } catch (e) {
          $("tsc-err").textContent = (e && e.message) ? e.message : "Falha no login";
          btn.disabled = false; btn.textContent = "Entrar";
        }
      }
      $("tsc-btn").addEventListener("click", go);
      $("tsc-pass").addEventListener("keydown", function (ev) { if (ev.key === "Enter") go(); });
      $("tsc-email").focus();
    });
  }

  // ---------- helper: chamar edge function ----------
  // Em 401 (token do Supabase inválido no servidor) força novo login e
  // repete a chamada UMA vez, para a sessão expirada se auto-recuperar
  // sem o usuário ver "erro de autenticação".
  async function callFn(name, body) {
    return await _callFn(name, body, true);
  }
  async function _callFn(name, body, allowRetry) {
    await requireSession();
    const t = await token();
    const r = await fetch(FN_BASE + "/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + t, "apikey": SUPA_ANON },
      body: JSON.stringify(body || {}),
    });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    if (r.status === 401 && allowRetry) {
      try { await sb.auth.signOut(); } catch (e) {}
      _custCache = null;
      await showLoginModal();
      return await _callFn(name, body, false);
    }
    if (!r.ok || (j && j.error)) throw new Error((j && j.error) ? j.error : ("HTTP " + r.status));
    return j;
  }

  // ---------- customers (≈ Dados/clientes.json) ----------
  async function getCustomers() {
    await requireSession();
    if (_custCache) return _custCache;
    const r = await sb.from("customers").select("customer_code,nome,chave,cmd").order("nome");
    if (r.error) throw r.error;
    const clientes = r.data.map(function (c) {
      return { chave: c.chave, cmd: c.cmd, nome: c.nome, codigo: c.customer_code,
               arquivo: (c.chave || c.customer_code) + "_tickets.json" };
    });
    _custCache = { generated_at: new Date().toISOString(), clientes: clientes };
    return _custCache;
  }
  async function _nomeDe(code) {
    try { const c = await getCustomers(); const f = c.clientes.find(function (x) { return x.codigo === code; }); return f ? f.nome : code; }
    catch (e) { return code; }
  }

  // ---------- tickets do snapshot Supabase (≈ Dados/{cliente}_tickets.json) ----------
  // Lê de totvs.tickets, sincronizado pela Edge Function tickets-sync a cada
  // 15 min (tickets + mapa de tags em lote). Muito mais rápido que bater na
  // API Tasks SC a cada load, e traz as tags[] já casadas por ticket — sem
  // isso o board de GAPs fica vazio (a listagem da API não retorna tags).
  // opts: {customer|codigo, includeClosed}
  async function listTickets(opts) {
    opts = opts || {};
    const code = opts.customer || opts.codigo || null;
    await requireSession();
    const pageSize = 1000;
    const all = [];
    for (let from = 0; from < 500000; from += pageSize) {
      let q = sb.from("tickets").select("payload,tags,close_date,synced_at");
      if (code) q = q.eq("customer_code", code);
      if (!opts.includeClosed) q = q.eq("close_date", "");   // abertos: close_date vazio
      q = q.order("id", { ascending: true }).range(from, from + pageSize - 1);
      const r = await q;
      if (r.error) throw r.error;
      const rows = r.data || [];
      for (const row of rows) {
        all.push(Object.assign({}, row.payload, { tags: row.tags || [] }));
      }
      if (rows.length < pageSize) break;
    }
    return { customer: code, cliente: await _nomeDe(code), total: all.length, tickets: all };
  }

  // ---------- ações (edge functions) ----------
  async function updateTicket(uuid, changes) { return await callFn("tasks-update", { uuid: uuid, changes: changes }); }
  async function tasksSc(action, params)     { return await callFn("tasks-sc", Object.assign({ action: action }, params || {})); }
  async function classify(payload)           { return await callFn("classify", payload || {}); }
  async function gmailDraft(payload)         { return await callFn("gmail-draft", payload || {}); }
  async function notebooklm(payload)         { return await callFn("notebooklm", payload || {}); }

  // ---------- SDHub: ações de escrita (Service Desk / Movidesk) ----------
  // Cria uma Task no Tasks SC a partir de um ticket Movidesk. Ver Edge Function create-task-sc.
  async function createTaskSc(payload)       { return await callFn("create-task-sc", payload || {}); }
  // Comenta (ação pública) em um ticket Movidesk; opcional marcar como Resolvido. Ver movidesk-comment.
  async function movideskComment(payload)    { return await callFn("movidesk-comment", payload || {}); }
  // Puxa o ticket Movidesk COMPLETO (com actions/histórico). Ver Edge Function movidesk-ticket.
  async function movideskTicket(ticketId)    { return await callFn("movidesk-ticket", { ticket_id: String(ticketId) }); }
  // Seed de clientes (código Tasks SC ↔ nome) para o dropdown de criação de Task.
  async function seedClients() {
    await requireSession();
    const r = await sb.from("movidesk_seed_clients").select("tasks_customer_code,tasks_customer_name").order("tasks_customer_name");
    if (r.error) throw r.error;
    return (r.data || []).map(function (x) { return { code: x.tasks_customer_code, name: x.tasks_customer_name }; });
  }
  // Grava ocorrência no histórico da Task SC (resolve o uuid real pelo id). Ver task-history.
  async function taskHistory(payload)        { return await callFn("task-history", payload || {}); }
  // Altera campos da Task SC (GET→merge→PUT, resolve uuid pelo id). Ver task-update.
  async function taskUpdate(payload)         { return await callFn("task-update", payload || {}); }
  // Catálogo de tags do Tasks SC (código ↔ nome) para o dropdown de tags.
  async function tags() {
    await requireSession();
    const r = await sb.from("tasks_tags").select("code,name").order("name");
    if (r.error) throw r.error;
    return (r.data || []).map(function (x) { return { code: x.code, name: x.name }; });
  }
  // Consultores TOTVS SC (código ↔ nome) para o campo Responsável.
  async function consultants() {
    await requireSession();
    const r = await sb.from("tasks_consultants").select("code,name,is_default").order("name");
    if (r.error) throw r.error;
    return (r.data || []).map(function (x) { return { code: x.code, name: x.name, def: x.is_default === 1 }; });
  }

  // ---------- emails (≈ Dados/{chave}_emails.json) ----------
  async function getEmails(code) {
    await requireSession();
    const r = await sb.from("emails").select("payload,data").eq("customer_code", code).order("data", { ascending: false });
    if (r.error) throw r.error;
    const emails = r.data.map(function (x) { return x.payload; });
    const nome = await _nomeDe(code);
    return { version: 2, _meta: { total_emails: emails.length, source: "supabase" },
             results: [{ customer: code, cliente: nome, emails: emails }] };
  }

  // ---------- snapshots (≈ Dados/{chave}_snapshots.json) ----------
  async function getSnapshots(code, tipo) {
    await requireSession();
    let q = sb.from("snapshots").select("captured_day,payload,tipo").eq("customer_code", code);
    q = q.eq("tipo", tipo || "evolucao_diaria");
    const r = await q.order("captured_day", { ascending: true });
    if (r.error) throw r.error;
    const days = {};
    r.data.forEach(function (row) { days[row.captured_day] = row.payload; });
    return { chave: code, nome: await _nomeDe(code), days: days, updated_at: new Date().toISOString() };
  }

  // ---------- decisions (tabela decisions) ----------
  async function getDecisions(code) {
    await requireSession();
    let q = sb.from("decisions").select("*");
    if (code) q = q.eq("customer_code", code);
    const r = await q.order("created_at", { ascending: false });
    if (r.error) throw r.error;
    return r.data;
  }
  async function saveDecision(d) {
    await requireSession();
    const r = await sb.from("decisions").insert(d).select();
    if (r.error) throw r.error;
    return r.data;
  }

  // ---------- e-mails: busca e mensagem por id (da tabela emails) ----------
  async function searchEmails(query, customer) {
    await requireSession();
    let q = sb.from("emails").select("payload,data,customer_code");
    if (customer) q = q.eq("customer_code", customer);
    const r = await q.order("data", { ascending: false }).limit(400);
    if (r.error) throw r.error;
    let rows = r.data.map(function (x) { return Object.assign({ _customer: x.customer_code }, x.payload); });
    const term = (query || "").trim().toLowerCase();
    if (term) {
      rows = rows.filter(function (e) {
        return [(e.subject||""),(e.from||""),(e.snippet||""),(e.to||"")].join(" ").toLowerCase().indexOf(term) >= 0;
      });
    }
    return rows;
  }
  async function getEmailById(id) {
    await requireSession();
    const r = await sb.from("emails").select("payload").eq("message_id", String(id)).limit(1);
    if (r.error) throw r.error;
    return (r.data && r.data[0]) ? r.data[0].payload : null;
  }

  // ---------- decisões: mapa por ticket (≈ /api/decisoes local) ----------
  async function getDecisoesMap(customer) {
    const rows = await getDecisions(customer); // já vem por created_at desc (mais recente 1º)
    const map = {};
    (rows || []).forEach(function (d) {
      if (!map[d.ticket_id]) map[d.ticket_id] = { decisao: d.decisao, estimativa: d.estimativa, observacao: d.observacao, id: d.id };
    });
    return map;
  }

  // ---------- movidesk (≈ Movidesk/sdhub/state.db tickets) ----------
  async function getMovidesk(opts) {
    await requireSession();
    let q = sb.from("movidesk_tickets").select("payload");
    if (opts && opts.customer) q = q.eq("customer_code", opts.customer);
    const r = await q;
    if (r.error) throw r.error;
    return r.data.map(function (x) { return x.payload; });
  }

  window.TSC = {
    init: init, login: login, logout: logout, currentUser: currentUser,
    getSession: getSession, requireSession: requireSession, showLogin: showLoginModal,
    getCustomers: getCustomers, listTickets: listTickets, updateTicket: updateTicket,
    tasksSc: tasksSc, fn: callFn,
    classify: classify, gmailDraft: gmailDraft, notebooklm: notebooklm,
    getEmails: getEmails, getSnapshots: getSnapshots,
    searchEmails: searchEmails, getEmailById: getEmailById, getDecisoesMap: getDecisoesMap,
    getDecisions: getDecisions, saveDecision: saveDecision, getMovidesk: getMovidesk,
    createTaskSc: createTaskSc, movideskComment: movideskComment,
    movideskTicket: movideskTicket, seedClients: seedClients, consultants: consultants, tags: tags,
    taskHistory: taskHistory, taskUpdate: taskUpdate,
    _config: { URL: SUPA_URL, ANON: SUPA_ANON, FN: FN_BASE },
  };
})();
