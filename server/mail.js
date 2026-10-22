/* Outgoing email: the sign-in link for a grown-up, and later the goodbye when a family leaves.
 *
 * One sender, picked by MAIL in the environment:
 *   MAIL=console   prints every message to the log, link included. Dev, tests, and a server whose operator would
 *                  rather hand links out by hand. The default when nothing is set.
 *   MAIL=sendgrid  SendGrid's v3 mail/send with SENDGRID_API_KEY and MAIL_FROM ("Puppy School HQ <puppy@example.nz>").
 *                  The domain in MAIL_FROM must be authenticated in SendGrid or the links land in spam.
 * send() never throws for a delivery problem: it returns false and the caller tells the person to try again.
 */
"use strict";

const FROM_RE = /^(?:\s*"?([^"<]*?)"?\s*<([^>]+)>|\s*([^\s<>]+@[^\s<>]+)\s*)$/;
function parseFrom(s, fallbackName) {
  const m = FROM_RE.exec(String(s || ""));
  if (!m) return null;
  return { email: (m[2] || m[3]).trim(), name: (m[1] || fallbackName || "").trim() };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (x) => { const e = String(x || "").trim().toLowerCase(); return e.length <= 120 && EMAIL_RE.test(e) ? e : ""; };

function makeMailer(env = process.env, opts = {}) {
  const log = opts.log || ((...a) => console.log(new Date().toISOString(), ...a));
  const kind = String(env.MAIL || "console").toLowerCase();
  const from = parseFrom(env.MAIL_FROM, "Puppy School HQ") || { email: "puppy@localhost", name: "Puppy School HQ" };
  if (kind === "console") {
    const outbox = [];
    return { kind, from, outbox, async send(msg) { outbox.push(msg); if (outbox.length > 50) outbox.shift(); log("mail (console) to", msg.to, "subject", JSON.stringify(msg.subject) + "\n" + msg.text); return true; } };
  }
  if (kind === "sendgrid") {
    const key = String(env.SENDGRID_API_KEY || "");
    if (!key) throw new Error("MAIL=sendgrid needs SENDGRID_API_KEY");
    if (!parseFrom(env.MAIL_FROM)) throw new Error("MAIL=sendgrid needs MAIL_FROM, such as \"Puppy School HQ <puppy@example.nz>\"");
    const doFetch = opts.fetch || fetch;
    return { kind, from, async send(msg) {
      const body = { personalizations: [{ to: [{ email: msg.to }] }], from, subject: msg.subject, content: [{ type: "text/plain", value: msg.text }],
        tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } } }; // a rewritten link is a broken sign-in link
      try {
        const r = await doFetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        if (r.status === 202) return true;
        log("mail (sendgrid) failed", r.status, (await r.text()).slice(0, 300));
        return false;
      } catch (e) { log("mail (sendgrid) failed", e.message); return false; }
    } };
  }
  throw new Error("MAIL must be console or sendgrid");
}

module.exports = { makeMailer, cleanEmail, parseFrom };
