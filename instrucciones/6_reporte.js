
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import pkg from 'date-fns-tz';
const { utcToZonedTime, format } = pkg;

// Configuración de archivos
const CONTACTS_FILE = path.join(__dirname, '../datos/contactos_wallentries.json');
// Calcular AYER en horario de Argentina
const TIMEZONE = 'America/Argentina/Buenos_Aires';
const now = new Date();
const ayerArgentina = utcToZonedTime(new Date(now.getTime() - 24 * 60 * 60 * 1000), TIMEZONE);
const AYER_STR = format(ayerArgentina, 'yyyy-MM-dd', { timeZone: TIMEZONE });
const FLAGS_AYER_FILE = path.join(__dirname, '../excluidos', `flags_wallentries.${AYER_STR}.json`);
const REPORTE_DIR = path.join(__dirname, '../reporte');
if (!fs.existsSync(REPORTE_DIR)) {
	fs.mkdirSync(REPORTE_DIR, { recursive: true });
}
const REPORTE_PANELES = path.join(REPORTE_DIR, 'resumen_paneles.json');
const REPORTE_TELEFONOS = path.join(REPORTE_DIR, 'telefonos_por_panel.json');

// Números excluidos
const numerosExcluidos = ["+5491130363926", "+5491166769346"];

// Helpers
function normalizarPanel(str) {
	if (!str) return '';
	// Si viene de tag: antes del primer guion
	let panel = str.split('-')[0].trim();
	// Si viene de wallentry.user: quitar "Panel "
	if (panel.toLowerCase().startsWith('panel ')) {
		panel = panel.slice(6).trim();
	}
	// Capitalizar primera letra
	return panel.charAt(0).toUpperCase() + panel.slice(1).toLowerCase();
}

// Leer datos
const contactos = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
let flagsAyer = [];
if (fs.existsSync(FLAGS_AYER_FILE)) {
	flagsAyer = JSON.parse(fs.readFileSync(FLAGS_AYER_FILE, 'utf8'));
}
const excluidasAyer = new Set(flagsAyer.map(f => f.wallentry_id));

// Acumuladores
const paneles = {};
// Guardar: { [panel]: { [telefono]: [horas] } }
const telefonosPorPanel = {};

for (const contacto of contactos) {
	// Si el número está excluido, saltar todo el contacto
	const phones = (contacto.phones || []).map(p => p.phone);
		if (phones.some(num => numerosExcluidos.includes(num))) continue;

	if (!Array.isArray(contacto.tags) || contacto.tags.length === 0) continue;

	// Caso 1: solo una tag
		if (contacto.tags.length === 1) {
			const panel = normalizarPanel(contacto.tags[0]);
			paneles[panel] = paneles[panel] || { panel, total_mensajes_hoy: 0, detalle_por_origen: ["clientify"] };
			paneles[panel].total_mensajes_hoy++;
			telefonosPorPanel[panel] = telefonosPorPanel[panel] || {};
			phones.forEach(num => {
				if (!telefonosPorPanel[panel][num]) telefonosPorPanel[panel][num] = [];
				// Usar la fecha de created del contacto
				if (contacto.created) telefonosPorPanel[panel][num].push(contacto.created);
			});
			continue;
		}

	// Caso 2: más de una tag, analizar wallentries
	if (Array.isArray(contacto.wallentries)) {
			for (const w of contacto.wallentries) {
				// Excluir si el número está en excluidos
				if (w.extra && w.extra.whatsapp_phone && numerosExcluidos.includes(w.extra.whatsapp_phone)) continue;
				// Excluir si la wallentry está en flags de ayer
				if (excluidasAyer.has(w.id)) continue;
				// Panel desde wallentry.user
				let panel = '';
				if (w.user) {
					panel = normalizarPanel(w.user);
				} else if (w.extra && w.extra.channel_name) {
					panel = normalizarPanel(w.extra.channel_name);
				}
				if (!panel) continue;
				paneles[panel] = paneles[panel] || { panel, total_mensajes_hoy: 0, detalle_por_origen: ["clientify"] };
				paneles[panel].total_mensajes_hoy++;
				// Teléfonos: preferir whatsapp_phone, si no, phones del contacto
				let nums = [];
				if (w.extra && w.extra.whatsapp_phone) {
					nums = [w.extra.whatsapp_phone];
				} else {
					nums = phones;
				}
						telefonosPorPanel[panel] = telefonosPorPanel[panel] || {};
						nums.forEach(num => {
							if (!telefonosPorPanel[panel][num]) telefonosPorPanel[panel][num] = [];
							// Usar la fecha de created de la wallentry
							if (w.created) telefonosPorPanel[panel][num].push(w.created);
						});
			}
	}
}


// Convertir a formato solicitado: [{ telefono, horas: [...] }]
const telefonosPorPanelArr = {};
for (const panel in telefonosPorPanel) {
	telefonosPorPanelArr[panel] = Object.entries(telefonosPorPanel[panel]).map(([telefono, horas]) => ({ telefono, horas }));
}

// Crear carpeta reporte si no existe
if (!fs.existsSync(REPORTE_DIR)) {
	fs.mkdirSync(REPORTE_DIR);
}

// Guardar archivos
const resumenPanelesData = JSON.stringify(Object.values(paneles), null, 2);
fs.writeFileSync(REPORTE_PANELES, resumenPanelesData);
// Guardar copia en la raíz
fs.writeFileSync(path.join(__dirname, '../reporte_paneles2.json'), resumenPanelesData);
fs.writeFileSync(REPORTE_TELEFONOS, JSON.stringify(telefonosPorPanelArr, null, 2));
const totalMensajes = Object.values(paneles).reduce((acc, p) => acc + p.total_mensajes_hoy, 0);
console.log('✅ Reportes generados en la carpeta reporte');
console.log('Total de mensajes hoy:', totalMensajes);
