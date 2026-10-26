// Embute as páginas HTML num módulo JS para o build (evita leitura de arquivo em tempo de execução).
import fs from "node:fs";
const out = { app: fs.readFileSync("ui/app.html", "utf8"), auth: fs.readFileSync("ui/auth.html", "utf8") };
fs.mkdirSync("lib/generated", { recursive: true });
fs.writeFileSync("lib/generated/ui.mjs", Object.entries(out).map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`).join("\n") + "\n");
console.log("ui gerada");
