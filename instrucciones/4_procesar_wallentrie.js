
	import fs from 'fs';
	import path from 'path';
	import { fileURLToPath } from 'url';
	import pkg from 'date-fns-tz';
	const { utcToZonedTime } = pkg;
	import { isSameDay } from 'date-fns';

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	const CONTACTS_FILE = path.join(__dirname, '../datos/contactos_hoy.json');
	const OUTPUT_FILE = path.join(__dirname, '../datos/contactos_wallentries.json');

	const WALLENTRIES_FILE = path.join(__dirname, '../datos/wallentries_descargadas.json');

	// Zona horaria de Argentina
	const TIMEZONE = 'America/Argentina/Buenos_Aires';
	const now = new Date();
	const todayArgentina = utcToZonedTime(now, TIMEZONE);


	function getWallentries(contactId) {
		// Lee el archivo wallentries_contactos_hoy.json y busca por contact_id
		if (!fs.existsSync(WALLENTRIES_FILE)) {
			console.log(`[DEBUG] Archivo de wallentries no encontrado: ${WALLENTRIES_FILE}`);
			return [];
		}
		const allWallentries = JSON.parse(fs.readFileSync(WALLENTRIES_FILE, 'utf8'));
		const entry = allWallentries.find(e => e.contact_id === contactId);
		const wallentries = entry ? entry.wallentries : [];
		console.log(`[DEBUG] Wallentries leídas de archivo para contactId ${contactId}:`, wallentries.length);
		return wallentries;
	}


	function isTodayArgentina(dateStr) {
		if (!dateStr) return false;
		const fechaArgentina = utcToZonedTime(new Date(dateStr), TIMEZONE);
		return isSameDay(fechaArgentina, todayArgentina);
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
			let prevWallentries = prev ? (Array.isArray(prev.wallentries) ? prev.wallentries : []): [];
			// Detectar tags nuevas
			const nuevasTags = contact.tags.filter(tag => !prevTags.includes(tag));
			console.log(`\nProcesando contacto ${contact.id} (${contact.tags.join(", ")})`);
			console.log('Tags previas:', prevTags);
			console.log('Tags nuevas:', nuevasTags);

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
				console.log('Usando wallentries previas:', prevWallentries.length);
			} else {
				// Hay tags nuevas, sumar solo las wallentries de esas tags (ya filtradas previamente)
				const wallentries = getWallentries(contact.id);
				console.log('Wallentries leídas del archivo:', wallentries.length);

				// Para cada tag nueva, buscar la primera wallentry que coincida con esa tag
				nuevasTags.forEach(tag => {
					let found = false;
					for (const w of wallentries) {
						const channelName = w.extra && w.extra.channel_name ? w.extra.channel_name : '';
						console.log(`[DEBUG] Comparando tag '${tag}' con channel_name '${channelName}' (wallentry id: ${w.id})`);
						if (channelName.toLowerCase().includes(tag.toLowerCase())) {
							if (!wallentriesFinal.some(we => we.id === w.id)) {
								wallentriesFinal.push(w);
								console.log(`[DEBUG] Agregada wallentry id ${w.id} para tag '${tag}'`);
							}
							found = true;
							break;
						}
					}
					if (!found) {
						console.log(`[DEBUG] No se encontró wallentry para tag '${tag}'`);
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

	// Guardar debug de contactos que no tienen ninguna wallentry válida
	const contactosFuera = processedContacts.filter(c => !c.wallentries || c.wallentries.length === 0);
	const fueraPath = path.join(__dirname, '../datos/contactos_fuera_wallentries.json');
	fs.writeFileSync(fueraPath, JSON.stringify(contactosFuera, null, 2), 'utf-8');
	console.log(`Contactos fuera de wallentries (sin ninguna válida): ${contactosFuera.length}`);
	console.log('Archivo de debug de excluidos en:', fueraPath);
	}

	main();
