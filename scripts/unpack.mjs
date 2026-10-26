// Usado só em publicações feitas sem Git: junta as partes bundle.partNN, descompacta e extrai os fontes.
// Arquivos enviados soltos na publicação têm prioridade sobre os do pacote (correções rápidas).
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const parts = fs.existsSync("parts") ? fs.readdirSync("parts").filter((f) => f.startsWith("bundle.part")).sort() : [];
if (parts.length) {
  const gz = Buffer.concat(parts.map((f) => fs.readFileSync(path.join("parts", f))));
  const files = JSON.parse(zlib.gunzipSync(gz).toString("utf8"));
  let n = 0;
  for (const [p, c] of Object.entries(files)) { if (fs.existsSync(p)) continue; fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); n++; }
  console.log("fontes extraídos:", n, "de", Object.keys(files).length);
}
