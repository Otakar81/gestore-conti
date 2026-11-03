let datiHome = null;
const setText = (id, value) => { document.getElementById(id).textContent = value; };

async function caricaSintesi() {
    const button = document.getElementById("btn-refresh");
    const status = document.getElementById("statusMessage");
    button.disabled = true;
    status.textContent = "Lettura da Google Sheets in corso…";
    status.classList.remove("error");
    try {
        const dati = await Conti.carica();
        const totale = righe => righe.reduce((sum, riga) => sum + riga.importo, 0);
        const euro = cents => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" }).format(cents / 100);
        const scoperte = dati.spese.filter(riga => riga.importo > Object.values(riga.pagamenti).reduce((sum, value) => sum + value, 0));
        const sostenute = dati.spese.reduce((sum, riga) => sum + Object.values(riga.pagamenti).reduce((a, b) => a + b, 0), 0);
        setText("statTotaleSpese", euro(totale(dati.spese)));
        setText("statTotaleSuccessione", euro(totale(dati.spese.filter(riga => riga.ambito === "successione"))));
        setText("statTotaleImmobili", euro(totale(dati.spese.filter(riga => riga.ambito === "immobili"))));
        setText("statSpeseDaSostenere", euro(totale(dati.spese) - sostenute));
        setText("statSpeseScoperte", scoperte.length === 1 ? "Una spesa ancora da coprire" : `${scoperte.length} spese ancora da coprire`);
        setText("statIncassi", euro(totale(dati.incassi)));
        const mesi = [...dati.spese, ...dati.trasferimenti, ...dati.incassi].map(riga => riga.data).filter(Boolean).sort();
        const ultimoMese = mesi.at(-1);
        setText("statUltimoMese", ultimoMese ? new Intl.DateTimeFormat("it-IT", {month:"short", year:"numeric"}).format(new Date(Number(ultimoMese.slice(0, 4)), Number(ultimoMese.slice(5, 7)) - 1, 1)) : "—");
        setText("homeUpdated", `Ultima lettura riuscita: ${dati.lettoAlle.toLocaleString("it-IT")}`);
        status.textContent = dati.avvisi.length ? dati.avvisi.join(" ") : "Dati letti da Google Sheets. Trasferimenti e incassi sono consultabili nella dashboard completa.";
        status.classList.toggle("error", !dati.saldoDisponibile);
        datiHome = dati;
    } catch (error) {
        status.textContent = `${error.message} ${datiHome ? `Sintesi precedente del ${datiHome.lettoAlle.toLocaleString("it-IT")}, non aggiornata.` : "Sintesi non disponibile."}`;
        if (!datiHome) setText("homeUpdated", "Lettura non riuscita");
        status.classList.add("error");
    } finally { button.disabled = false; }
}

document.getElementById("btn-refresh").addEventListener("click", caricaSintesi);
document.addEventListener("DOMContentLoaded", caricaSintesi);
