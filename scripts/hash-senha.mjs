// Gera o hash bcrypt de uma senha lida do terminal (a senha não fica salva em lugar nenhum).
import bcrypt from "bcryptjs";
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Senha: ", async (s) => { console.log(await bcrypt.hash(s, 12)); rl.close(); });
