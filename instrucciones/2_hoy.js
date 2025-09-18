const fs = require("fs");

function ajustarFechaArgentina(fechaStr) {
  // Convierte cualquier fecha ISO a la hora real de Argentina (UTC-3)
  const fechaOriginal = new Date(fechaStr);
  // Obtener timestamp UTC
  const utc = fechaOriginal.getTime() + (fechaOriginal.getTimezoneOffset() * 60000);
  // Ajustar a Argentina (UTC-3)
  const argentina = new Date(utc - (3 * 60 * 60 * 1000));
  return argentina;
}

function filtrarContactosHoyArgentina(contactos) {
  // Día de hoy en Argentina (UTC-3)
  const ahora = new Date();
  // Obtener fecha de hoy en Argentina
  const utc = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
  const hoyArgentina = new Date(utc - (3 * 60 * 60 * 1000));
  hoyArgentina.setHours(0, 0, 0, 0);
  const inicio = new Date(hoyArgentina);
  const fin = new Date(hoyArgentina.getTime() + 24 * 60 * 60 * 1000 - 1);

  return contactos.filter(contacto => {
    const created = ajustarFechaArgentina(contacto.created);
    const modified = ajustarFechaArgentina(contacto.modified);
    return (
      (created >= inicio && created <= fin) ||
      (modified >= inicio && modified <= fin)
    );
  });
}

const path = require('path');
const DATOS_DIR = path.join(__dirname, '../datos');
const CONTACTS_RAW_PATH = path.join(DATOS_DIR, 'contacts_raw.json');
const CONTACTS_HOY_PATH = path.join(DATOS_DIR, 'contactos_hoy.json');
console.log('Leyendo contactos desde:', CONTACTS_RAW_PATH);
if (!fs.existsSync(DATOS_DIR)) {
  fs.mkdirSync(DATOS_DIR, { recursive: true });
}
const contactos = JSON.parse(fs.readFileSync(CONTACTS_RAW_PATH, "utf-8"));
const contactosHoy = filtrarContactosHoyArgentina(contactos);

// Convertir created y modified a horario de Argentina y guardar
function toArgentinaISOString(date) {
  // yyyy-mm-ddTHH:MM:ss.sss-03:00
  const pad = n => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const min = pad(date.getMinutes());
  const sec = pad(date.getSeconds());
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${year}-${month}-${day}T${hour}:${min}:${sec}.${ms}-03:00`;
}

const contactosHoyArgentina = contactosHoy.map(c => ({
  ...c,
  created: toArgentinaISOString(ajustarFechaArgentina(c.created)),
  modified: toArgentinaISOString(ajustarFechaArgentina(c.modified))
}));

fs.writeFileSync(CONTACTS_HOY_PATH, JSON.stringify(contactosHoyArgentina, null, 2), "utf-8");
console.log(`Contactos de hoy: ${contactosHoyArgentina.length}`);
console.log("Archivo guardado en:", CONTACTS_HOY_PATH);
