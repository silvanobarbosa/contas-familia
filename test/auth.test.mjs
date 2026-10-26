import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

// Não bate no Blob: LOCAL_STORE aponta uma pasta temporária (store.mjs grava em disco local).
// store.mjs captura LOCAL no import, então a pasta é fixa; limpamos o arquivo entre os testes.
delete process.env.BLOB_READ_WRITE_TOKEN;
const STORE = fs.mkdtempSync(path.join(os.tmpdir(), "cf-test-"));
process.env.LOCAL_STORE = STORE;
const { validaSenha, publico, login } = await import("../lib/auth.mjs");

// store limpo por teste: senão o usuarios.json do teste anterior faria o seed ser ignorado.
beforeEach(() => { fs.rmSync(path.join(STORE, "sistema"), { recursive: true, force: true }); });

describe("validaSenha", () => {
  it("rejeita senha curta", () => expect(validaSenha("1234567")).toBeTruthy());
  it("rejeita não-string", () => expect(validaSenha(undefined)).toBeTruthy());
  it("aceita 8+ caracteres", () => expect(validaSenha("12345678")).toBeNull());
  it("rejeita acima de 128", () => expect(validaSenha("a".repeat(129))).toBeTruthy());
});

describe("publico", () => {
  it("expõe só login/nome/email, nunca o hash", () => {
    const p = publico({ login: "x", nome: "X", email: "x@y.z", hash: "$2b$segredo", falhas: 3 });
    expect(p).toEqual({ login: "x", nome: "X", email: "x@y.z" });
    expect(JSON.stringify(p)).not.toContain("segredo");
  });
});

describe("login (anti-enumeração)", () => {
  it("usuário inexistente e senha errada dão a MESMA mensagem", async () => {
    const hash = await bcrypt.hash("CertaSenha#2026", 12);
    process.env.SEED_USERS = JSON.stringify([{ login: "ana", nome: "Ana", email: "a@b.c", hash }]);
    const semUser = await login("naoexiste", "qualquer123");
    const senhaErrada = await login("ana", "errada12345");
    expect(semUser.erro).toBe("Usuário ou senha incorretos.");
    expect(senhaErrada.erro).toBe(semUser.erro);
  });

  it("credencial correta retorna token + user sem hash", async () => {
    const hash = await bcrypt.hash("CertaSenha#2026", 12);
    process.env.SEED_USERS = JSON.stringify([{ login: "bia", nome: "Bia", email: "b@b.c", hash }]);
    const ok = await login("bia", "CertaSenha#2026");
    expect(ok.erro).toBeUndefined();
    expect(ok.token).toBeTruthy();
    expect(ok.user).toEqual({ login: "bia", nome: "Bia", email: "b@b.c" });
  });
});
