if ("serviceWorker" in navigator) {
    let registration;
    const update = () => registration?.update().catch(error => console.warn("Aggiornamento app non disponibile:", error));
    window.addEventListener("load", async () => {
        try {
            registration = await navigator.serviceWorker.register("./service-worker.js", {
                scope: "./",
                updateViaCache: "none"
            });
        } catch (error) {
            console.warn("Installazione app non disponibile:", error);
        }
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") update();
    });
    window.addEventListener("pageshow", event => {
        if (event.persisted) update();
    });
}
