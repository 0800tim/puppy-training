# Smoke test for the merged feature branches in no-server mode: the health log, teaching claims and
# confirmation, the certificate overlay and the CSV button must all work from localStorage alone.
#   python3 -m http.server 9505 --bind 127.0.0.1 --directory public   # in another shell
#   python3 scripts/smoke-features.py http://127.0.0.1:9505/
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
    url = sys.argv[1]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("response", lambda r: errs.append("404 " + r.url) if r.status == 404 else None)
        await pg.goto(url, wait_until="networkidle")
        await pg.locator("#set-name").fill("Pip")
        await pg.get_by_placeholder("Name").first.fill("Ava")
        await pg.get_by_role("button", name="+ Add a person").click(); await pg.wait_for_timeout(200)
        await pg.get_by_placeholder("Name").nth(1).fill("Ben")
        await pg.get_by_role("button", name="Start training").click(); await pg.wait_for_timeout(800)
        await pg.get_by_role("button", name="Ava").click(); await pg.wait_for_timeout(500)
        await pg.get_by_role("tab", name="Skills").click(); await pg.wait_for_timeout(600)
        txt = (await pg.locator("#p-skills").inner_text()).lower()
        assert "pip's health" in txt, "health card renders locally"
        assert "not weighed yet" in txt, "empty health state"
        # log a weigh-in locally
        await pg.locator("#p-skills input[aria-label='Weight in kg']").fill("6.4")
        await pg.locator("#p-skills").get_by_role("button", name="Add").click(); await pg.wait_for_timeout(500)
        h = await pg.evaluate("JSON.parse(localStorage.getItem('pt.health')||'[]')")
        assert len(h) == 1 and h[0]["kg"] == 6.4, "weigh-in saved in localStorage: " + str(h)
        assert "6.4 kg" in await pg.locator("#p-skills").inner_text(), "weigh-in shown"
        # teaching: the control shows on open skills with two people; log and confirm locally
        card0 = pg.locator("#p-skills details.acc.skill:not(.locked)").first
        await card0.locator("summary").click(); await pg.wait_for_timeout(300)
        sel = card0.locator("select[aria-label='Who did you teach?']")
        assert await sel.count() == 1, "teach control present on an open skill"
        await sel.select_option(label="Ben"); await card0.get_by_role("button", name="Log it").click(); await pg.wait_for_timeout(400)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('pt.teach')||'[]')")
        assert len(t) == 1 and t[0]["confirmed"] is None, "teach claim saved locally: " + str(t)
        # switch to Ben and confirm from Today
        await pg.locator("#meChip").click(); await pg.wait_for_timeout(300)
        await pg.get_by_role("button", name="Ben").click(); await pg.wait_for_timeout(500)
        await pg.get_by_role("tab", name="Today").click(); await pg.wait_for_timeout(500)
        card = pg.locator(".card.confirm")
        assert await card.count() == 1, "confirm card for the learner"
        await card.get_by_role("button", name="Yes").click(); await pg.wait_for_timeout(400)
        t = await pg.evaluate("JSON.parse(localStorage.getItem('pt.teach')||'[]')")
        assert t[0]["confirmed"], "confirmed locally"
        await pg.get_by_role("tab", name="Pack").click(); await pg.wait_for_timeout(500)
        ptxt = await pg.locator("#p-pack").inner_text()
        assert "certificate" in ptxt.lower(), "certificate button on Pack"
        await pg.get_by_role("button", name="Print Pip's certificate").click(); await pg.wait_for_timeout(400)
        assert await pg.locator(".cert-sheet").count() == 1, "certificate overlay"
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
        assert await pg.locator(".cert-sheet").count() == 0, "escape closes it"
        await pg.locator("#gear").click(); await pg.wait_for_timeout(400)
        assert await pg.locator("#p-settings").get_by_role("button", name="Export CSV").count() == 1, "CSV button"
        keys = await pg.evaluate("Object.keys(store.exportJson())")
        for k in ["settings", "ticks", "logs", "mastery", "toilet", "social", "health", "teach"]:
            assert k in keys, "JSON export holds " + k + ": " + str(keys)
        csv = await pg.evaluate("exportCsv()")
        assert '"teaching"' in csv and "taught to Ben" in csv, "CSV has the teaching row: " + csv[-300:]
        assert '"health"' in csv and "6.4" in csv, "CSV has the health row"
        print("notes:", errs); assert not [e for e in errs if not e.startswith("404 ")], "page errors: " + str(errs)
        await ctx.close(); await b.close()
        print("ok: health, teaching, certificate and CSV degrade cleanly with no server")
asyncio.run(main())
