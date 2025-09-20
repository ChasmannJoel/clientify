import fs from 'fs';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'date-fns-tz';
import { isSameDay } from 'date-fns';
import pLimit from 'p-limit';

const TIMEZONE = 'America/Argentina/Buenos_Aires';
const now = new Date();
const todayArgentina = pkg.utcToZonedTime(now, TIMEZONE);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTACTS_FILE = path.join(__dirname, '../datos/contactos_hoy.json');
const OUTPUT_FILE = path.join(__dirname, '../datos/wallentries_descargadas.json');
const API_TOKEN = 'c464da16552a931e1a4c5a6d65fee1e6c7ea422d';

// Limitar concurrencia a 8 (ajusta si quieres más o menos)
const limit = pLimit(8);

async function getWallentries(contactId) {
  const url = `https://api-plus.clientify.com/v2/contacts/${contactId}/wallentries`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Token ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    console.error(`[ERROR] ContactId ${contactId} - Status: ${res.status}`);
    return [];
  }
  const data = await res.json();
  const wallentries = (data.results || []).filter(w => {
    if (!w.created) return false;
    if (w.type === 'contact_creation_from_inbox') return false;
    const fechaArgentina = pkg.utcToZonedTime(new Date(w.created), TIMEZONE);
    return isSameDay(fechaArgentina, todayArgentina);
  });
  return wallentries;
}

async function main() {
  const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
  const result = [];
  // Correr todas las descargas en paralelo, pero con límite
  const tasks = contacts
    .filter(contact => Array.isArray(contact.tags) && contact.tags.length > 1)
    .map(contact =>
      limit(async () => {
        const wallentries = await getWallentries(contact.id);
        result.push({ contact_id: contact.id, wallentries });
        console.log(`Contact ${contact.id}: ${wallentries.length} wallentries`);
      })
    );
  await Promise.all(tasks);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  console.log('Wallentries guardadas en', OUTPUT_FILE);
}

main();
