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

const RETRYABLE_STATUS = new Set([401, 429]);
const MAX_RETRIES = 3;
const CONCURRENCY_LIMIT = 10;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 16000;
const RETRY_JITTER_MS = 250;

function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getWallentries(contactId) {
	const url = `https://api-plus.clientify.com/v2/contacts/${contactId}/wallentries`;

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
		try {
			const res = await fetch(url, {
				headers: {
					'Authorization': `Token ${API_TOKEN}`,
					'Content-Type': 'application/json',
				},
			});

			const rawBody = await res.text();
			const snippet = rawBody ? rawBody.replace(/\s+/g, ' ').slice(0, 200) : '(cuerpo vacío)';

			if (!res.ok) {
				console.warn(`(Wallentries) Contacto ${contactId} - respuesta inválida (status ${res.status}). Fragmento: ${snippet}`);

				if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
					await scheduleRetry(contactId, attempt);
					continue;
				}

				return [];
			}

			if (!rawBody.trim()) {
				return [];
			}

			let data;
			try {
				data = JSON.parse(rawBody);
			} catch (parseError) {
				console.warn(`(Wallentries) Contacto ${contactId} - error al parsear JSON: ${parseError.message}. Fragmento: ${snippet}`);
				if (attempt < MAX_RETRIES) {
					await scheduleRetry(contactId, attempt);
					continue;
				}
				return [];
			}

			if (!data || !Array.isArray(data.results)) {
				console.warn(`(Wallentries) Contacto ${contactId} - respuesta sin 'results' válido. Fragmento: ${snippet}`);
				return [];
			}

			return data.results;
		} catch (error) {
			console.error(`(Wallentries) Error al consultar contacto ${contactId}: ${error.message}`);
			if (attempt < MAX_RETRIES) {
				await scheduleRetry(contactId, attempt);
				continue;
			}
			return [];
		}
	}

	return [];
}

function getBackoffDelay(attempt) {
	return Math.min(BASE_BACKOFF_MS * Math.pow(2, attempt - 1), MAX_BACKOFF_MS);
}

async function scheduleRetry(contactId, attempt) {
	const jitter = Math.random() * RETRY_JITTER_MS;
	const waitMs = Math.round(getBackoffDelay(attempt) + jitter);
	console.log(`(Wallentries) Reintentando contacto ${contactId} en ${waitMs}ms (intento ${attempt + 1} de ${MAX_RETRIES}).`);
	await sleep(waitMs);
}

async function processContactsWithLimit(contacts, limit, processor) {
        const results = new Array(contacts.length);
        let index = 0;

        async function worker() {
                while (true) {
                        if (index >= contacts.length) {
                                break;
                        }

                        const currentIndex = index;
                        index += 1;

                        results[currentIndex] = await processor(contacts[currentIndex], currentIndex);
                }
        }

        const workers = Array.from({ length: Math.min(limit, contacts.length) }, () => worker());
        await Promise.all(workers);
        return results;
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
                const processedContacts = await processContactsWithLimit(contacts, CONCURRENCY_LIMIT, async (contact, idx) => {
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
                });

		fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedContacts, null, 2));
		console.log('Procesamiento finalizado. Total mensajes hoy:', totalMensajes);
	}

	main();
