/**
 * @name RandomPick
 * @description Adds a random-pick button to Discover and Library. Jumps to a random item among what's currently shown, respecting any filters from other plugins (folders, watched, etc.).
 * @updateUrl none
 * @version 1.1.0
 * @author M-1u
 */

(function () {
    const NS = "rp";

    // Shared micro-kit so multiple Stremio Enhanced plugins from the same
    // author don't each spin up their own document-wide MutationObserver,
    // duplicate the same DOM helpers, or inject the same CSS fix separately
    // when several of them are installed and enabled together. Defined once
    // by whichever of these plugins loads first; every other one just reuses
    // it. Still fully self-contained if this is the only one active.
    const sek = window.__sek || (function () {
        const ITEM_SELECTOR = 'a[class*="meta-item-container-"], div[class*="meta-item-container-"]';
        const waiters = [];
        let observer = null;

        function checkWaiters() {
            for (let i = waiters.length - 1; i >= 0; i--) {
                const w = waiters[i];
                const el = w.find();
                if (el) {
                    waiters.splice(i, 1);
                    w.resolve(el);
                }
            }
        }

        function ensureObserver() {
            if (observer) return;
            observer = new MutationObserver(checkWaiters);
            observer.observe(document.body, { childList: true, subtree: true });
        }

        function waitFor(find) {
            return new Promise((resolve) => {
                const existing = find();
                if (existing) return resolve(existing);
                waiters.push({ find, resolve });
                ensureObserver();
            });
        }

        const kit = {
            ITEM_SELECTOR,
            waitForElm(selector, root) {
                root = root || document;
                return waitFor(() => root.querySelector(selector));
            },
            findScoped(wrapperSelector, innerSelector) {
                const wrapper = document.querySelector(wrapperSelector);
                return wrapper ? wrapper.querySelector(innerSelector) : null;
            },
            waitForScoped(wrapperSelector, innerSelector) {
                return waitFor(() => kit.findScoped(wrapperSelector, innerSelector));
            },
            isWatched(el) {
                return !!el.querySelector('[class*="watched-icon-layer-"]');
            },
            extractItemId(el) {
                const href = el.getAttribute("href") || "";
                const match = href.match(/#\/detail\/[^/]+\/([^/]+)/);
                if (!match) return null;
                try { return decodeURIComponent(match[1]); } catch (e) { return match[1]; }
            },
            extractType(el) {
                const href = el.getAttribute("href") || "";
                const match = href.match(/#\/detail\/([^/]+)\//);
                return match ? match[1] : "other";
            },
            escapeHtml(str) {
                const div = document.createElement("div");
                div.textContent = str == null ? "" : String(str);
                return div.innerHTML;
            },
            ensureFilterRowWrap() {
                if (document.getElementById("sek-filter-wrap-fix")) return;
                const style = document.createElement("style");
                style.id = "sek-filter-wrap-fix";
                style.textContent = '[class*="selectable-inputs-container-"] { flex-wrap: wrap; row-gap: 10px; }';
                document.head.appendChild(style);
            },
            // One shared look for every icon-only button any of these plugins
            // adds to a filter row, sized/colored to match Stremio's own
            // square icon buttons (the filter/layout icons already there)
            // instead of each plugin inventing its own smaller, bordered
            // button style.
            ensureIconButtonStyle() {
                if (document.getElementById("sek-icon-btn-style")) return;
                const style = document.createElement("style");
                style.id = "sek-icon-btn-style";
                style.textContent = `
                    .sek-icon-btn { display: inline-flex; align-items: center; justify-content: center; align-self: center; width: 40px; height: 40px; vertical-align: middle; background: rgba(255,255,255,0.08); color: #e4e4e9; border: none; border-radius: 10px; cursor: pointer; transition: background .15s ease, color .15s ease, transform .1s ease; user-select: none; flex-shrink: 0; }
                    .sek-icon-btn svg { width: 18px; height: 18px; flex-shrink: 0; }
                    .sek-icon-btn:hover { background: rgba(255,255,255,0.16); color: #fff; }
                    .sek-icon-btn:active { transform: scale(0.94); }
                    .sek-icon-btn.sek-icon-btn-active { background: rgba(123,91,245,0.35); color: #fff; }
                `;
                document.head.appendChild(style);
            },
            // On Library, the sort tabs ("A-Z", "Watched", etc.) live inside
            // one single horizontally-scrolling wrapper, not as separate flex
            // items - so appending our buttons after it always pushes them
            // onto their own wrapped line below, even when there's visible
            // room left. Inserting before that wrapper instead lets our
            // buttons share the same line as the sort tabs, since the
            // wrapper can shrink/scroll internally rather than needing fixed
            // space of its own.
            insertBeforeChips(inputsContainer, el) {
                const chips = inputsContainer.querySelector('[class*="horizontal-scroll-"]');
                if (chips) {
                    inputsContainer.insertBefore(el, chips);
                } else {
                    inputsContainer.appendChild(el);
                }
            },
            // Lets other plugins react to CollapsibleFilters' collapsed/expanded
            // state (e.g. also shrinking their own UI) without any direct
            // dependency between the plugin files - CollapsibleFilters calls
            // notifyFiltersCollapsedChanged() whenever the user toggles it,
            // and interested plugins subscribe via onFiltersCollapsedChanged().
            FILTERS_COLLAPSED_KEY: "stremio-enhanced-filters-collapsed",
            isFiltersCollapsed() {
                return localStorage.getItem(this.FILTERS_COLLAPSED_KEY) === "true";
            },
            notifyFiltersCollapsedChanged() {
                window.dispatchEvent(new CustomEvent("sek:filters-collapsed-changed"));
            },
            onFiltersCollapsedChanged(cb) {
                window.addEventListener("sek:filters-collapsed-changed", cb);
                return () => window.removeEventListener("sek:filters-collapsed-changed", cb);
            }
        };

        window.__sek = kit;
        return kit;
    })();

    const ITEM_SELECTOR = sek.ITEM_SELECTOR;

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
            .${NS}-btn { margin-left: 8px; }
            .${NS}-btn.${NS}-spin svg { animation: ${NS}-spin 0.5s ease; }
            @keyframes ${NS}-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            .${NS}-flash { outline: 3px solid #7B5BF5 !important; outline-offset: 2px; border-radius: 8px; animation: ${NS}-pulse 0.6s ease; }
            @keyframes ${NS}-pulse { 0% { box-shadow: 0 0 0 0 rgba(123,91,245,0.7); } 100% { box-shadow: 0 0 0 14px rgba(123,91,245,0); } }
        `;
        document.head.appendChild(style);
        sek.ensureFilterRowWrap();
        sek.ensureIconButtonStyle();
    }

    const waitForElm = sek.waitForElm;

    // ".selectable-inputs-container" is used by both Discover and Library
    // (each has its own filter row with that exact class name). The shared
    // kit's scoped lookup makes sure we never grab the wrong page's element.
    const waitForScopedInputsContainer = (wrapperSelector) =>
        sek.waitForScoped(wrapperSelector, '[class*="selectable-inputs-container-"]');

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
            btn.className = `sek-icon-btn ${NS}-btn`;
            btn.title = "Random pick";
            btn.innerHTML = ICON_DICE;
            sek.insertBeforeChips(inputsContainer, btn);
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
