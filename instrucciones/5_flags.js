
import fs from 'fs';
import path from 'path';
import pkg from 'date-fns-tz';
const { utcToZonedTime } = pkg;
import { isSameDay, format } from 'date-fns';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const INPUT_FILE = path.join(__dirname, '../datos/contactos_wallentries.json');

// Zona horaria de Argentina
const TIMEZONE = 'America/Argentina/Buenos_Aires';
const now = new Date();
const todayArgentina = utcToZonedTime(now, TIMEZONE);
const FLAGS_DIR = path.join(__dirname, '../excluidos');
if (!fs.existsSync(FLAGS_DIR)) {
  fs.mkdirSync(FLAGS_DIR, { recursive: true });
}
const TODAY_ARG = format(todayArgentina, 'yyyy-MM-dd', { timeZone: TIMEZONE });
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
  const fechaArgentina = utcToZonedTime(new Date(dateStr), TIMEZONE);
  return isSameDay(fechaArgentina, todayArgentina);
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
