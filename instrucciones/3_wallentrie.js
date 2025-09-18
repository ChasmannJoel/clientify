const fs = require('fs');
const fetch = require('node-fetch');

const path = require('path');
const CONTACTS_FILE = path.join(__dirname, '../datos/contactos_hoy.json');
const OUTPUT_FILE = path.join(__dirname, '../datos/contactos_wallentries.json');
const DEBUG_FILE = path.join(__dirname, '../datos/debug_wallentries.json');
const API_TOKEN = 'c464da16552a931e1a4c5a6d65fee1e6c7ea422d';

const CACHE_VERSION = 1;

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

function normalizeTags(tags) {
        if (!Array.isArray(tags)) return [];
        return Array.from(new Set(tags.filter(Boolean)));
}

function areTagSetsEqual(tagsA, tagsB) {
        if (tagsA.length !== tagsB.length) return false;
        const setB = new Set(tagsB);
        return tagsA.every((tag) => setB.has(tag));
}

function loadJsonFile(filePath, fallback) {
        try {
                if (!fs.existsSync(filePath)) {
                        return fallback;
                }
                const raw = fs.readFileSync(filePath, 'utf8');
                if (!raw.trim()) {
                        return fallback;
                }
                const parsed = JSON.parse(raw);
                return parsed;
        } catch (error) {
                console.warn(`No se pudo leer ${filePath}: ${error.message}`);
                return fallback;
        }
}

async function getWallentries(contactId, tag = null) {
        const searchParams = new URLSearchParams();
        if (tag) {
                searchParams.set('tag', tag);
        }
        const url = `https://api-plus.clientify.com/v2/contacts/${contactId}/wallentries${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

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
                                console.warn(`(Wallentries) Contacto ${contactId}${tag ? ` [tag: ${tag}]` : ''} - respuesta inválida (status ${res.status}). Fragmento: ${snippet}`);

                                if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
                                        await scheduleRetry(contactId, attempt, tag);
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
                                console.warn(`(Wallentries) Contacto ${contactId}${tag ? ` [tag: ${tag}]` : ''} - error al parsear JSON: ${parseError.message}. Fragmento: ${snippet}`);
                                if (attempt < MAX_RETRIES) {
                                        await scheduleRetry(contactId, attempt, tag);
                                        continue;
                                }
                                return [];
                        }

                        if (!data || !Array.isArray(data.results)) {
                                console.warn(`(Wallentries) Contacto ${contactId}${tag ? ` [tag: ${tag}]` : ''} - respuesta sin 'results' válido. Fragmento: ${snippet}`);
                                return [];
                        }

                        return data.results;
                } catch (error) {
                        console.error(`(Wallentries) Error al consultar contacto ${contactId}${tag ? ` [tag: ${tag}]` : ''}: ${error.message}`);
                        if (attempt < MAX_RETRIES) {
                                await scheduleRetry(contactId, attempt, tag);
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

async function scheduleRetry(contactId, attempt, tag) {
        const jitter = Math.random() * RETRY_JITTER_MS;
        const waitMs = Math.round(getBackoffDelay(attempt) + jitter);
        console.log(`(Wallentries) Reintentando contacto ${contactId}${tag ? ` [tag: ${tag}]` : ''} en ${waitMs}ms (intento ${attempt + 1} de ${MAX_RETRIES}).`);
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
        const fechaOriginal = new Date(dateStr);
        const utc = fechaOriginal.getTime() + (fechaOriginal.getTimezoneOffset() * 60000);
        const argentina = new Date(utc - (3 * 60 * 60 * 1000));
        const fecha = argentina.toISOString().slice(0, 10);
        return fecha === TODAY;
}

function filterValidWallentries(entries) {
        if (!Array.isArray(entries)) return [];
        return entries.filter((w) => w && w.type !== 'contact_creation_from_inbox' && isTodayArgentina(w.created));
}

function dedupeWallentries(entries) {
        if (!Array.isArray(entries)) return [];
        const seen = new Set();
        const result = [];
        for (const entry of entries) {
                if (!entry || typeof entry !== 'object') continue;
                const key = entry.id != null ? `id:${entry.id}` : `raw:${JSON.stringify(entry)}`;
                if (seen.has(key)) continue;
                seen.add(key);
                result.push(entry);
        }
        return result;
}

function cloneByTag(byTag) {
        const clone = {};
        if (!byTag || typeof byTag !== 'object') {
                return clone;
        }
        for (const [tag, entries] of Object.entries(byTag)) {
                clone[tag] = Array.isArray(entries) ? entries.slice() : [];
        }
        return clone;
}

async function main() {
        const contacts = loadJsonFile(CONTACTS_FILE, []);
        if (!Array.isArray(contacts)) {
                throw new Error('El archivo de contactos no contiene un array válido');
        }

        const previousContacts = loadJsonFile(OUTPUT_FILE, []);
        const previousMap = new Map();
        if (Array.isArray(previousContacts)) {
                for (const contact of previousContacts) {
                        if (contact && typeof contact.id !== 'undefined') {
                                previousMap.set(contact.id, contact);
                        }
                }
        }

        const debugRecords = [];
        console.log('Iniciando procesamiento de contactos:', contacts.length);

        const processedContacts = await processContactsWithLimit(contacts, CONCURRENCY_LIMIT, async (contact, idx) => {
                const currentTags = normalizeTags(contact.tags);
                const debugRecord = {
                        index: idx + 1,
                        contactId: contact.id,
                        totalTags: currentTags.length,
                        tags: currentTags,
                };

                if (currentTags.length === 0) {
                        contact.wallentries = [];
                        contact.wallentriesByTag = {};
                        contact.wallentriesCacheVersion = CACHE_VERSION;
                        debugRecord.action = 'sin_tags';
                        debugRecord.wallentriesCount = 0;
                        console.log(`[${idx + 1}/${contacts.length}] Contacto ${contact.id} sin tags, no se consulta la API.`);
                        debugRecords.push(debugRecord);
                        return contact;
                }

                const previous = previousMap.get(contact.id);
                const previousTags = normalizeTags(previous ? previous.tags : []);

                if (
                        previous &&
                        previous.wallentriesCacheVersion === CACHE_VERSION &&
                        Array.isArray(previous.wallentries) &&
                        areTagSetsEqual(currentTags, previousTags)
                ) {
                        const reused = filterValidWallentries(previous.wallentries);
                        contact.wallentries = reused;
                        contact.wallentriesByTag = cloneByTag(previous.wallentriesByTag || {});
                        contact.wallentriesCacheVersion = CACHE_VERSION;
                        debugRecord.action = 'reutilizado';
                        debugRecord.reusedTags = currentTags;
                        debugRecord.wallentriesCount = reused.length;
                        console.log(`[${idx + 1}/${contacts.length}] Contacto ${contact.id}: tags sin cambios, se reutilizan ${reused.length} wallentries.`);
                        debugRecords.push(debugRecord);
                        return contact;
                }

                const hasCompatibleCache =
                        previous &&
                        previous.wallentriesCacheVersion === CACHE_VERSION &&
                        previous.wallentriesByTag &&
                        typeof previous.wallentriesByTag === 'object';

                const cachedByTag = hasCompatibleCache ? previous.wallentriesByTag : {};
                const reusedTags = hasCompatibleCache
                        ? currentTags.filter((tag) => Object.prototype.hasOwnProperty.call(cachedByTag, tag))
                        : [];

                let tagsToFetch;
                if (hasCompatibleCache) {
                        tagsToFetch = currentTags.filter((tag) => !Object.prototype.hasOwnProperty.call(cachedByTag, tag));
                } else {
                        tagsToFetch = currentTags;
                }

                const aggregatedByTag = {};
                for (const tag of reusedTags) {
                        aggregatedByTag[tag] = Array.isArray(cachedByTag[tag]) ? cachedByTag[tag].slice() : [];
                }

                const fetchSummary = [];
                for (const tag of tagsToFetch) {
                        console.log(`[${idx + 1}/${contacts.length}] Contacto ${contact.id}: consultando tag "${tag}"...`);
                        const rawEntries = await getWallentries(contact.id, tag);
                        const validEntries = filterValidWallentries(rawEntries);
                        aggregatedByTag[tag] = dedupeWallentries([...(aggregatedByTag[tag] || []), ...validEntries]);
                        fetchSummary.push({
                                tag,
                                fetched: Array.isArray(rawEntries) ? rawEntries.length : 0,
                                valid: validEntries.length,
                        });
                }

                for (const tag of currentTags) {
                        if (!aggregatedByTag[tag]) {
                                aggregatedByTag[tag] = [];
                        }
                }

                const flattened = [].concat(...Object.values(aggregatedByTag));
                const filtered = filterValidWallentries(flattened);
                const deduped = dedupeWallentries(filtered);

                contact.wallentries = deduped;
                contact.wallentriesByTag = cloneByTag(aggregatedByTag);
                contact.wallentriesCacheVersion = CACHE_VERSION;

                debugRecord.action = 'actualizado';
                debugRecord.reusedTags = reusedTags;
                debugRecord.fetchedTags = tagsToFetch;
                debugRecord.removedTags = previousTags.filter((tag) => !currentTags.includes(tag));
                debugRecord.wallentriesCount = deduped.length;
                debugRecord.fetchSummary = fetchSummary;
                debugRecord.cacheHit = hasCompatibleCache;

                console.log(
                        `[${idx + 1}/${contacts.length}] Contacto ${contact.id}: tags procesadas=${currentTags.length}, reusadas=${reusedTags.length}, consultadas=${tagsToFetch.length}, wallentries=${deduped.length}.`,
                );

                debugRecords.push(debugRecord);
                return contact;
        });

        const orderedDebug = debugRecords.sort((a, b) => a.index - b.index);
        const totalMensajes = processedContacts.reduce(
                (acc, c) => acc + (Array.isArray(c.wallentries) ? c.wallentries.length : 0),
                0,
        );

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(processedContacts, null, 2));
        fs.writeFileSync(
                DEBUG_FILE,
                JSON.stringify(
                        {
                                processedAt: new Date().toISOString(),
                                totalContacts: contacts.length,
                                totalWallentries: totalMensajes,
                                contacts: orderedDebug,
                        },
                        null,
                        2,
                ),
        );

        console.log('Procesamiento finalizado. Total mensajes hoy:', totalMensajes);
        console.log(`Archivo de depuración actualizado en: ${DEBUG_FILE}`);
}

main().catch((error) => {
        console.error('Error al procesar contactos:', error);
        process.exitCode = 1;
});
