import { readFileSync } from 'node:fs';
import { validateBank } from '../bank.js';
console.log(JSON.stringify(validateBank(JSON.parse(readFileSync(new URL('../questions.json', import.meta.url), 'utf8'))), null, 2));
