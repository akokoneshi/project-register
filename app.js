(async function () {
  const LOC = { CT: "Connecticut", WC: "Hudson Valley, NY" };
  const TYPES = ["Project Manager", "Assistant Project Manager", "Project Engineer", "Accounts Payable", "Superintendent", "Estimator", "Purchasing", "Owner / Other"];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const blank = () => ({ type: "", name: "", email: "", phone: "" });

  let projects = [], loaded = false, col = null, mode = "list";
  let editingId = null, viewingId = null, formContacts = [];
  let clientKey = null, returnTo = null, clientQ = "", clients = [], clientContacts = [], editingClient = null;
  const view = { loc: "all", status: "", q: "", sortK: "job", sortDir: 1 };
  try { const s = JSON.parse(localStorage.getItem("pr-view") || "null"); if (s) Object.assign(view, s); } catch (e) {}
  function saveView() { try { localStorage.setItem("pr-view", JSON.stringify(view)); } catch (e) {} }

  // Projects saved before contacts existed only have PM / AP fields: show them as contacts.
  function contactsOf(p) {
    if (Array.isArray(p.contacts)) return p.contacts;
    const out = [];
    if (p.pmName || p.pmEmail) out.push({ type: "Project Manager", name: p.pmName || "", email: p.pmEmail || "", phone: "" });
    if (p.apName || p.apEmail) out.push({ type: "Accounts Payable", name: p.apName || "", email: p.apEmail || "", phone: "" });
    return out;
  }

  const isPM = c => (c.type || "") === "Project Manager";
  // Project Managers always come first; everyone else keeps their saved order.
  const ordered = p => { const cs = contactsOf(p); return cs.filter(isPM).concat(cs.filter(c => !isPM(c))); };
  const keyOf = c => (c.email || "").trim().toLowerCase() || (c.name || "").trim().toLowerCase();
  const sameCustomer = (p, cust) => (p.customer || "").trim().toLowerCase() === (cust || "").trim().toLowerCase();
  const recentFirst = (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
  // Companies are derived from the projects' Customer field; each has a directory of the contacts used on its projects.
  function clientsData() {
    const map = new Map();
    const addContact = (g, c, p) => {
      if (!c.name && !c.email) return;
      const ck = keyOf(c); let e = g.contacts.get(ck);
      if (!e) { e = { name: c.name || "", email: c.email || "", phone: c.phone || "", types: new Set(), projects: [] }; g.contacts.set(ck, e); }
      if (c.type) e.types.add(c.type);
      if (!e.phone && c.phone) e.phone = c.phone;
      if (!e.email && c.email) e.email = c.email;
      if (!e.name && c.name) e.name = c.name;
      if (p && !e.projects.includes(p)) e.projects.push(p);
    };
    clients.forEach(r => {
      const k = (r.name || "").trim().toLowerCase(); if (!k) return;
      const g = { key: k, name: r.name.trim(), record: r, t: "", projects: [], contacts: new Map() };
      map.set(k, g);
      r.contacts.forEach(c => addContact(g, c, null));
    });
    projects.forEach(p => {
      const k = (p.customer || "").trim().toLowerCase(); if (!k) return;
      let g = map.get(k);
      if (!g) { g = { key: k, name: p.customer.trim(), record: null, t: "", projects: [], contacts: new Map() }; map.set(k, g); }
      g.projects.push(p);
      if (!g.record && String(p.updatedAt || "") >= g.t) { g.t = String(p.updatedAt || ""); g.name = p.customer.trim(); }
      contactsOf(p).forEach(c => addContact(g, c, p));
    });
    return [...map.values()].sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: "base" }));
  }

  // The contact(s) that are added automatically to a new or imported project for this company, as Accounts Payable.
  // Order of preference: the contact designated "Invoicing" on the client > the client's own Accounts Payable contacts >
  // the Accounts Payable contact(s) on the client's most recent project that has one.
  function invoicingContactsFor(cust) {
    const k = (cust || "").trim().toLowerCase(); if (!k) return [];
    const asAP = c => ({ type: "Accounts Payable", name: c.name || "", email: c.email || "", phone: c.phone || "" });
    const rec = clients.find(r => (r.name || "").trim().toLowerCase() === k);
    if (rec) {
      const flagged = rec.contacts.filter(c => c.invoicing);
      if (flagged.length) return flagged.slice(0, 1).map(asAP);
      const ap = rec.contacts.filter(c => c.type === "Accounts Payable");
      if (ap.length) return ap.map(asAP);
    }
    const prev = projects.filter(p => sameCustomer(p, cust) && contactsOf(p).some(c => c.type === "Accounts Payable")).sort(recentFirst)[0];
    return prev ? contactsOf(prev).filter(c => c.type === "Accounts Payable").map(asAP) : [];
  }

  // Type-ahead: existing contacts matching what is being typed, this customer's first, then other companies.
  function suggestionsFor(q, current, ctx) {
    const cust = ctx.cust();
    const used = new Set(ctx.list.filter(x => x !== current).map(keyOf));
    const seen = new Map();
    const consider = (x, company) => {
      if (!x.name || !(x.name + " " + x.email).toLowerCase().includes(q)) return;
      const k = keyOf(x); if (used.has(k)) return;
      const ck = k + "@" + (company || "").trim().toLowerCase();
      if (!seen.has(ck)) seen.set(ck, Object.assign({}, x, { customer: (company || "").trim() }));
    };
    projects.slice().sort(recentFirst).forEach(p => contactsOf(p).forEach(x => consider(x, p.customer)));
    clients.forEach(r => r.contacts.forEach(x => consider(x, r.name)));
    const rank = s => (sameCustomer({ customer: s.customer }, cust) ? 0 : 10) + (s.name.toLowerCase().startsWith(q) ? 0 : 1);
    return [...seen.values()].sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name)).slice(0, 8);
  }

  function setMode(m) {
    mode = m;
    $("listView").hidden = m !== "list";
    $("clientsView").hidden = m !== "clients";
    $("clientView").hidden = m !== "client";
    $("clientEdit").hidden = m !== "clientedit";
    $("importView").hidden = m !== "import";
    $("detail").hidden = m !== "view";
    $("form").hidden = m !== "edit";
    $("tabs").hidden = !(m === "list" || m === "clients" || m === "client");
    document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", String((m === "list") === (b.dataset.tab === "projects"))));
    window.scrollTo(0, 0);
  }

  function copyButton(email) {
    const b = el("button", "copy", "Copy");
    b.type = "button"; b.dataset.email = email; b.setAttribute("aria-label", "Copy " + email);
    return b;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".copy"); if (!b) return;
    e.stopPropagation();
    const done = () => { b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy"; }, 1500); };
    const fallback = () => { const r = document.createRange(); r.selectNodeContents(b.previousElementSibling); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = "Selected"; setTimeout(() => { b.textContent = "Copy"; }, 1500); };
    try { navigator.clipboard.writeText(b.dataset.email).then(done, fallback); } catch (err) { fallback(); }
  }, true);

  // ---------- List ----------
  function render() {
    $("n-all").textContent = loaded ? projects.length : "–";
    $("n-ct").textContent = loaded ? projects.filter(p => p.location === "CT").length : "–";
    $("n-wc").textContent = loaded ? projects.filter(p => p.location === "WC").length : "–";

    document.querySelectorAll("#locSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.loc === view.loc)));
    $("statusFilter").value = view.status;
    if ($("q").value !== view.q) $("q").value = view.q;
    document.querySelectorAll("#listView th").forEach(th => {
      const on = th.dataset.k === view.sortK;
      th.setAttribute("aria-sort", on ? (view.sortDir > 0 ? "ascending" : "descending") : "none");
      th.querySelector(".arrow").textContent = on ? (view.sortDir > 0 ? "↑" : "↓") : "↕";
    });

    const q = view.q.trim().toLowerCase();
    const hay = p => [p.job, p.estimateNo, p.bidNo, p.name, p.customer, p.town, p.notes].concat(contactsOf(p).map(c => [c.name, c.email, c.phone, c.type].join(" "))).join(" ").toLowerCase();
    const sortVal = (p, k) => k === "location" ? LOC[p.location] : k === "contacts" ? ((contactsOf(p)[0] || {}).name || "") : (p[k] || "");
    const list = projects.filter(p =>
      (view.loc === "all" || p.location === view.loc) &&
      (!view.status || p.status === view.status) &&
      (!q || hay(p).includes(q))
    ).sort((a, b) => String(sortVal(a, view.sortK)).localeCompare(String(sortVal(b, view.sortK)), undefined, { numeric: true, sensitivity: "base" }) * view.sortDir);

    const tb = $("rows");
    tb.textContent = "";
    for (const p of list) {
      const tr = document.createElement("tr");
      tr.tabIndex = 0; tr.dataset.id = p.id;
      const cell = (cls) => { const td = document.createElement("td"); td.className = cls; tr.appendChild(td); return td; };
      const j = cell("c-job"); j.appendChild(el("span", "job", p.job || "—"));
      const n = cell("c-name"); n.appendChild(el("span", "pname", p.name || "Untitled"));
      if (p.town) n.appendChild(el("span", "note", p.town));
      const nums = [p.estimateNo && "Est. " + p.estimateNo, p.bidNo && "Bid " + p.bidNo].filter(Boolean).join(" · ");
      if (nums) n.appendChild(el("span", "note", nums));
      cell("c-cust").textContent = p.customer || "—";
      const cc = cell("c-contacts"); const cs = ordered(p);
      const lines = cs.some(isPM) ? cs.slice() : [null].concat(cs);   // null = "no Project Manager" notice
      const box = el("span", "clines");
      lines.slice(0, 2).forEach(c => {
        const d = el("div");
        if (!c) d.appendChild(el("span", "nopm", "Project Manager: none on this project"));
        else { d.appendChild(document.createTextNode(c.name || c.email || "—")); if (c.type) d.appendChild(el("small", "", " · " + c.type)); }
        box.appendChild(d);
      });
      if (lines.length > 2) box.appendChild(el("small", "", "+" + (lines.length - 2) + " more"));
      cc.appendChild(box);
      const l = cell("c-loc"); l.appendChild(el("span", "chip " + (p.location === "WC" ? "wc" : "ct"), LOC[p.location] || "—"));
      const s = cell("c-status"); const ss = el("span", "status " + (p.status || ""), p.status || "—"); ss.dataset.s = p.status || ""; s.appendChild(ss);
      tb.appendChild(tr);
    }

    const empty = $("empty");
    if (!loaded) { empty.hidden = false; }
    else if (!projects.length) { empty.hidden = false; empty.innerHTML = "<strong>No projects yet</strong>Use “+ Add project” to enter your first job."; }
    else if (!list.length) { empty.hidden = false; empty.innerHTML = "<strong>No matches</strong>Try another location, status or search."; }
    else empty.hidden = true;

    const dl = $("custList"); dl.textContent = "";
    clientsData().map(g => g.name).forEach(v => { const o = document.createElement("option"); o.value = v; dl.appendChild(o); });

    if (mode === "view") renderDetail();
    else if (mode === "clients") renderClients();
    else if (mode === "client") renderClient();
  }

  $("locSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; view.loc = b.dataset.loc; saveView(); render(); });
  $("statusFilter").addEventListener("change", e => { view.status = e.target.value; saveView(); render(); });
  $("q").addEventListener("input", e => { view.q = e.target.value; render(); });
  document.querySelectorAll("#listView th button").forEach(b => b.addEventListener("click", () => {
    const k = b.parentElement.dataset.k;
    if (view.sortK === k) view.sortDir *= -1; else { view.sortK = k; view.sortDir = 1; }
    saveView(); render();
  }));
  $("rows").addEventListener("click", e => { const tr = e.target.closest("tr"); if (tr) openView(tr.dataset.id); });
  $("rows").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr"); if (tr) openView(tr.dataset.id); } });
  $("addBtn").addEventListener("click", () => openForm(null));

  // ---------- Read-only detail page ----------
  // `from` = where Back should return: null (project list) or { client: key } (that company's directory).
  function openView(id, from) { if (from !== undefined) returnTo = from; viewingId = id; setMode("view"); renderDetail(); }
  function showList() { viewingId = null; editingId = null; returnTo = null; setMode("list"); render(); }
  function showClients() { clientKey = null; returnTo = null; editingId = null; setMode("clients"); renderClients(); }
  function openClient(key) { clientKey = key; clientQ = ""; editingId = null; setMode("client"); renderClient(); }
  function goBack() { if (returnTo && returnTo.client) openClient(returnTo.client); else showList(); }
  document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => { if (b.dataset.tab === "clients") showClients(); else showList(); }));

  function renderDetail() {
    const box = $("detail");
    const p = projects.find(x => x.id === viewingId);
    if (!p) { showList(); return; }
    box.textContent = "";

    const top = el("div", "detail-top");
    const backName = returnTo && returnTo.client ? ((clientsData().find(g => g.key === returnTo.client) || {}).name || "client") : "All projects";
    const back = el("button", "btn", "← " + backName); back.type = "button"; back.addEventListener("click", goBack);
    const edit = el("button", "btn primary", "Edit project"); edit.type = "button"; edit.addEventListener("click", () => openForm(p));
    top.append(back, edit);
    box.appendChild(top);

    const head = el("div", "detail-head");
    head.appendChild(el("div", "job", p.job || ""));
    head.appendChild(el("h2", "", p.name || "Untitled"));
    const meta = el("div", "meta");
    meta.appendChild(el("span", "chip " + (p.location === "WC" ? "wc" : "ct"), LOC[p.location] || "—"));
    const st = el("span", "status " + (p.status || ""), p.status || "—"); st.dataset.s = p.status || ""; meta.appendChild(st);
    head.appendChild(meta);
    box.appendChild(head);

    const kv = el("dl", "kv");
    const add = (k, v) => { const d = el("div"); d.appendChild(el("dt", "", k)); d.appendChild(el("dd", "", v || "—")); kv.appendChild(d); };
    add("Customer", p.customer); add("Estimate #", p.estimateNo); add("Bid #", p.bidNo); add("Town / site", p.town); add("Notes", p.notes);
    box.appendChild(kv);

    const cs = ordered(p);
    box.appendChild(el("div", "sec-title", "Contacts (" + cs.length + ")"));
    const ul = el("ul", "clist");
    if (!cs.some(isPM)) {
      const li = document.createElement("li");
      li.appendChild(el("strong", "", "Project Manager"));
      li.appendChild(el("span", "chip type", "Project Manager"));
      const w = el("span", "nopm", "No Project Manager on this project. Use Edit project to add one.");
      w.style.gridColumn = "span 2";
      li.appendChild(w);
      ul.appendChild(li);
    }
    cs.forEach(c => {
      const li = document.createElement("li");
      li.appendChild(el("strong", "", c.name || "—"));
      li.appendChild(el("span", "chip type", c.type || "Contact"));
      const m = el("span", "cmail");
      if (c.email) {
        const link = el("a", "", c.email); link.href = "mailto:" + c.email; link.style.overflowWrap = "anywhere";
        m.append(link, copyButton(c.email));
      } else m.textContent = "—";
      li.appendChild(m);
      li.appendChild(el("span", "", c.phone || "—"));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (p.updatedAt) box.appendChild(el("p", "fine", "Last updated " + new Date(p.updatedAt).toLocaleString()));
  }

  // ---------- Clients tab ----------
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");

  function renderClients() {
    const q = $("cq").value.trim().toLowerCase();
    const tb = $("clientRows"); tb.textContent = "";
    const all = clientsData();
    let shown = 0;
    all.forEach(g => {
      const contacts = [...g.contacts.values()];
      const nameHit = g.name.toLowerCase().includes(q);
      const hits = q ? contacts.filter(x => (x.name + " " + x.email + " " + x.phone).toLowerCase().includes(q)) : [];
      if (q && !nameHit && !hits.length) return;
      shown++;
      const tr = document.createElement("tr"); tr.tabIndex = 0; tr.dataset.key = g.key;
      const cell = cls => { const td = document.createElement("td"); td.className = cls; tr.appendChild(td); return td; };
      const c1 = cell("c-cname"); c1.appendChild(el("span", "pname", g.name));
      if (q && hits.length) c1.appendChild(el("span", "note", "Contact: " + hits.slice(0, 3).map(x => x.name || x.email).join(", ") + (hits.length > 3 ? " +" + (hits.length - 3) : "")));
      cell("c-n").textContent = plural(g.projects.length, "project");
      cell("c-n").textContent = plural(contacts.length, "contact");
      tb.appendChild(tr);
    });
    const empty = $("clientEmpty");
    empty.hidden = shown > 0;
    if (!loaded) empty.innerHTML = "<strong>Loading clients…</strong>";
    else if (!all.length) empty.innerHTML = "<strong>No clients yet</strong>Clients appear here once you add a project with a customer.";
    else if (!shown) empty.innerHTML = "<strong>No matches</strong>Try a company name, or a contact's name or email.";
  }
  $("cq").addEventListener("input", renderClients);
  $("clientRows").addEventListener("click", e => { const tr = e.target.closest("tr"); if (tr) openClient(tr.dataset.key); });
  $("clientRows").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr"); if (tr) openClient(tr.dataset.key); } });

  $("addClientBtn").addEventListener("click", () => { $("addClientForm").hidden = false; $("clientErr").hidden = true; $("newClient").value = ""; $("newClient").focus(); });
  $("cancelClientBtn").addEventListener("click", () => { $("addClientForm").hidden = true; });
  $("addClientForm").addEventListener("submit", async e => {
    e.preventDefault();
    const name = $("newClient").value.trim().replace(/\s+/g, " ");
    const err = m => { $("clientErr").textContent = m; $("clientErr").hidden = false; };
    if (!name) { err("Enter the company name."); return; }
    const key = name.toLowerCase();
    if (clientsData().some(g => g.key === key)) { err("That client already exists."); return; }
    $("saveClientBtn").disabled = true;
    try {
      const r = await sb.from("register_clients").insert({ name }); if (r.error) throw r.error;
      await load(); $("addClientForm").hidden = true; openClient(key);
    } catch (ex) { err(ex && ex.code === "23505" ? "That client already exists." : "Couldn't add the client. Make sure the latest supabase.sql has been run, then try again."); }
    finally { $("saveClientBtn").disabled = false; }
  });

  async function setInvoicing(g, x, unset, msg) {
    const list = (g.record ? g.record.contacts : []).map(c => Object.assign({}, c));
    const k = keyOf(x);
    let hit = list.find(c => keyOf(c) === k);
    list.forEach(c => { delete c.invoicing; });
    if (!unset) {
      if (!hit) { hit = { name: x.name, email: x.email, phone: x.phone }; list.push(hit); }   // a contact that so far only lives on a project
      hit.invoicing = true;
    }
    msg.hidden = true;
    try {
      const r = g.record
        ? await sb.from("register_clients").update({ data: Object.assign({}, g.record.data, { contacts: list }) }).eq("id", g.record.id)
        : await sb.from("register_clients").insert({ name: g.name, data: { contacts: list } });
      if (r.error) throw r.error;
      await load();
    } catch (ex) { msg.textContent = "Couldn't save the invoicing contact. Check your connection and try again."; msg.hidden = false; }
  }

  function renderClient() {
    const g = clientsData().find(x => x.key === clientKey);
    if (!g) { showClients(); return; }
    const box = $("clientView"); box.textContent = "";
    const contacts = [...g.contacts.values()];

    const top = el("div", "detail-top");
    const back = el("button", "btn", "← All clients"); back.type = "button"; back.addEventListener("click", showClients);
    const add = el("button", "btn primary", "+ Add project for " + g.name); add.type = "button";
    add.addEventListener("click", () => openForm(null, { customer: g.name, from: { client: g.key } }));
    const ed = el("button", "btn", "Edit client"); ed.type = "button"; ed.addEventListener("click", () => openClientEdit(g));
    const right = el("span", "btnrow"); right.append(ed, add);
    top.append(back, right); box.appendChild(top);

    const head = el("div", "detail-head");
    head.appendChild(el("h2", "", g.name));
    const meta = el("div", "meta");
    meta.appendChild(el("span", "chip type", plural(g.projects.length, "project")));
    meta.appendChild(el("span", "chip type", plural(contacts.length, "contact")));
    head.appendChild(meta); box.appendChild(head);

    const msg = el("p", "err"); msg.hidden = true;
    box.appendChild(el("div", "sec-title", "Contact directory"));
    box.appendChild(el("p", "notice", "The invoicing contact is added automatically (as Accounts Payable) to every new or imported project for this client.")).style.margin = "0 0 10px";
    box.appendChild(msg);
    const search = el("input", "search"); search.type = "search"; search.placeholder = "Search " + g.name + "’s contacts…";
    search.setAttribute("aria-label", "Search this client's contacts"); search.value = clientQ; search.style.width = "100%"; search.style.marginBottom = "10px";
    box.appendChild(search);
    const host = el("div"); box.appendChild(host);

    const fill = () => {
      host.textContent = "";
      const q = clientQ.trim().toLowerCase();
      const list = contacts.filter(x => !q || (x.name + " " + x.email + " " + x.phone + " " + [...x.types].join(" ")).toLowerCase().includes(q))
        .sort((x, y) => (y.types.has("Project Manager") ? 1 : 0) - (x.types.has("Project Manager") ? 1 : 0) || x.name.localeCompare(y.name, undefined, { sensitivity: "base" }));
      if (!list.length) { host.appendChild(el("p", "notice", q ? "No contacts match." : "No contacts saved for this client yet.")); return; }
      const ul = el("ul", "clist");
      list.forEach(x => {
        const li = document.createElement("li");
        const n = el("span"); n.appendChild(el("strong", "", x.name || x.email));
        if (x.projects.length) n.appendChild(el("small", "block", "On " + x.projects.map(p => p.job).join(", ")));
        li.appendChild(n);
        const roles = el("span", "roles"); [...x.types].forEach(t => roles.appendChild(el("span", "chip type", t)));
        if (!x.types.size) roles.appendChild(el("small", "", "No role yet")); li.appendChild(roles);
        const m = el("span", "cmail");
        if (x.email) { const link = el("a", "", x.email); link.href = "mailto:" + x.email; link.style.overflowWrap = "anywhere"; m.append(link, copyButton(x.email)); } else m.textContent = "—";
        li.appendChild(m);
        li.appendChild(el("span", "", x.phone || "—"));
        const isInv = !!(g.record && g.record.contacts.some(c => c.invoicing && keyOf(c) === keyOf(x)));
        const ib = el("button", isInv ? "btn small on" : "btn small", isInv ? "★ Invoicing contact" : "Set as invoicing"); ib.type = "button";
        ib.title = isInv ? "Click to clear" : "Automatically add this contact to new and imported projects for " + g.name;
        ib.addEventListener("click", () => setInvoicing(g, x, isInv, msg));
        li.appendChild(ib);
        ul.appendChild(li);
      });
      host.appendChild(ul);
    };
    fill();
    search.addEventListener("input", () => { clientQ = search.value; fill(); });

    box.appendChild(el("div", "sec-title", "Projects"));
    const pl = el("ul", "clist plist");
    g.projects.slice().sort((x, y) => String(x.job).localeCompare(String(y.job), undefined, { numeric: true })).forEach(p => {
      const li = document.createElement("li"); li.tabIndex = 0; li.setAttribute("role", "button");
      li.appendChild(el("span", "job", p.job || "—"));
      li.appendChild(el("strong", "", p.name || "Untitled"));
      li.appendChild(el("span", "chip " + (p.location === "WC" ? "wc" : "ct"), LOC[p.location] || "—"));
      const st = el("span", "status " + (p.status || ""), p.status || "—"); st.dataset.s = p.status || ""; li.appendChild(st);
      const open = () => openView(p.id, { client: g.key });
      li.addEventListener("click", open); li.addEventListener("keydown", e => { if (e.key === "Enter") open(); });
      pl.appendChild(li);
    });
    if (!g.projects.length) box.appendChild(el("p", "notice", "No projects for this client yet."));
    else box.appendChild(pl);
  }

  // ---------- Import projects from a CSV ----------
  const FIELD_ALIASES = {
    job: ["job", "jobnumber", "jobno", "jobnum", "jobid"],
    name: ["project", "projectname", "name", "jobname", "description"],
    customer: ["customer", "customername", "client", "clientname", "company", "contractor", "gc"],
    location: ["location", "region", "state", "division", "office"],
    status: ["status", "jobstatus"],
    estimateNo: ["estimate", "estimatenumber", "estimateno", "estimatenum", "est", "estno"],
    bidNo: ["bid", "bidnumber", "bidno", "bidnum"],
    town: ["town", "site", "townsite", "city", "jobsite", "address", "sitelocation"],
    notes: ["notes", "note", "comments", "comment"]
  };
  const STATUSES = ["Active", "Bidding", "On hold", "Complete"];

  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, "");
    const first = text.split(/\r?\n/, 1)[0];
    const delim = [",", ";", "\t"].map(d => [d, first.split(d).length]).sort((x, y) => y[1] - x[1])[0][0];
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; }
      else cur += ch;
    }
    if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ""));
  }

  let importItems = [];
  function showImport() { importItems = []; $("impFile").value = ""; $("impOut").textContent = ""; setMode("import"); }
  $("importBtn").addEventListener("click", showImport);
  $("impBack").addEventListener("click", showList);

  $("impFile").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    const out = $("impOut"); out.textContent = "";
    const rows = parseCSV(await f.text());
    if (rows.length < 2) { out.appendChild(el("p", "err", "That file has no data rows. The first row must be column headers.")); return; }
    const norm = h => h.toLowerCase().replace(/[^a-z0-9]/g, "");
    const idx = {};
    rows[0].forEach((h, i) => { const n = norm(h); for (const f2 in FIELD_ALIASES) if (!(f2 in idx) && FIELD_ALIASES[f2].includes(n)) { idx[f2] = i; break; } });
    const missing = ["job", "name", "customer"].filter(k => !(k in idx));
    if (missing.length) {
      out.appendChild(el("p", "err", "Couldn't find a column for: " + missing.map(k => ({ job: "Job #", name: "Project", customer: "Customer" })[k]).join(", ") + ". Found columns: " + rows[0].join(", ")));
      return;
    }
    const get = (r, k) => (k in idx ? (r[idx[k]] || "") : "").trim().replace(/\s+/g, " ");
    const byKey = new Map(clientsData().map(g => [g.key, g]));
    const seenJobs = new Set(projects.map(p => (p.job || "").toLowerCase()));
    importItems = rows.slice(1).map((r, n) => {
      const d = { job: get(r, "job"), name: get(r, "name"), customer: get(r, "customer"), town: get(r, "town"), notes: get(r, "notes"), estimateNo: get(r, "estimateNo"), bidNo: get(r, "bidNo") };
      const loc = get(r, "location"); d.location = /ny|hudson|hv|wc|westchester/i.test(loc) ? "WC" : "CT";
      d.status = STATUSES.find(x => x.toLowerCase() === get(r, "status").toLowerCase()) || "Active";
      const item = { line: n + 2, data: d, ok: true, reason: "", inv: [], isNew: false };
      if (!d.job || !d.name || !d.customer) { item.ok = false; item.reason = "Missing " + [!d.job && "job #", !d.name && "project", !d.customer && "customer"].filter(Boolean).join(", "); return item; }
      if (seenJobs.has(d.job.toLowerCase())) { item.ok = false; item.reason = "Job # " + d.job + " already exists"; return item; }
      seenJobs.add(d.job.toLowerCase());
      const g = byKey.get(d.customer.toLowerCase());
      if (g) d.customer = g.name; else item.isNew = true;     // use the client's own spelling
      item.inv = g ? invoicingContactsFor(g.name) : [];
      return item;
    });
    renderImportPreview();
  });

  function renderImportPreview() {
    const out = $("impOut"); out.textContent = "";
    const ready = importItems.filter(i => i.ok), skipped = importItems.filter(i => !i.ok);
    const withInv = ready.filter(i => i.inv.length).length, newClients = [...new Set(ready.filter(i => i.isNew).map(i => i.data.customer))];
    const sum = el("div", "imp-sum");
    sum.append(el("span", "chip type", ready.length + " ready to import"), el("span", "chip type", withInv + " with an invoicing contact"));
    if (newClients.length) sum.appendChild(el("span", "chip wc", newClients.length + " new client name" + (newClients.length === 1 ? "" : "s")));
    if (skipped.length) sum.appendChild(el("span", "chip wc", skipped.length + " skipped"));
    out.appendChild(sum);
    if (newClients.length) out.appendChild(el("p", "notice", "Not matched to an existing client (no invoicing contact can be added; check the spelling): " + newClients.slice(0, 12).join("; ") + (newClients.length > 12 ? "…" : "")));

    const tbl = el("table", "imp-table"); const hr = el("tr");
    ["Job #", "Project", "Customer", "Invoicing contact"].forEach(h => hr.appendChild(el("th", "", h)));
    const th = el("thead"); th.appendChild(hr); tbl.appendChild(th);
    const tb = el("tbody");
    importItems.slice(0, 60).forEach(i => {
      const tr = el("tr"); if (!i.ok) tr.className = "skip";
      tr.appendChild(el("td", "", i.data.job || "—")); tr.appendChild(el("td", "", i.data.name || "—")); tr.appendChild(el("td", "", i.data.customer || "—"));
      tr.appendChild(el("td", "", !i.ok ? "Skipped: " + i.reason : i.inv.length ? i.inv[0].name + (i.inv[0].email ? " · " + i.inv[0].email : "") : i.isNew ? "— (new client)" : "— (none set yet)"));
      tb.appendChild(tr);
    });
    tbl.appendChild(tb); out.appendChild(tbl);
    if (importItems.length > 60) out.appendChild(el("p", "notice", "Showing the first 60 of " + importItems.length + " rows."));

    const go = el("button", "btn primary", "Import " + ready.length + " project" + (ready.length === 1 ? "" : "s")); go.type = "button"; go.disabled = !ready.length;
    go.style.marginTop = "14px";
    const err = el("p", "err"); err.hidden = true;
    go.addEventListener("click", async () => {
      go.disabled = true; err.hidden = true;
      const now = new Date().toISOString();
      const recs = ready.map(i => ({ data: Object.assign({}, i.data, { contacts: i.inv, updatedAt: now }) }));
      try {
        for (let k = 0; k < recs.length; k += 200) { const r = await sb.from(T).insert(recs.slice(k, k + 200)); if (r.error) throw r.error; }
        await load(); showList();
      } catch (ex) { err.textContent = "Import failed part-way. Reload to see what was added, then re-upload: projects that already exist are skipped automatically."; err.hidden = false; go.disabled = false; await load().catch(() => {}); }
    });
    out.append(go, err);
  }

  // ---------- Edit client (rename, own contacts, remove) ----------
  function openClientEdit(g) {
    editingClient = { key: g.key, name: g.name, record: g.record, projects: g.projects.slice() };
    $("k-name").value = g.name;
    clientContacts = (g.record ? g.record.contacts : []).map(c => Object.assign(blank(), c));
    clientCtx.render();
    const fromProjects = [...g.contacts.values()].filter(x => x.projects.length).length;
    $("kNote").textContent = g.projects.length
      ? "Renaming also updates the customer on this client's " + g.projects.length + " project" + (g.projects.length === 1 ? "" : "s") + ". Contacts that come from a project (" + fromProjects + ") are edited on that project; the ones below belong to the client."
      : "This client has no projects yet.";
    $("kDelBtn").hidden = !(g.record && !g.projects.length);
    disarmK(); $("kErr").hidden = true;
    setMode("clientedit");
    $("k-name").focus();
  }
  const kErr = m => { $("kErr").textContent = m; $("kErr").hidden = false; };
  $("kCancelBtn").addEventListener("click", () => openClient(editingClient.key));

  $("clientEdit").addEventListener("submit", async e => {
    e.preventDefault();
    const old = editingClient, name = $("k-name").value.trim().replace(/\s+/g, " ");
    if (!name) { kErr("Enter the company name."); return; }
    const newKey = name.toLowerCase();
    if (newKey !== old.key && clientsData().some(g => g.key === newKey)) { kErr("Another client is already named “" + name + "”."); return; }
    const contacts = clientContacts
      .map(c => { const o = { type: (c.type || "").trim(), name: (c.name || "").trim(), email: (c.email || "").trim(), phone: (c.phone || "").trim() }; if (c.invoicing) o.invoicing = true; return o; })
      .filter(c => c.type || c.name || c.email || c.phone);
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i], n = "Contact " + (i + 1);
      if (!c.name) { kErr(n + " needs a name."); return; }
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) { kErr(n + " email doesn't look right."); return; }
    }
    contacts.sort((x, y) => (isPM(y) ? 1 : 0) - (isPM(x) ? 1 : 0));
    $("kSaveBtn").disabled = true;
    try {
      // 1) projects follow the new name (they are linked to a client by its name)
      if (name !== old.name) {
        const now = new Date().toISOString();
        for (const p of old.projects) {
          const { id, ...d } = p; d.customer = name; d.updatedAt = now;
          const r = await sb.from(T).update({ data: d, updated_at: now }).eq("id", id); if (r.error) throw r.error;
        }
      }
      // 2) the client record itself (created now if this client only existed through its projects)
      if (old.record) {
        const r = await sb.from("register_clients").update({ name, data: Object.assign({}, old.record.data, { contacts }) }).eq("id", old.record.id); if (r.error) throw r.error;
      } else {
        const r = await sb.from("register_clients").insert({ name, data: { contacts } }); if (r.error) throw r.error;
      }
      await load(); openClient(newKey);
    } catch (ex) {
      await load().catch(() => {});
      kErr(ex && ex.code === "23505" ? "Another client already has that name." : "Couldn't save. Make sure the latest supabase.sql has been run, check your connection and try again.");
    } finally { $("kSaveBtn").disabled = false; }
  });

  let kArm = null;
  function disarmK() { const b = $("kDelBtn"); b.classList.remove("armed"); b.textContent = "Delete client"; clearTimeout(kArm); }
  $("kDelBtn").addEventListener("click", async () => {
    const b = $("kDelBtn");
    if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Confirm delete"; kArm = setTimeout(disarmK, 4000); return; }
    disarmK();
    try { const r = await sb.from("register_clients").delete().eq("id", editingClient.record.id); if (r.error) throw r.error; await load(); showClients(); }
    catch (ex) { kErr("Couldn't delete this client. Try again."); }
  });

  // ---------- Edit / add form ----------
  const F = { job: "f-job", name: "f-name", customer: "f-cust", location: "f-loc", town: "f-town", status: "f-status", notes: "f-notes", estimateNo: "f-est", bidNo: "f-bid" };

  // Contact-row editor shared by the project form (ids c0-…) and the client form (ids k0-…).
  const projCtx = { wrap: null, get list() { return formContacts; }, pre: "c", min1: true, cust: () => $("f-cust").value, render: () => renderEditor(projCtx) };
  const clientCtx = { wrap: null, get list() { return clientContacts; }, pre: "k", min1: false, invoicing: true, cust: () => $("k-name").value, render: () => renderEditor(clientCtx) };
  const renderContactRows = () => renderEditor(projCtx);

  function attachSuggest(inp, c, ctx) {
    const host = inp.parentElement; host.style.position = "relative";
    inp.setAttribute("aria-autocomplete", "list");
    let box = null, items = [], idx = -1;
    const close = () => { if (box) { box.remove(); box = null; } items = []; idx = -1; };
    const mark = () => Array.from(box.children).forEach((b, k) => b.classList.toggle("on", k === idx));
    const choose = s => {
      const i = ctx.list.indexOf(c);
      c.name = s.name; c.email = s.email || ""; c.phone = s.phone || ""; if (!c.type && s.type) c.type = s.type;
      close(); ctx.render();
      const next = $(ctx.pre + i + "-phone"); if (next) next.focus();
    };
    const refresh = () => {
      close();
      const q = inp.value.trim().toLowerCase(); if (!q) return;
      items = suggestionsFor(q, c, ctx); if (!items.length) return;
      box = el("div", "sugg"); box.setAttribute("role", "listbox");
      box.addEventListener("mousedown", e => e.preventDefault());
      items.forEach(s => {
        const b = el("button", "sopt"); b.type = "button"; b.setAttribute("role", "option");
        b.appendChild(el("strong", "", s.name));
        const meta = [s.type, s.email, sameCustomer({ customer: s.customer }, ctx.cust()) ? "" : s.customer].filter(Boolean).join(" · ");
        if (meta) b.appendChild(el("small", "", meta));
        b.addEventListener("click", () => choose(s));
        box.appendChild(b);
      });
      host.appendChild(box);
    };
    inp.addEventListener("input", refresh);
    inp.addEventListener("focus", () => { if (inp.value.trim()) refresh(); });
    inp.addEventListener("blur", close);
    inp.addEventListener("keydown", e => {
      if (!box) return;
      if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); mark(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(idx - 1, 0); mark(); }
      else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); choose(items[idx]); }
      else if (e.key === "Escape") { e.stopPropagation(); close(); }
    });
  }

  function renderEditor(ctx) {
    const wrap = ctx.wrap || (ctx.wrap = $(ctx === projCtx ? "contactRows" : "kContactRows"));
    wrap.textContent = "";
    if (!ctx.list.length) wrap.appendChild(el("p", "notice", "No contacts yet."));
    ctx.list.forEach((c, i) => {
      const row = el("div", "crow"), P = ctx.pre + i;
      const field = (label, input) => { const f = el("div", "field"); const l = el("label", "", label); l.htmlFor = input.id; f.append(l, input); return f; };
      const mk = (key, id, type, ph, auto) => { const inp = el("input"); inp.id = id; inp.type = type; inp.value = c[key] || ""; if (ph) inp.placeholder = ph; inp.autocomplete = auto || "off"; inp.addEventListener("input", () => { c[key] = inp.value; }); return inp; };
      const sel = el("select"); sel.id = P + "-type";
      const o0 = el("option", "", "Select type…"); o0.value = ""; sel.appendChild(o0);
      TYPES.forEach(t => { const o = el("option", "", t); o.value = t; sel.appendChild(o); });
      sel.value = c.type || "";
      sel.addEventListener("change", () => { c.type = sel.value; });
      const nameIn = mk("name", P + "-name", "text", "Start typing to search existing contacts");
      const emailIn = mk("email", P + "-email", "email", "name@company.com");
      row.append(
        field("Contact type", sel),
        field("Name", nameIn),
        field("Email", emailIn),
        field("Phone", mk("phone", P + "-phone", "tel", "Optional"))
      );
      attachSuggest(nameIn, c, ctx); attachSuggest(emailIn, c, ctx);
      const rm = el("button", "btn danger rm", "Remove"); rm.type = "button"; rm.disabled = ctx.min1 && ctx.list.length === 1;
      rm.setAttribute("aria-label", "Remove contact " + (i + 1));
      rm.addEventListener("click", () => { ctx.list.splice(i, 1); ctx.render(); });
      row.appendChild(rm);
      if (ctx.invoicing) {
        const lab = el("label", "invrow"); const cb = el("input"); cb.type = "checkbox"; cb.checked = !!c.invoicing; cb.id = P + "-inv";
        lab.append(cb, document.createTextNode(" Invoicing contact: added automatically to this client's new and imported projects"));
        cb.addEventListener("change", () => { ctx.list.forEach(x => { x.invoicing = false; }); c.invoicing = cb.checked; ctx.render(); });
        row.appendChild(lab);
      }
      wrap.appendChild(row);
    });
  }
  $("addContactBtn").addEventListener("click", () => {
    formContacts.push(blank()); renderContactRows();
    const last = formContacts.length - 1; $("c" + last + "-type").focus();
  });
  $("addKContactBtn").addEventListener("click", () => {
    clientContacts.push(blank()); clientCtx.render();
    const last = clientContacts.length - 1; $("k" + last + "-type").focus();
  });

  function openForm(p, opts) {
    opts = opts || {};
    if (!p) returnTo = opts.from || null;
    editingId = p ? p.id : null;
    $("formTitle").textContent = p ? "Edit project" : "New project";
    for (const k in F) $(F[k]).value = p ? (p[k] || "") : (k === "location" ? (view.loc === "WC" ? "WC" : "CT") : k === "status" ? "Active" : "");
    formContacts = p ? contactsOf(p).map(c => Object.assign(blank(), c)) : [];
    if (!formContacts.length) formContacts.push(blank());
    renderContactRows();
    $("delBtn").hidden = !p; disarm();
    $("formErr").hidden = true; $("autofillNote").hidden = true;
    if (!p && opts.customer) { $("f-cust").value = opts.customer; applyAutofill(); }
    setMode("edit");
    $("f-job").focus();
  }
  function closeForm() { if (editingId) openView(editingId); else goBack(); }
  function showErr(msg) { $("formErr").textContent = msg; $("formErr").hidden = false; }

  // New project for a company we already have: fill in ONLY its Accounts Payable (invoicing) contact(s).
  // Everything else stays blank; other saved contacts are found by typing a name in a contact row, or in the Clients tab.
  function applyAutofill() {
    const cust = $("f-cust").value.trim(); if (!cust) return;
    const untouched = formContacts.length === 1 && !formContacts[0].name && !formContacts[0].email && !formContacts[0].phone && !formContacts[0].type;
    let filled = false;
    if (!editingId && untouched) {
      const ap = invoicingContactsFor(cust);
      if (ap.length) { formContacts = ap.map(x => Object.assign(blank(), x)).concat([blank()]); filled = true; }
    }
    if (filled) renderContactRows();   // only rebuild the rows when something was filled in, so a click into a contact field is never lost
    $("autofillNote").hidden = !filled;
  }
  $("f-cust").addEventListener("change", applyAutofill);

  $("cancelBtn").addEventListener("click", closeForm);

  $("form").addEventListener("submit", async e => {
    e.preventDefault();
    const data = {};
    for (const k in F) data[k] = $(F[k]).value.trim();
    if (!data.job || !data.name || !data.customer) { showErr("Job number, project name and customer are required."); return; }

    const contacts = formContacts
      .map(c => ({ type: (c.type || "").trim(), name: (c.name || "").trim(), email: (c.email || "").trim(), phone: (c.phone || "").trim() }))
      .filter(c => c.type || c.name || c.email || c.phone);
    if (!contacts.length) { showErr("Add at least one contact."); return; }
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i], n = "Contact " + (i + 1);
      if (!c.name) { showErr(n + " needs a name."); return; }
      if (!c.type) { showErr(n + ": pick what kind of contact this is."); return; }
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) { showErr(n + " email doesn't look right. Check it and try again."); return; }
    }
    const dup = projects.find(p => (p.job || "").toLowerCase() === data.job.toLowerCase() && p.id !== editingId);
    if (dup) { showErr("Job " + data.job + " is already used by “" + dup.name + "”."); return; }
    if (!col) { showErr("Saving isn't available right now. Reload the page and try again."); return; }

    contacts.sort((x, y) => (isPM(y) ? 1 : 0) - (isPM(x) ? 1 : 0));
    data.contacts = contacts;
    data.updatedAt = new Date().toISOString();
    $("saveBtn").disabled = true;
    try {
      let id = editingId;
      if (editingId) await col.doc(editingId).set(data);
      else id = await col.add(data);
      openView(id);
    } catch (err) {
      showErr("Couldn't save. You may not have permission, or check your connection and try again.");
    } finally { $("saveBtn").disabled = false; }
  });

  let armTimer = null;
  function disarm() { const b = $("delBtn"); b.classList.remove("armed"); b.textContent = "Delete"; clearTimeout(armTimer); }
  $("delBtn").addEventListener("click", async () => {
    const b = $("delBtn");
    if (!b.classList.contains("armed")) { b.classList.add("armed"); b.textContent = "Confirm delete"; armTimer = setTimeout(disarm, 4000); return; }
    disarm();
    try { await col.doc(editingId).delete(); showList(); }
    catch (err) { showErr("Couldn't delete this project. Try again."); }
  });

  // ---------- Data (Supabase Auth + table public.project_register: id, data jsonb, updated_at) ----------
  const cfg = window.APP_CONFIG || {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    $("gate").hidden = false;
    $("gateMsg").textContent = "Not configured: fill in config.js.";
    $("signInBtn").disabled = true;
    return;
  }
  const sb = supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { storageKey: "project-register-auth" } });
  const T = "project_register";
  col = {
    add: async (data) => { const r = await sb.from(T).insert({ data }).select("id").single(); if (r.error) throw r.error; await load(); return r.data.id; },
    doc: (id) => ({
      set: async (data) => { const r = await sb.from(T).update({ data, updated_at: new Date().toISOString() }).eq("id", id); if (r.error) throw r.error; await load(); },
      delete: async () => { const r = await sb.from(T).delete().eq("id", id); if (r.error) throw r.error; await load(); },
    }),
  };
  let channel = null;
  async function load() {
    const [r, cr] = await Promise.all([sb.from(T).select("id,data"), sb.from("register_clients").select("id,name,data")]);
    clients = cr.error ? [] : cr.data.map(x => ({ id: x.id, name: x.name, data: x.data || {}, contacts: Array.isArray((x.data || {}).contacts) ? x.data.contacts : [] }));
    if (r.error) {
      loaded = true;
      $("empty").innerHTML = "<strong>Can't load projects</strong>Your login may not have access to the register. Ask an admin.";
      render(); return;
    }
    projects = r.data.map(row => Object.assign({ id: row.id }, row.data));
    loaded = true; render();
  }
  function showGate(msg) {
    if (channel) { sb.removeChannel(channel); channel = null; }
    projects = []; clients = []; loaded = false;
    $("app").hidden = true; $("gate").hidden = false;
    if (msg) $("gateMsg").textContent = msg;
  }
  async function enter() {
    $("gate").hidden = true; $("app").hidden = false;
    showList();
    await load();
    if (!channel) channel = sb.channel("pr").on("postgres_changes", { event: "*", schema: "public", table: T }, load).on("postgres_changes", { event: "*", schema: "public", table: "register_clients" }, load).subscribe();
  }
  $("gate").addEventListener("submit", async e => {
    e.preventDefault();
    $("signInBtn").disabled = true;
    const r = await sb.auth.signInWithPassword({ email: $("g-email").value.trim(), password: $("g-pass").value });
    $("signInBtn").disabled = false;
    if (r.error) { $("gateMsg").textContent = "Sign-in failed. Check your email and password."; return; }
    $("g-pass").value = "";
    enter();
  });
  $("pwToggle").addEventListener("click", () => {
    const inp = $("g-pass"), show = inp.type === "password";
    inp.type = show ? "text" : "password";
    $("pwToggle").textContent = show ? "Hide" : "Show";
    $("pwToggle").setAttribute("aria-pressed", String(show));
    inp.focus();
  });
  $("signOutBtn").addEventListener("click", async () => { await sb.auth.signOut(); showGate("Signed out."); });
  const sess = await sb.auth.getSession();
  if (sess.data.session) enter(); else showGate();
})();
