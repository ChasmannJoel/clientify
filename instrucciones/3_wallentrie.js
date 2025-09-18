const fs = require('fs');
const fetch = require('node-fetch');

const path = require('path');
const CONTACTS_FILE = path.join(__dirname, '../datos/contactos_hoy.json');
const OUTPUT_FILE = path.join(__dirname, '../datos/contactos_wallentries.json');
const API_TOKEN = 'c464da16552a931e1a4c5a6d65fee1e6c7ea422d';

function getArgentinaToday() {
	const now = new Date();
	const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
	const argentina = new Date(utc - (3 * 60 * 60 * 1000));
	return argentina.toISOString().slice(0, 10);
}
const TODAY = getArgentinaToday();

async function getWallentries(contactId) {
	const url = `https://api-plus.clientify.com/v2/contacts/${contactId}/wallentries`;
	const res = await fetch(url, {
		headers: {
			'Authorization': `Token ${API_TOKEN}`,
			'Content-Type': 'application/json',
		},
	});
	if (!res.ok) return [];
	const data = await res.json();
	return data.results || [];
}

function isTodayArgentina(dateStr) {
	if (!dateStr) return false;
	// Convierte cualquier fecha ISO a la hora real de Argentina (UTC-3)
	const fechaOriginal = new Date(dateStr);
	const utc = fechaOriginal.getTime() + (fechaOriginal.getTimezoneOffset() * 60000);
	const argentina = new Date(utc - (3 * 60 * 60 * 1000));
	const fecha = argentina.toISOString().slice(0, 10);
	return fecha === TODAY;
}

async function main() {
		const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
		let totalMensajes = 0;
		console.log('Iniciando procesamiento de contactos:', contacts.length);

		// Procesar en paralelo los contactos con más de una tag
		const processedContacts = await Promise.all(contacts.map(async (contact, idx) => {
			if (!Array.isArray(contact.tags) || contact.tags.length <= 1) {
				contact.wallentries = [];
				totalMensajes++;
				console.log(`[${idx+1}/${contacts.length}] Contacto ${contact.id} (1 tag): mensajes=1`);
				return contact;
			}
			console.log(`[${idx+1}/${contacts.length}] Consultando wallentries para contacto ${contact.id} (${contact.tags.length} tags)...`);
			const wallentries = await getWallentries(contact.id);
			const validEntries = wallentries.filter(w =>
				w.type !== 'contact_creation_from_inbox' && isTodayArgentina(w.created)
			);
			contact.wallentries = validEntries;
			totalMensajes += validEntries.length;
			console.log(`[${idx+1}/${contacts.length}] Contacto ${contact.id}: wallentries válidas hoy = ${validEntries.length}`);
			return contact;
		}));

		fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedContacts, null, 2));
		console.log('Procesamiento finalizado. Total mensajes hoy:', totalMensajes);
	}

	main();
