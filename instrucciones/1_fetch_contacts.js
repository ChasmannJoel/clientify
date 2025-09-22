
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_TOKEN = "c464da16552a931e1a4c5a6d65fee1e6c7ea422d";
const RAW_DATA_FILE = path.join(__dirname, '../datos/contacts_raw.json');
// Crear carpeta datos si no existe
const datosDir = path.join(__dirname, '../datos');
if (!fs.existsSync(datosDir)) {
  fs.mkdirSync(datosDir, { recursive: true });
}

// -------------------------
// Helpers
// -------------------------
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchConReintentos(url, headers, intentos = 10, espera = 10000) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, { headers });
      const contentType = res.headers.get("content-type");

      if (!res.ok || !contentType || !contentType.includes("application/json")) {
        const errorText = await res.text();
        console.error("Error HTTP:", res.status, "Intento:", i + 1);
        console.error("Content-Type:", contentType);
        console.error("Respuesta:", errorText.slice(0, 500));
        if (i < intentos - 1) {
          console.log("Esperando 10 segundos antes de reintentar...");
          await delay(espera);
          continue;
        } else {
          console.error("Demasiados intentos fallidos. Abortando.");
          return null;
        }
      }

      return res;
    } catch (err) {
      console.error("Error de red o parseo:", err.message, "Intento:", i + 1);
      if (i < intentos - 1) {
        console.log("Esperando 10 segundos antes de reintentar...");
        await delay(espera);
      } else {
        console.error("Demasiados intentos fallidos. Abortando.");
        return null;
      }
    }
  }
}

// -------------------------
// Generar endpoints
// -------------------------
function generarRangoUTC() {
  const ahora = new Date();
  
  // Calcular ayer, hoy y mañana en UTC (solo fechas, sin horas)
  const ayer = new Date(ahora);
  ayer.setUTCDate(ahora.getUTCDate() - 1);
  
  const manana = new Date(ahora);
  manana.setUTCDate(ahora.getUTCDate() + 1);

  // Formatear como YYYY-MM-DD + T00:00:00Z
  const inicioUTC = ayer.toISOString().split("T")[0] + "T00:00:00Z";
  const finUTC = manana.toISOString().split("T")[0] + "T00:00:00Z";

  console.log(`� Rango UTC: desde ${inicioUTC} hasta ${finUTC}`);

  return { inicioUTC, finUTC };
}

function generarEndpoint(tipo, inicioUTC, finUTC) {
  return `https://api.clientify.net/v1/contacts/?${tipo}[gte]=${inicioUTC}&${tipo}[lt]=${finUTC}`;
}

// -------------------------
// Fetch de contactos (un tipo: created o modified)
// -------------------------
async function fetchByTipo(tipo, inicioUTC, finUTC) {
  let url = generarEndpoint(tipo, inicioUTC, finUTC);
  const headers = { Authorization: `Token ${API_TOKEN}` };
  let contactos = [];

  console.log(`📋 Descargando contactos filtrados por ${tipo}`);
  console.log(`➡️ Endpoint inicial: ${url}`);

  while (url) {
    const res = await fetchConReintentos(url, headers);
    if (!res) return [];

    const data = await res.json();
    const contactosFiltrados = data.results.map(contact => ({
      url: contact.url,
      id: contact.id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      phones: contact.phones,
      tags: contact.tags,
      created: contact.created,
      modified: contact.modified,
      last_contact: contact.last_contact
    }));

    contactos = contactos.concat(contactosFiltrados);
    console.log(`📥 Lote de ${contactosFiltrados.length} contactos (Total ${contactos.length})`);

    url = data.next;
    if (url) await delay(1000);
  }

  return contactos;
}

// -------------------------
// Función principal
// -------------------------
async function fetchAllContacts() {
  const { inicioUTC, finUTC } = generarRangoUTC();

  // Traemos contactos por created y modified en paralelo
  const [contactosCreated, contactosModified] = await Promise.all([
    fetchByTipo("created", inicioUTC, finUTC),
    fetchByTipo("modified", inicioUTC, finUTC)
  ]);

  console.log(`🟢 Contactos traídos por created: ${contactosCreated.length}`);
  console.log(`🟡 Contactos traídos por modified: ${contactosModified.length}`);

  // Combinamos eliminando duplicados (por id)
  const mapa = new Map();
  [...contactosCreated, ...contactosModified].forEach(c => {
    mapa.set(c.id, c);
  });

  const contactosFinales = Array.from(mapa.values());

  console.log(`✅ Total final (sin duplicados): ${contactosFinales.length}`);
  return contactosFinales;
}

// -------------------------
// Ejecución
// -------------------------
(async () => {
  try {
    const contactos = await fetchAllContacts();

    if (contactos.length > 0) {
      fs.writeFileSync(RAW_DATA_FILE, JSON.stringify(contactos, null, 2), "utf-8");
      console.log(`📂 Contactos guardados en: ${RAW_DATA_FILE}`);
      console.log("🎯 Ejecuta 'process_report.js' para generar el reporte de paneles");
    } else {
      console.log("⚠️ No se encontraron contactos para procesar");
    }
  } catch (err) {
    console.error("❌ Error en fetch_contacts.js:", err.message);
  }
})();