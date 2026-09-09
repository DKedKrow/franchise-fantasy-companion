import Franchise from 'madden-franchise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const savePath = process.argv[2] ?? path.join(here, '..', 'sample-save');

const franchise = await Franchise.create(savePath, {
  autoUnempty: false,
  saveOnChange: false,
});

console.log(`Game: ${franchise.gameType} ${franchise.gameYear}`);
console.log(`Schema: ${franchise.schema.meta.major}.${franchise.schema.meta.minor}`);

const candidates = franchise.tables
  .filter((table) => /game|stat|player|season|week/i.test(table.name))
  .map((table) => ({
    name: table.name,
    id: table.header.tableId,
    uniqueId: table.header.tablePad1,
    records: table.header.numMembers,
    capacity: table.header.recordCapacity,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

console.table(candidates);
