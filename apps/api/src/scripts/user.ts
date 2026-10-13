/**
 * Creates a login (web app and extension), or resets its password.
 *
 *   npm run user -w @sports-better/api -- <username>
 *
 * Prompts for the password without echoing it.
 */
import { createInterface } from 'node:readline';
import { prisma } from '../db';
import { hashPassword, MIN_PASSWORD_LENGTH, USERNAME_PATTERN } from '../auth/password';

const username = process.argv[2]?.trim().toLowerCase();
if (!username || !USERNAME_PATTERN.test(username)) {
  console.error('usage: npm run user -w @sports-better/api -- <username>   (letters, numbers, . _ -)');
  process.exit(1);
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => write(s.startsWith(question) ? s : '');
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

const password = await askHidden('Password: ');
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}
if ((await askHidden('Repeat password: ')) !== password) {
  console.error('Passwords did not match.');
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const existing = await prisma.user.findUnique({ where: { username } });
await prisma.user.upsert({ where: { username }, create: { username, passwordHash }, update: { passwordHash } });
if (existing) {
  // Sign out everywhere on reset, including extensions.
  await prisma.session.deleteMany({ where: { userId: existing.id } });
  await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
}
console.log(existing ? `Password reset for ${username}; browsers and extensions signed out.` : `Created ${username}.`);
await prisma.$disconnect();
