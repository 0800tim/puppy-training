"use strict";
// deploy/logrotate.conf really rotates: a forced run on a copy of the config pointed at a temp folder truncates the live
// file in place (the unit's handle stays valid), keeps the old lines in .1, makes every copy owner-only, and compresses
// from the second rotation. Skipped where logrotate is not installed.
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const bin = ["/usr/sbin/logrotate", "/usr/bin/logrotate"].find((p) => fs.existsSync(p));

test("the slot logs rotate in place, owner-only, four weeks deep", { skip: bin ? false : "logrotate not installed" }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pt-rot-"));
  try {
    const logs = path.join(dir, "logs"); fs.mkdirSync(logs);
    const template = fs.readFileSync(path.join(__dirname, "..", "deploy", "logrotate.conf"), "utf8");
    assert.ok(/copytruncate/.test(template) && /rotate 4/.test(template) && /weekly/.test(template), "in-place, four deep, weekly");
    const conf = path.join(dir, "logrotate.conf");
    fs.writeFileSync(conf, template.split("/home/timt/logs/puppy-training").join(logs));
    const live = path.join(logs, "app.log");
    fs.writeFileSync(live, "login failed 203.0.113.9\nlogin ok\n", { mode: 0o664 });
    fs.writeFileSync(path.join(logs, "demo.log"), "", { mode: 0o664 }); // empty: left alone
    const state = path.join(dir, "state");
    const run = () => execFileSync(bin, ["-f", "-s", state, conf], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    run();
    assert.equal(fs.readFileSync(live, "utf8"), "", "the live file is truncated, not replaced");
    assert.equal(fs.readFileSync(live + ".1", "utf8"), "login failed 203.0.113.9\nlogin ok\n", "the old lines moved to .1");
    assert.equal(fs.statSync(live).mode & 0o777, 0o600, "postrotate makes the live file owner-only");
    assert.equal(fs.statSync(live + ".1").mode & 0o777, 0o600, "and the copy");
    assert.ok(!fs.existsSync(path.join(logs, "demo.log.1")), "an empty log is not rotated");
    assert.ok(!fs.existsSync(path.join(logs, "prod.log.1")), "a missing log is no error");
    fs.appendFileSync(live, "me k1 203.0.113.9\n");
    run();
    assert.ok(fs.existsSync(live + ".2.gz"), "the second rotation compresses the older copy");
    assert.equal(fs.readFileSync(live + ".1", "utf8"), "me k1 203.0.113.9\n");
    assert.equal(fs.statSync(live + ".2.gz").mode & 0o777, 0o600);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
