/* Lettura e regole economiche condivise da home, dashboard e PDF. */
const Conti = (() => {
    const CONFIG = {
        sheetId: "1XRO1_HwzBbxTo1Tfr5xOe0v5FcubNXYM-GiBOznePtU",
        timeoutMs: 20000
    };
    const TABS = ["Eredi", "Spese successione", "Spese Cetraro", "Trasferimenti", "Incassi"];
    const vuoto = value => value == null || String(value).trim() === "";
    const testo = value => vuoto(value) ? "" : String(value).trim();
    const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g,
        char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
    const euro = value => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
    const somma = values => values.reduce((total, value) => total + value, 0);

    function errore(contesto, message) {
        throw new Error(`${contesto}: ${message}`);
    }

    function numero(value, contesto) {
        if (vuoto(value)) errore(contesto, "valore obbligatorio mancante");
        if (typeof value === "string") {
            const input = value.trim();
            if (!/^-?(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+,\d+)$/.test(input)) {
                errore(contesto, "numero non valido");
            }
            value = input.includes(",") ? input.replaceAll(".", "").replace(",", ".") : input;
        }
        const result = Number(value);
        if (!Number.isFinite(result) || result < 0 || typeof value === "boolean") {
            errore(contesto, "serve un numero non negativo; storni non supportati");
        }
        return result;
    }

    function centesimi(value, contesto, facoltativo = false) {
        if (facoltativo && vuoto(value)) return 0;
        const scaled = numero(value, contesto) * 100;
        const rounded = Math.round(scaled);
        if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 0.000001) {
            errore(contesto, "importo fuori limite o con più di due decimali");
        }
        return rounded;
    }

    function data(value, contesto, conGiorno = false) {
        if (vuoto(value)) return "";
        const raw = testo(value);
        const google = raw.match(/^Date\((\d{4}),(\d{1,2}),(\d{1,2})(?:,0,0,0)?\)$/);
        const iso = raw.match(/^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?$/);
        const italiana = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        let year, month, day;
        if (google) [year, month, day] = [Number(google[1]), Number(google[2]) + 1, Number(google[3])];
        else if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3] || 1)];
        else if (italiana) [year, month, day] = [Number(italiana[3]), Number(italiana[2]), Number(italiana[1])];
        else errore(contesto, "data non valida (usare una data Google o AAAA/MM)");
        const check = new Date(year, month - 1, day);
        if (year < 1900 || check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
            errore(contesto, "data non valida");
        }
        return `${year}/${String(month).padStart(2, "0")}${conGiorno ? `/${String(day).padStart(2, "0")}` : ""}`;
    }

    function parseGviz(text, tab) {
        // Il wrapper non è JSON: estrarre il payload senza eseguire codice remoto.
        const match = text.match(/^\s*(?:\/\*[\s\S]*?\*\/\s*)?google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
        if (!match) errore(tab, "risposta inattesa o foglio non accessibile senza login");
        let payload;
        try { payload = JSON.parse(match[1]); }
        catch { errore(tab, "risposta Google non valida"); }
        if (payload.status !== "ok" || !payload.table || !Array.isArray(payload.table.cols) || !Array.isArray(payload.table.rows)) {
            errore(tab, payload.errors?.map(item => item.detailed_message || item.message).join("; ") || "tab non leggibile");
        }
        return payload.table;
    }

    function righe(table, tab, richieste) {
        if (!table || !Array.isArray(table.cols) || !Array.isArray(table.rows)) errore(tab, "tab assente o risposta non valida");
        const headers = table.cols.map(col => testo(col.label));
        if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) errore(tab, "intestazioni duplicate");
        for (const name of richieste) if (!headers.includes(name)) errore(tab, `colonna mancante: ${name}`);
        for (const name of headers) if (name && !richieste.includes(name)) errore(tab, `colonna sconosciuta: ${name}`);
        return table.rows.flatMap((row, index) => {
            const cells = row.c || [];
            if (cells.every(cell => vuoto(cell?.v) && vuoto(cell?.f))) return [];
            if (cells.some((cell, col) => !headers[col] && (!vuoto(cell?.v) || !vuoto(cell?.f)))) {
                errore(`${tab}, riga ${index + 2}`, "valore in una colonna senza intestazione");
            }
            // shortcut: gviz può omettere tipi discordanti; convalidare i numeri nel foglio, cambiare endpoint se servono celle miste.
            const values = Object.fromEntries(headers.map((name, col) => [name, cells[col]?.v ?? cells[col]?.f ?? null]));
            return [{ values, contesto: `${tab}, riga ${index + 2}` }];
        });
    }

    function normalizza(tables, vista = "completa") {
        if (!["successione", "immobili", "completa"].includes(vista)) errore("Vista", "non riconosciuta");
        const erediRows = righe(tables.Eredi, "Eredi", ["Nome", "Quota concordata", "Quota di proprietà"]);
        if (!erediRows.length) errore("Eredi", "nessun erede");
        const eredi = erediRows.map(({ values, contesto }) => {
            const name = testo(values.Nome);
            if (!name) errore(contesto, "nome mancante");
            return name;
        });
        if (new Set(eredi).size !== eredi.length) errore("Eredi", "nomi duplicati");
        const quote = {};
        for (const [tipo, col] of [["Concordata", "Quota concordata"], ["Proprietà", "Quota di proprietà"]]) {
            const weights = erediRows.map(({ values, contesto }) => numero(values[col], `${contesto}, ${col}`));
            if (weights.some(value => value > 1) || Math.abs(somma(weights) - 1) > 0.00000001) {
                errore("Eredi", `${col}: usare frazioni (0,2 = 20%) con somma 100%`);
            }
            quote[tipo] = weights.map(value => Math.round(value * 100000000));
            if (somma(quote[tipo]) !== 100000000) errore("Eredi", `${col}: precisione massima otto decimali`);
        }
        const ripartizione = (values, contesto) => {
            const tipo = testo(values.Ripartizione);
            if (!Object.hasOwn(quote, tipo)) errore(contesto, "Ripartizione deve essere Concordata o Proprietà");
            return tipo;
        };
        const pagamenti = (values, contesto) => Object.fromEntries(eredi.map(name =>
            [name, centesimi(values[name], `${contesto}, ${name}`, true)]));
        const spese = [];
        for (const tab of vista === "successione" ? [TABS[1]] : vista === "immobili" ? [TABS[2]] : TABS.slice(1, 3)) {
            for (const { values, contesto } of righe(tables[tab], tab,
                ["Categoria", "Creditore", "Descrizione", "Data", "Importo", "Ripartizione", ...eredi])) {
                const importo = centesimi(values.Importo, `${contesto}, Importo`);
                if (![values.Categoria, values.Creditore, values.Descrizione].every(value => !vuoto(value))) {
                    errore(contesto, "categoria, creditore e descrizione obbligatori");
                }
                const anticipi = pagamenti(values, contesto);
                if (somma(Object.values(anticipi)) > importo) errore(contesto, "anticipazioni superiori alla spesa");
                spese.push({ categoria: testo(values.Categoria), creditore: testo(values.Creditore),
                    descrizione: testo(values.Descrizione), data: data(values.Data, contesto),
                    importo, pagamenti: anticipi, ripartizione: ripartizione(values, contesto),
                    ambito: tab === TABS[1] ? "successione" : "immobili", contesto });
            }
        }
        const trasferimenti = [], incassi = [], avvisi = [];
        if (vista === "completa") {
            for (const { values, contesto } of righe(tables.Trasferimenti, "Trasferimenti", ["Data", "Da", "A", "Importo", "Note"])) {
                const da = testo(values.Da), a = testo(values.A);
                if (!eredi.includes(da) || !eredi.includes(a) || da === a) errore(contesto, "mittente e destinatario devono essere eredi distinti");
                const importo = centesimi(values.Importo, contesto), quando = data(values.Data, contesto);
                if (!importo || !quando) errore(contesto, "data e importo positivo obbligatori");
                trasferimenti.push({ da, a, importo, data: quando, note: testo(values.Note) });
            }
            const ids = new Set();
            for (const { values, contesto } of righe(tables.Incassi, "Incassi",
                ["ID", "Data", "Tipo", "Descrizione", "Periodo", "Importo da ripartire", "Ripartizione", ...eredi, "Note"])) {
                const id = testo(values.ID), quando = data(values.Data, contesto), tipo = testo(values.Tipo);
                if (!id || ids.has(id) || !quando || !tipo) errore(contesto, "ID univoco, data e tipo obbligatori");
                ids.add(id);
                const oggi = new Date();
                const giornoCorrente = `${oggi.getFullYear()}/${String(oggi.getMonth() + 1).padStart(2, "0")}/${String(oggi.getDate()).padStart(2, "0")}`;
                if (data(values.Data, contesto, true) > giornoCorrente) errore(contesto, "registrare solo incassi effettivi, non date future");
                if (vuoto(values.Descrizione)) errore(contesto, "descrizione obbligatoria");
                const importo = centesimi(values["Importo da ripartire"], contesto), ricevuti = pagamenti(values, contesto);
                const attribuito = somma(Object.values(ricevuti));
                if (!importo || attribuito > importo) errore(contesto, "importo positivo richiesto e ricevuti non superiori al totale");
                if (attribuito < importo) avvisi.push(`${contesto} (${id}): ${euro((importo - attribuito) / 100)} da attribuire; saldo generale non disponibile.`);
                incassi.push({ id, data: quando, tipo, descrizione: testo(values.Descrizione), periodo: testo(values.Periodo),
                    note: testo(values.Note), importo, pagamenti: ricevuti, ripartizione: ripartizione(values, contesto) });
            }
        }
        // A parità di resto ruotare i destinatari evita di assegnare ogni centesimo al primo erede.
        const cursori = {};
        for (const riga of [...spese, ...incassi]) {
            const gruppo = `${riga.ambito || "incassi"}/${riga.ripartizione}`;
            const cursor = cursori[gruppo] || 0;
            const result = ripartisci(riga.importo, quote[riga.ripartizione], cursor);
            riga.quote = Object.fromEntries(eredi.map((name, index) => [name, result.importi[index]]));
            cursori[gruppo] = result.cursor;
        }
        return { vista, eredi, quote, spese, trasferimenti, incassi, avvisi, saldoDisponibile: !avvisi.length };
    }

    function ripartisci(importo, weights, cursor = 0) {
        const totale = somma(weights);
        const prodotti = weights.map(weight => BigInt(importo) * BigInt(weight));
        const importi = prodotti.map(value => Number(value / BigInt(totale)));
        const resti = prodotti.map(value => Number(value % BigInt(totale)));
        const residui = importo - somma(importi);
        const ordine = weights.map((_, index) => index).sort((a, b) =>
            resti[b] - resti[a] || ((a - cursor + weights.length) % weights.length) - ((b - cursor + weights.length) % weights.length));
        for (let i = 0; i < residui; i++) importi[ordine[i]]++;
        return { importi, cursor: residui ? (ordine[residui - 1] + 1) % weights.length : cursor };
    }

    function saldo(dati, erede) {
        const dovuto = somma(dati.spese.map(riga => riga.quote[erede]));
        const pagato = somma(dati.spese.map(riga => riga.pagamenti[erede]));
        const trasferimentiRicevuti = somma(dati.trasferimenti.filter(riga => riga.a === erede).map(riga => riga.importo));
        const trasferimentiInviati = somma(dati.trasferimenti.filter(riga => riga.da === erede).map(riga => riga.importo));
        const incassiRicevuti = somma(dati.incassi.map(riga => riga.pagamenti[erede]));
        const incassiSpettanti = somma(dati.incassi.map(riga => riga.quote[erede]));
        const netto = dati.saldoDisponibile ? dovuto - pagato + trasferimentiRicevuti - trasferimentiInviati + incassiRicevuti - incassiSpettanti : null;
        return { erede, dovuto, pagato, trasferimentiRicevuti, trasferimentiInviati, incassiRicevuti, incassiSpettanti, saldo: netto };
    }

    async function leggiTab(tab) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);
        try {
            const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&headers=1&sheet=${encodeURIComponent(tab)}&_=${Date.now()}`;
            const response = await fetch(url, { signal: controller.signal, cache: "no-store", credentials: "omit" });
            if (!response.ok) errore(tab, `HTTP ${response.status}`);
            return parseGviz(await response.text(), tab);
        } catch (error) {
            if (error.name === "AbortError") errore(tab, "tempo di attesa scaduto; riprovare");
            throw new Error(`${tab}: lettura fallita. ${error.message}`);
        } finally { clearTimeout(timeout); }
    }

    async function carica(vista = "completa") {
        const tabs = vista === "successione" ? TABS.slice(0, 2) : vista === "immobili" ? [TABS[0], TABS[2]] : TABS;
        const risultati = await Promise.all(tabs.map(async tab => [tab, await leggiTab(tab)]));
        const result = normalizza(Object.fromEntries(risultati), vista);
        result.lettoAlle = new Date();
        return result;
    }

    return { CONFIG, carica, normalizza, parseGviz, saldo, ripartisci, centesimi, data, escapeHtml, euro };
})();
if (typeof module !== "undefined") module.exports = Conti;
