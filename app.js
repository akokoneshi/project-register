(async function () {
  const LOC = { CT: "Connecticut", WC: "Hudson Valley, NY" };
  const TYPES = ["Project Manager", "Accounts Payable", "Superintendent", "Estimator", "Purchasing", "Owner / Other"];
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const blank = () => ({ type: "", name: "", email: "", phone: "" });

  let projects = [], loaded = false, col = null, mode = "list";
  let editingId = null, viewingId = null, formContacts = [];
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

  function setMode(m) {
    mode = m;
    $("listView").hidden = m !== "list";
    $("detail").hidden = m !== "view";
    $("form").hidden = m !== "edit";
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
    document.querySelectorAll("th").forEach(th => {
      const on = th.dataset.k === view.sortK;
      th.setAttribute("aria-sort", on ? (view.sortDir > 0 ? "ascending" : "descending") : "none");
      th.querySelector(".arrow").textContent = on ? (view.sortDir > 0 ? "↑" : "↓") : "↕";
    });

    const q = view.q.trim().toLowerCase();
    const hay = p => [p.job, p.name, p.customer, p.town, p.notes].concat(contactsOf(p).map(c => [c.name, c.email, c.phone, c.type].join(" "))).join(" ").toLowerCase();
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
      cell("c-cust").textContent = p.customer || "—";
      const cc = cell("c-contacts"); const cs = contactsOf(p);
      if (!cs.length) cc.textContent = "—";
      else {
        const box = el("span", "clines");
        cs.slice(0, 2).forEach(c => { const d = el("div"); d.appendChild(document.createTextNode(c.name || c.email || "—")); if (c.type) d.appendChild(el("small", "", " · " + c.type)); box.appendChild(d); });
        if (cs.length > 2) box.appendChild(el("small", "", "+" + (cs.length - 2) + " more"));
        cc.appendChild(box);
      }
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
    [...new Set(projects.map(p => p.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b)).forEach(v => { const o = document.createElement("option"); o.value = v; dl.appendChild(o); });

    if (mode === "view") renderDetail();
  }

  $("locSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; view.loc = b.dataset.loc; saveView(); render(); });
  $("statusFilter").addEventListener("change", e => { view.status = e.target.value; saveView(); render(); });
  $("q").addEventListener("input", e => { view.q = e.target.value; render(); });
  document.querySelectorAll("th button").forEach(b => b.addEventListener("click", () => {
    const k = b.parentElement.dataset.k;
    if (view.sortK === k) view.sortDir *= -1; else { view.sortK = k; view.sortDir = 1; }
    saveView(); render();
  }));
  $("rows").addEventListener("click", e => { const tr = e.target.closest("tr"); if (tr) openView(tr.dataset.id); });
  $("rows").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr"); if (tr) openView(tr.dataset.id); } });
  $("addBtn").addEventListener("click", () => openForm(null));

  // ---------- Read-only detail page ----------
  function openView(id) { viewingId = id; setMode("view"); renderDetail(); }
  function showList() { viewingId = null; editingId = null; setMode("list"); render(); }

  function renderDetail() {
    const box = $("detail");
    const p = projects.find(x => x.id === viewingId);
    if (!p) { showList(); return; }
    box.textContent = "";

    const top = el("div", "detail-top");
    const back = el("button", "btn", "← All projects"); back.type = "button"; back.addEventListener("click", showList);
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
    add("Customer", p.customer); add("Town / site", p.town); add("Notes", p.notes);
    box.appendChild(kv);

    const cs = contactsOf(p);
    box.appendChild(el("div", "sec-title", "Contacts (" + cs.length + ")"));
    if (!cs.length) box.appendChild(el("p", "notice", "No contacts yet. Use Edit project to add one.")).style.color = "var(--muted)";
    else {
      const ul = el("ul", "clist");
      cs.forEach(c => {
        const li = document.createElement("li");
        li.appendChild(el("strong", "", c.name || "—"));
        li.appendChild(el("span", "chip type", c.type || "Contact"));
        const m = el("span", "cmail");
        if (c.email) {
          const a = el("a", "", c.email); a.href = "mailto:" + c.email; a.style.overflowWrap = "anywhere";
          m.append(a, copyButton(c.email));
        } else m.textContent = "—";
        li.appendChild(m);
        li.appendChild(el("span", "", c.phone || "—"));
        ul.appendChild(li);
      });
      box.appendChild(ul);
    }
    if (p.updatedAt) box.appendChild(el("p", "fine", "Last updated " + new Date(p.updatedAt).toLocaleString()));
  }

  // ---------- Edit / add form ----------
  const F = { job: "f-job", name: "f-name", customer: "f-cust", location: "f-loc", town: "f-town", status: "f-status", notes: "f-notes" };

  function renderContactRows() {
    const wrap = $("contactRows");
    wrap.textContent = "";
    formContacts.forEach((c, i) => {
      const row = el("div", "crow");
      const field = (label, input) => { const f = el("div", "field"); const l = el("label", "", label); l.htmlFor = input.id; f.append(l, input); return f; };
      const mk = (key, id, type, ph, auto) => { const inp = el("input"); inp.id = id; inp.type = type; inp.value = c[key] || ""; if (ph) inp.placeholder = ph; inp.autocomplete = auto || "off"; inp.addEventListener("input", () => { c[key] = inp.value; }); return inp; };
      const sel = el("select"); sel.id = "c" + i + "-type";
      const o0 = el("option", "", "Select type…"); o0.value = ""; sel.appendChild(o0);
      TYPES.forEach(t => { const o = el("option", "", t); o.value = t; sel.appendChild(o); });
      sel.value = c.type || "";
      sel.addEventListener("change", () => { c.type = sel.value; });
      row.append(
        field("Contact type", sel),
        field("Name", mk("name", "c" + i + "-name", "text", "Full name")),
        field("Email", mk("email", "c" + i + "-email", "email", "name@company.com")),
        field("Phone", mk("phone", "c" + i + "-phone", "tel", "Optional"))
      );
      const rm = el("button", "btn danger rm", "Remove"); rm.type = "button"; rm.disabled = formContacts.length === 1;
      rm.setAttribute("aria-label", "Remove contact " + (i + 1));
      rm.addEventListener("click", () => { formContacts.splice(i, 1); renderContactRows(); });
      row.appendChild(rm);
      wrap.appendChild(row);
    });
  }
  $("addContactBtn").addEventListener("click", () => {
    formContacts.push(blank()); renderContactRows();
    const last = formContacts.length - 1; $("c" + last + "-type").focus();
  });

  function openForm(p) {
    editingId = p ? p.id : null;
    $("formTitle").textContent = p ? "Edit project" : "New project";
    for (const k in F) $(F[k]).value = p ? (p[k] || "") : (k === "location" ? (view.loc === "WC" ? "WC" : "CT") : k === "status" ? "Active" : "");
    formContacts = p ? contactsOf(p).map(c => Object.assign(blank(), c)) : [];
    if (!formContacts.length) formContacts.push(blank());
    renderContactRows();
    $("delBtn").hidden = !p; disarm();
    $("formErr").hidden = true; $("autofillNote").hidden = true;
    setMode("edit");
    $("f-job").focus();
  }
  function closeForm() { if (editingId) openView(editingId); else showList(); }
  function showErr(msg) { $("formErr").textContent = msg; $("formErr").hidden = false; }

  // Re-use contacts from the customer's most recent project when this one's contacts are still empty.
  $("f-cust").addEventListener("change", () => {
    const c = $("f-cust").value.trim().toLowerCase(); if (!c) return;
    if (!(formContacts.length === 1 && !formContacts[0].name && !formContacts[0].email && !formContacts[0].phone && !formContacts[0].type)) return;
    const prev = projects.filter(p => p.id !== editingId && (p.customer || "").toLowerCase() === c && contactsOf(p).length)
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0];
    if (!prev) return;
    formContacts = contactsOf(prev).map(x => Object.assign(blank(), x));
    renderContactRows();
    $("autofillNote").hidden = false;
  });

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
    const r = await sb.from(T).select("id,data");
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
    projects = []; loaded = false;
    $("app").hidden = true; $("gate").hidden = false;
    if (msg) $("gateMsg").textContent = msg;
  }
  async function enter() {
    $("gate").hidden = true; $("app").hidden = false;
    showList();
    await load();
    if (!channel) channel = sb.channel("pr").on("postgres_changes", { event: "*", schema: "public", table: T }, load).subscribe();
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
  $("signOutBtn").addEventListener("click", async () => { await sb.auth.signOut(); showGate("Signed out."); });
  const sess = await sb.auth.getSession();
  if (sess.data.session) enter(); else showGate();
})();
