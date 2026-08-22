/**
 * @name RandomPick
 * @description Adds a random-pick button to Discover and Library. Jumps to a random item among what's currently shown, respecting any filters from other plugins (folders, watched, etc.).
 * @updateUrl none
 * @version 1.0.0
 * @author meli & Claude
 */

(function () {
    const NS = "rp";
    const ITEM_SELECTOR = 'a[class*="meta-item-container-"], div[class*="meta-item-container-"]';

    const ICON_DICE = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="1.4" fill="currentColor"/><circle cx="16" cy="8" r="1.4" fill="currentColor"/><circle cx="8" cy="16" r="1.4" fill="currentColor"/><circle cx="16" cy="16" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>`;

    const log = (msg) => {
        if (window.StremioEnhancedAPI && window.StremioEnhancedAPI.logger) {
            window.StremioEnhancedAPI.logger.info(msg);
        } else {
            console.log(`[RandomPick] ${msg}`);
        }
    };

    function injectStyles() {
        if (document.getElementById(`${NS}-styles`)) return;
        const style = document.createElement("style");
        style.id = `${NS}-styles`;
        style.textContent = `
            .${NS}-btn { display: inline-flex; align-items: center; gap: 7px; background: rgba(255,255,255,0.06); color: #e4e4e9; border: 1px solid rgba(255,255,255,0.12); border-radius: 7px; padding: 7px 14px; font-size: 13px; font-weight: 500; cursor: pointer; transition: background .15s ease, border-color .15s ease, color .15s ease, transform .1s ease; user-select: none; white-space: nowrap; flex-shrink: 0; margin-left: 1.5rem; }
            .${NS}-btn svg { width: 15px; height: 15px; flex-shrink: 0; }
            .${NS}-btn:hover { background: rgba(123,91,245,0.18); border-color: rgba(123,91,245,0.5); color: #fff; }
            .${NS}-btn:active { transform: scale(0.96); }
            .${NS}-btn.${NS}-spin svg { animation: ${NS}-spin 0.5s ease; }
            @keyframes ${NS}-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .${NS}-flash { outline: 3px solid #7B5BF5 !important; outline-offset: 2px; border-radius: 8px; animation: ${NS}-pulse 0.6s ease; }
            @keyframes ${NS}-pulse { 0% { box-shadow: 0 0 0 0 rgba(123,91,245,0.7); } 100% { box-shadow: 0 0 0 14px rgba(123,91,245,0); } }

            /* Multiple plugins append buttons to Stremio's own filter row,
               which doesn't wrap by default - without this, extra buttons
               get squeezed instead of flowing onto a new line. */
            [class*="selectable-inputs-container-"] { flex-wrap: wrap !important; row-gap: 10px; }
        `;
        document.head.appendChild(style);
    }

    function waitForElm(selector, root = document) {
        return new Promise((resolve) => {
            const existing = root.querySelector(selector);
            if (existing) return resolve(existing);

            const observer = new MutationObserver(() => {
                const el = root.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
        });
    }

    // ".selectable-inputs-container" is used by both Discover and Library
    // (each has its own filter row with that exact class name). We scope the
    // search to whichever page's own top-level wrapper is relevant, rather
    // than trusting the first match in the whole document, to avoid ever
    // grabbing the wrong page's element.
    function findScopedInputsContainer(wrapperSelector) {
        const candidates = document.querySelectorAll('[class*="selectable-inputs-container-"]');
        for (const el of candidates) {
            if (el.closest(wrapperSelector)) return el;
        }
        return null;
    }

    function waitForScopedInputsContainer(wrapperSelector) {
        return new Promise((resolve) => {
            const existing = findScopedInputsContainer(wrapperSelector);
            if (existing) return resolve(existing);

            const observer = new MutationObserver(() => {
                const el = findScopedInputsContainer(wrapperSelector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    function pickRandomItem(itemsContainer) {
        const items = Array.from(itemsContainer.querySelectorAll(ITEM_SELECTOR)).filter((el) => el.style.display !== "none");
        if (items.length === 0) return null;
        return items[Math.floor(Math.random() * items.length)];
    }

    function onPick(itemsContainer, btn) {
        const el = pickRandomItem(itemsContainer);
        if (!el) return;

        btn.classList.remove(`${NS}-spin`);
        void btn.offsetWidth; // restart the spin animation even on repeated clicks
        btn.classList.add(`${NS}-spin`);

        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.remove(`${NS}-flash`);
        void el.offsetWidth;
        el.classList.add(`${NS}-flash`);

        // Give the user a beat to see which card got picked before jumping to it.
        setTimeout(() => {
            el.classList.remove(`${NS}-flash`);
            el.click();
        }, 650);
    }

    let cleanupFns = [];

    function runCleanup() {
        cleanupFns.forEach((fn) => {
            try { fn(); } catch (e) { /* ignore */ }
        });
        cleanupFns = [];
        document.getElementById(`${NS}-btn`)?.remove();
    }

    const ROUTES = [
        { hashPrefix: "#/discover", wrapperSelector: '[class*="discover-container-"]' },
        { hashPrefix: "#/library", wrapperSelector: '[class*="library-container-"]' }
    ];

    function matchRoute() {
        return ROUTES.find((r) => location.hash.startsWith(r.hashPrefix)) || null;
    }

    let initGeneration = 0;

    async function initView(route, myGeneration) {
        injectStyles();

        const inputsContainer = await waitForScopedInputsContainer(route.wrapperSelector);
        if (myGeneration !== initGeneration || matchRoute() !== route) return;

        const catalogContainer = inputsContainer.parentElement;
        const itemsContainer = await waitForElm('[class*="meta-items-container-"]', catalogContainer);
        if (myGeneration !== initGeneration || matchRoute() !== route) return;

        let btn = document.getElementById(`${NS}-btn`);
        if (!btn) {
            btn = document.createElement("span");
            btn.id = `${NS}-btn`;
            btn.className = `${NS}-btn`;
            btn.innerHTML = `${ICON_DICE}<span>Random pick</span>`;
            inputsContainer.appendChild(btn);
        }

        const clickHandler = () => onPick(itemsContainer, btn);
        btn.addEventListener("click", clickHandler);
        cleanupFns.push(() => btn.removeEventListener("click", clickHandler));
    }

    let currentRouteKey = null;

    function onRouteChange() {
        const route = matchRoute();
        const routeKey = route ? route.hashPrefix : null;

        // Changing type/genre/sort filters within the same page just swaps
        // the item list - no need to tear the button down and rebuild it.
        if (routeKey && routeKey === currentRouteKey) return;

        currentRouteKey = routeKey;
        initGeneration++;
        runCleanup();
        if (route) {
            initView(route, initGeneration).catch((e) => log("Error initializing: " + e.message));
        }
    }

    window.addEventListener("hashchange", onRouteChange);
    onRouteChange();

    log("Random Pick plugin loaded.");
})();
