// The owner page: a table of families and the buttons the operator has. Everything goes through /api/owner/*, which
// needs the pt_owner cookie set by an owner sign-in link.
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const api = async (method, url, body) => {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await r.json(); } catch (e) {}
    return { ok: r.ok, status: r.status, json };
  };
  let base = location.origin;
  const when = (t) => (t ? new Date(t).toLocaleDateString("en-NZ", { day: "numeric", month: "short" }) : "");
  const dayGap = (t) => Math.max(0, Math.ceil((t - Date.now()) / 864e5));
  function draw(list) {
    if (!list.length) { $("#list").innerHTML = "<p>No families yet.</p>"; return; }
    const rows = list.map((h) => {
      const f = h.flags || {};
      const state = f.wipeAt ? "deleting, gone in " + dayGap(f.wipeAt) + " day(s)" : f.suspended ? "paused" : f.demo ? "demo, gone in " + dayGap(h.created + 864e5) + " day(s)" : h.setUp ? "" : "not set up yet";
      const btns = [
        f.wipeAt ? '<button class="ghost" data-act="undo">Undo delete</button>' : '<button class="danger" data-act="delete">Delete</button>',
        f.wipeAt ? "" : f.suspended ? '<button class="ghost" data-act="resume">Resume</button>' : '<button class="ghost" data-act="pause">Pause</button>',
        '<button class="ghost" data-act="sms">SMS ' + (f.sms ? "off" : "on") + "</button>",
        !h.setUp && h.owner && !f.wipeAt ? '<button class="ghost" data-act="signin">Sign-in link</button>' : ""
      ].join("");
      return "<tr class=\"" + (f.suspended || f.wipeAt ? "off" : "") + "\" data-id=\"" + esc(h.id) + "\"><td><b>" + esc(h.name || "(no name)") + "</b><br><small>" + esc(h.code) + "</small></td><td>" + esc(h.owner || "") + "</td><td>" + h.people + "</td><td>" + when(h.created) + "</td><td>" + when(h.lastActive) + "</td><td>" + (f.sms ? "on" : "off") + "</td><td>" + esc(state) + "</td><td>" + btns + "</td></tr>";
    }).join("");
    $("#list").innerHTML = "<table><thead><tr><th>Family</th><th>Grown-up</th><th>People</th><th>Made</th><th>Last active</th><th>SMS</th><th>State</th><th></th></tr></thead><tbody>" + rows + "</tbody></table>";
  }
  async function load() {
    const r = await api("GET", "/api/owner/households");
    if (r.status === 401) { $("#signedout").style.display = "block"; return; }
    if (!r.ok) { $("#list").textContent = "Could not load the list."; return; }
    base = r.json.base || base;
    $("#page").classList.remove("hidden");
    draw(r.json.households);
  }
  $("#list").addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const id = b.closest("tr").dataset.id, act = b.dataset.act;
    const name = b.closest("tr").querySelector("b").textContent;
    let r;
    if (act === "delete") { if (!confirm("Delete " + name + "'s family? Phones are signed out now; the folder is removed after 7 days unless you undo.")) return; r = await api("DELETE", "/api/owner/households/" + id); }
    else if (act === "undo") r = await api("PUT", "/api/owner/households/" + id, { wipe: false });
    else if (act === "pause") r = await api("PUT", "/api/owner/households/" + id, { suspended: true });
    else if (act === "resume") r = await api("PUT", "/api/owner/households/" + id, { suspended: false });
    else if (act === "sms") r = await api("PUT", "/api/owner/households/" + id, { sms: b.textContent.trim() === "SMS on" });
    else if (act === "signin") { r = await api("PUT", "/api/owner/households/" + id, { signin: true }); if (r.ok && r.json.link) { $("#made").classList.remove("hidden"); $("#made").innerHTML = "<b>Sign-in link for " + esc(name) + "'s grown-up</b> (once, 15 minutes):<code>" + esc(r.json.link) + "</code>"; } }
    if (!r || !r.ok) { alert((r && r.json && r.json.error) || "That did not work"); return; }
    draw(r.json.households);
  });
  $("#make").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { name: f.get("name"), pin: f.get("pin"), adultPin: f.get("adultPin") || "", owner: f.get("owner") || "" };
    $("#makemsg").textContent = "";
    const r = await api("POST", "/api/owner/households", body);
    if (!r.ok) { $("#makemsg").textContent = (r.json && r.json.error) || "That did not work"; return; }
    e.target.reset();
    const L = r.json.links;
    $("#made").classList.remove("hidden");
    $("#made").innerHTML = "<b>" + esc(body.name) + "'s family is ready.</b> Family code <code>" + esc(r.json.code) + "</code>Join link (every phone opens it once, then the family PIN):<code>" + esc(L.join) + "</code>" + (typeof PUPPY_QR !== "undefined" ? PUPPY_QR.svg(L.join, { label: "QR code for the join link" }) : "") + (L.signin ? "Sign-in link for the grown-up (send it to them; once, 15 minutes):<code>" + esc(L.signin) + "</code>" : "");
    draw(r.json.households);
  });
  $("#out").addEventListener("click", async () => { await api("POST", "/api/owner/logout"); location.reload(); });
  load();
})();
