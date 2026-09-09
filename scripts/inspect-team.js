import Franchise from 'madden-franchise';
const franchise = await Franchise.create(process.argv[2] ?? './sample-save', { saveOnChange: false });
const table = franchise.getTableByName('Team');
console.log(table.schema.attributes.map((field) => field.name).join(', '));
await table.readRecords();
const sample = table.records.find((record) => !record.isEmpty);
console.log(Object.fromEntries(sample.fieldsArray.map((field) => [field.key, field.value])));
