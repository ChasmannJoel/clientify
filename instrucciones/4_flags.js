const fs = require('fs');
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../datos/contactos_wallentries.json');
// Obtener la fecha de hoy en Argentina (GMT-3)
function getArgentinaToday() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const argentina = new Date(utc - (3 * 60 * 60 * 1000));
  return argentina.toISOString().slice(0, 10);
}
const TODAY_ARG = getArgentinaToday();
const FLAGS_DIR = path.join(__dirname, '../excluidos');
if (!fs.existsSync(FLAGS_DIR)) {
  fs.mkdirSync(FLAGS_DIR, { recursive: true });
}
const FLAGS_FILE = path.join(FLAGS_DIR, `flags_wallentries.${TODAY_ARG}.json`);

// Leer flags previos si existen
let flags = [];
if (fs.existsSync(FLAGS_FILE)) {
  try {
    flags = JSON.parse(fs.readFileSync(FLAGS_FILE, 'utf8'));
  } catch (e) {
    console.error('Error leyendo flags previos:', e);
    flags = [];
  }
}

// Crear un Set de ids ya guardados para no duplicar
const existingIds = new Set(flags.map(f => f.wallentry_id));

// Función para saber si una fecha es de hoy en Argentina
function isTodayArgentina(dateStr) {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const argentina = new Date(utc - (3 * 60 * 60 * 1000));
  const fecha = argentina.toISOString().slice(0, 10);
  return fecha === TODAY_ARG;
}

// Leer contactos y procesar wallentries de hoy
const contacts = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
let nuevos = 0;

for (const contact of contacts) {
  if (!Array.isArray(contact.wallentries)) continue;
  for (const w of contact.wallentries) {
    if (!w.created || !w.id) continue;
    if (!isTodayArgentina(w.created)) continue;
    if (existingIds.has(w.id)) continue;
    flags.push({
      wallentry_id: w.id,
      contact_id: contact.id,
      created: w.created
    });
    existingIds.add(w.id);
    nuevos++;
  }
}

fs.writeFileSync(FLAGS_FILE, JSON.stringify(flags, null, 2));
console.log(`Flags actualizados. Nuevos registros agregados: ${nuevos}`);
