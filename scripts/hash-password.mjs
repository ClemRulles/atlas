// Prépare une entrée pour la variable ATLAS_USERS, sans jamais écrire le mot de passe en clair.
// Usage : node scripts/hash-password.mjs clement "Clément"
// Le mot de passe est demandé sans écho dans le terminal.
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const [id, name] = process.argv.slice(2);
if (!id || !name) {
  console.error('Usage : node scripts/hash-password.mjs <identifiant> "<Prénom>"');
  process.exit(1);
}
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => rl.output.write(s.includes("Mot de passe") ? s : "");
rl.question("Mot de passe : ", (password) => {
  rl.close();
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  console.log(`\n${id.toLowerCase()}:${name}:${salt}:${hash}`);
});
