
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
const TO_DOWNLOAD_FILE = path.join(__dirname, '../datos/contactos_a_descargar_wallentries.json');
const OUTPUT_FILE = path.join(__dirname, '../datos/contactos_wallentries.json');
const API_TOKEN = 'c464da16552a931e1a4c5a6d65fee1e6c7ea422d';

const limit = pLimit(8);
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getWallentries(contactId) {
  await delay(500);
  const url = `https://api.clientify.net/v1/contacts/${contactId}/`;
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
  // wall_entries puede venir como string (JSON) o como array
  let wallentries = [];
  if (Array.isArray(data.wall_entries)) {
    wallentries = data.wall_entries;
  } else if (typeof data.wall_entries === 'string') {
    try {
      wallentries = JSON.parse(data.wall_entries);
    } catch (e) {
      wallentries = [];
    }
  }
  // Filtrar wallentries como antes
  wallentries = wallentries.filter(w => {
    if (!w.created) return false;
    if (w.type === 'contact_creation_from_inbox') return false;
    const fechaArgentina = pkg.utcToZonedTime(new Date(w.created), TIMEZONE);
    return isSameDay(fechaArgentina, todayArgentina);
  });
  return wallentries;
}

async function main() {
  const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
  let toDownload = [];
  if (fs.existsSync(TO_DOWNLOAD_FILE)) {
    toDownload = JSON.parse(fs.readFileSync(TO_DOWNLOAD_FILE, 'utf8'));
  } else {
    console.error('No se encontró el archivo de contactos a descargar:', TO_DOWNLOAD_FILE);
    return;
  }

  console.log(`Total de contactos del día: ${contacts.length}`);
  console.log(`Contactos a descargar wallentries: ${toDownload.length}`);

  // Crear un mapa para acceso rápido por id
  const contactsMap = new Map(contacts.map(c => [c.id, { ...c }]));

  // Descargar wallentries solo para los contactos/tags necesarios
  const wallentriesByContact = {};
  const tasks = toDownload.map(item =>
    limit(async () => {
      const wallentries = await getWallentries(item.id);
      wallentriesByContact[item.id] = wallentries;
      console.log(`Contact ${item.id}: ${wallentries.length} wallentries descargadas`);
    })
  );
  await Promise.all(tasks);

  // Agregar las wallentries a los contactos originales
  const contactsWithWallentries = contacts.map(contact => {
    if (wallentriesByContact[contact.id]) {
      return { ...contact, wallentries: wallentriesByContact[contact.id] };
    } else {
      return { ...contact, wallentries: [] };
    }
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(contactsWithWallentries, null, 2), 'utf-8');
  console.log('Archivo generado:', OUTPUT_FILE);
  const conWallentries = contactsWithWallentries.filter(c => Array.isArray(c.wallentries) && c.wallentries.length > 0).length;
  console.log(`Contactos con wallentries descargadas: ${conWallentries}`);
}

main();
