import Franchise from 'madden-franchise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const savePath = process.argv[2] ?? path.join(here, '..', 'sample-save');
const franchise = await Franchise.create(savePath, { saveOnChange: false });

const tableNames = [
  'GameOffensiveStats',
  'GameDefensiveStats',
  'GameKickingStats',
  'GameOffensiveKPReturnStats',
  'GameDefensiveKPReturnStats',
  'GameStats[]',
  'SeasonGame',
  'Player',
];

for (const name of tableNames) {
  const tables = franchise.getAllTablesByName(name);
  for (const [tableIndex, table] of tables.entries()) {
    console.log(`\n=== ${name} #${tableIndex + 1} (id ${table.header.tableId}) ===`);
    console.log(table.schema?.attributes?.map((field) => field.name).join(', ') ?? '(array wrapper)');
    await table.readRecords();
    const populated = table.records.filter((record) => !record.isEmpty);
    console.log(`Populated: ${populated.length}/${table.header.recordCapacity}`);
    const sample = populated.at(-1);
    if (sample) {
      const values = Object.fromEntries(
        sample.fieldsArray
          .map((field) => [field.key, field.value])
          .filter(([, value]) => value !== 0 && value !== '' && value !== null && value !== undefined),
      );
      console.log(JSON.stringify({ index: sample.index, values }, null, 2));
    }
  }
}
