

	import fs from 'fs';
	import path from 'path';
	import { fileURLToPath } from 'url';

	const __filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(__filename);

	const CONTACTS_FILE = path.join(__dirname, '../datos/contactos_hoy.json');
	const OUTPUT_FILE = path.join(__dirname, '../datos/contactos_a_descargar_wallentries.json');
	const DEBUG_FILE = path.join(__dirname, '../datos/debug_wallentries.json');
	const FUERA_FILE = path.join(__dirname, '../datos/contactos_fuera_wallentries.json');

	async function main() {
		const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
		let totalSinWallentries = 0;
		let totalAProcesar = 0;
		let totalTagsNuevas = 0;

		// Leer contactos previos procesados (si existe)
		let prevContacts = [];
		if (fs.existsSync(OUTPUT_FILE)) {
			try {
				prevContacts = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
			} catch (e) {
				prevContacts = [];
			}
		}

		const debugWallentries = [];
		const contactosADescargar = [];
		const contactosFuera = [];

		for (const contact of contacts) {
			if (!Array.isArray(contact.tags) || contact.tags.length <= 1) {
				// Contactos con 0 o 1 tag: fuera del procesamiento principal
				contactosFuera.push({ id: contact.id, tags: contact.tags });
				totalSinWallentries++;
				debugWallentries.push({
					id: contact.id,
					tags: contact.tags,
					motivo: '0 o 1 tag, omitido',
					tags_nuevas: [],
				});
				continue;
			}

			// Buscar contacto previo
			const prev = prevContacts.find(c => c.id === contact.id);
			let prevTags = prev ? prev.tags : [];
			// Detectar tags nuevas
			const nuevasTags = contact.tags.filter(tag => !prevTags.includes(tag));

			if (nuevasTags.length === 0) {
				// No hay tags nuevas, no requiere descarga
				debugWallentries.push({
					id: contact.id,
					tags: contact.tags,
					motivo: 'Sin tags nuevas, no requiere descarga',
					tags_nuevas: [],
				});
				continue;
			}

			// Hay tags nuevas, agregar a la lista de descarga
			contactosADescargar.push({ id: contact.id, tags: contact.tags, tags_nuevas: nuevasTags });
			totalAProcesar++;
			totalTagsNuevas += nuevasTags.length;
			debugWallentries.push({
				id: contact.id,
				tags: contact.tags,
				motivo: 'Requiere descarga de wallentries',
				tags_nuevas: nuevasTags,
			});
		}

			fs.writeFileSync(OUTPUT_FILE, JSON.stringify(contactosADescargar, null, 2), 'utf-8');
			fs.writeFileSync(DEBUG_FILE, JSON.stringify(debugWallentries, null, 2), 'utf-8');
			fs.writeFileSync(FUERA_FILE, JSON.stringify(contactosFuera, null, 2), 'utf-8');

			const totalContactosDia = contacts.length;
			console.log('Procesamiento finalizado.');
			console.log('Contactos procesados en el día:', totalContactosDia);
			console.log('Contactos a descargar wallentries:', totalAProcesar);
			console.log('Total tags nuevas a descargar:', totalTagsNuevas);
			console.log('Contactos fuera de procesamiento:', totalSinWallentries);
			console.log('Archivos generados:');
			console.log('-', OUTPUT_FILE);
			console.log('-', DEBUG_FILE);
			console.log('-', FUERA_FILE);
	}

	main();
