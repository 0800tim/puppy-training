// Builds single-file versions of the app into dist/:
//   dist/puppy-school.html  — one self-contained page (email it, open from disk, host anywhere)
//   dist/artifact.html      — body fragment for publishing as a Claude artifact
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = (f) => readFileSync(join(root, "public", f), "utf8");
const html = pub("index.html");
const css = pub("styles.css");
const js = pub("content.js") + "\n" + pub("app.js");
const body = html.split("<!--APP-START-->")[1].split("<!--APP-END-->")[0];
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap">';
const safeJs = js.replace(/<\/script/gi, "<\\/script");

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist", "puppy-school.html"),
`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Puppy School HQ</title>
<meta name="theme-color" content="#5b3427">
${fonts}
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${safeJs}
</script>
</body>
</html>
`);
writeFileSync(join(root, "dist", "artifact.html"),
`<title>Puppy School HQ</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
<style>
${css}
</style>
${body}
<script>
${safeJs}
</script>
`);
console.log("Built dist/puppy-school.html and dist/artifact.html");
