# Smoke test for the no-server modes (static hosting and the single-file build).
# Needs Python Playwright with Chromium (the Node repo has no dependencies on purpose).
#   python3 -m http.server 9505 --bind 127.0.0.1 --directory public   # in another shell
#   python3 scripts/smoke-static.py http://127.0.0.1:9505/ dist/puppy-school.html
import asyncio, sys, pathlib
from playwright.async_api import async_playwright

async def run(b, url, label):
    ctx = await b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    pg = await ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(url, wait_until="networkidle")
    assert await pg.locator("#set-name").count() == 1, label + ": setup form should show on first run"
    assert await pg.locator("#sync").inner_text() == "This phone", label + ": should say This phone, got " + await pg.locator("#sync").inner_text()
    await pg.locator("#set-name").fill("Pip")
    await pg.get_by_placeholder("Name").first.fill("Ava")
    await pg.get_by_role("button", name="Start training").click(); await pg.wait_for_timeout(800)
    await pg.get_by_role("button", name="Ava").click(); await pg.wait_for_timeout(500)
    assert await pg.locator(".card.mine button.slot").count() == 3, label + ": three missions"
    await pg.locator(".card.mine button.slot").first.click(); await pg.wait_for_timeout(400)
    assert await pg.locator(".card.mine button.slot[aria-pressed=true]").count() == 1, label + ": tick"
    saved = await pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('pt.ticks')||'{}')).length")
    assert saved == 1, label + ": tick saved in localStorage"
    await pg.reload(wait_until="networkidle"); await pg.wait_for_timeout(600)
    assert await pg.locator(".card.mine button.slot[aria-pressed=true]").count() == 1, label + ": tick survives a reload"
    assert "level" in (await pg.locator(".card.hero").inner_text()).lower(), label + ": rewards work without a server"
    await pg.locator("#gear").click(); await pg.wait_for_timeout(500)
    txt = await pg.locator("#p-settings").inner_text()
    assert "Reminders need the family server" in txt, label + ": reminders degrade with a message"
    assert "saved on this phone only" in txt, label + ": sync note explains local mode"
    assert await pg.locator("#set-photo").count() == 1, label + ": the photo still works locally (kept in localStorage)"
    assert await pg.locator("input[type=tel]").count() == 0, label + ": no phone numbers without a server"
    # per-phone haptics switch (burn/a11y-followups): stored in localStorage, default on
    assert await pg.locator("#haptics").is_checked(), label + ": haptics default on"
    await pg.locator("#haptics").uncheck(); await pg.wait_for_timeout(200)
    assert await pg.evaluate("localStorage.getItem('pt.haptics')") == "false", label + ": haptics off is saved per phone"
    # the locked skill pill uses the sprite lock, not an emoji
    await pg.get_by_role("tab", name="Skills").click(); await pg.wait_for_timeout(500)
    assert await pg.locator(".pill svg use[href='#i-lock']").count() >= 1, label + ": locked pills use the sprite lock"
    assert "🔒" not in await pg.locator("#p-skills").inner_text(), label + ": no lock emoji text"
    assert not errs, label + ": page errors " + str(errs)
    await ctx.close()
    print("ok:", label)

async def main():
    static_url, single = sys.argv[1], sys.argv[2]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        await run(b, static_url, "static hosting of public/")
        await run(b, "file://" + str(pathlib.Path(single).resolve()), "single-file build opened from disk")
        await b.close()
asyncio.run(main())
