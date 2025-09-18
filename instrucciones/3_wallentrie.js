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

		// Leer contactos previos procesados (si existe)
		let prevContacts = [];
		const prevFile = OUTPUT_FILE;
		if (fs.existsSync(prevFile)) {
			try {
				prevContacts = JSON.parse(fs.readFileSync(prevFile, 'utf8'));
			} catch (e) {
				prevContacts = [];
			}
		}

		const debugWallentries = [];

		// Procesar contactos
		const processedContacts = await Promise.all(contacts.map(async (contact) => {
			if (!Array.isArray(contact.tags) || contact.tags.length <= 1) {
				contact.wallentries = [];
				totalMensajes++;
				return contact;
			}

			// Buscar contacto previo
			const prev = prevContacts.find(c => c.id === contact.id);
			let prevTags = prev ? prev.tags : [];
			let prevWallentries = prev ? (Array.isArray(prev.wallentries) ? prev.wallentries : []) : [];

			// Detectar tags nuevas
			const nuevasTags = contact.tags.filter(tag => !prevTags.includes(tag));

			let wallentriesFinal = [...prevWallentries];
			let wallentriesCrudas = [];
			let wallentriesValidas = [];
			let cantidadValidas = 0;

			if (nuevasTags.length === 0 && prevWallentries.length > 0) {
				// No hay tags nuevas, usar wallentries previas
				contact.wallentries = prevWallentries;
				totalMensajes += prevWallentries.length;
				wallentriesCrudas = prevWallentries;
				wallentriesValidas = prevWallentries.map(w => ({ id: w.id, created: w.created, type: w.type }));
				cantidadValidas = prevWallentries.length;
			} else {
				// Hay tags nuevas, consultar la API y sumar solo las wallentries de esas tags
				const wallentries = await getWallentries(contact.id);
				// Filtrar solo las wallentries válidas de hoy y no "contact_creation_from_inbox"
				const validEntries = wallentries.filter(w =>
					w.type !== 'contact_creation_from_inbox' && isTodayArgentina(w.created)
				);

				// Para cada tag nueva, buscar la primera wallentry que coincida con esa tag
				nuevasTags.forEach(tag => {
					const entry = validEntries.find(w => {
						// Coincidencia flexible: la tag debe estar en el channel_name (ignorando mayúsculas/minúsculas)
						if (!w.extra || !w.extra.channel_name) return false;
						return w.extra.channel_name.toLowerCase().includes(tag.toLowerCase());
					});
					if (entry && !wallentriesFinal.some(w => w.id === entry.id)) {
						wallentriesFinal.push(entry);
					}
				});

				contact.wallentries = wallentriesFinal;
				totalMensajes += wallentriesFinal.length;
				wallentriesCrudas = wallentries;
				wallentriesValidas = wallentriesFinal.map(w => ({ id: w.id, created: w.created, type: w.type }));
				cantidadValidas = wallentriesFinal.length;
			}

			debugWallentries.push({
				id: contact.id,
				tags: contact.tags,
				wallentries_crudas: wallentriesCrudas,
				wallentries_validas: wallentriesValidas,	
				cantidad_validas: cantidadValidas
			});
			return contact;
		}));

		fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedContacts, null, 2));
		fs.writeFileSync(path.join(__dirname, '../datos/debug_wallentries.json'), JSON.stringify(debugWallentries, null, 2));
		console.log('Procesamiento finalizado. Total mensajes hoy:', totalMensajes);
		console.log('Debug de wallentries guardado en datos/debug_wallentries.json');
	}

	main();
