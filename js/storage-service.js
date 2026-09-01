import { app } from './utils.js';
import {
  PAGES_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  THEME_IDS,
  LANG_IDS,
  DEFAULT_PROFILE_IMG,
} from './constants.js';

let legacyMigrated = false;

function readJson(storage, key) {
    try {
        const raw = storage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

function writeJson(storage, key, value) {
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch (_) {
        /* quota / private mode */
    }
}

function removeKey(storage, key) {
    try {
        storage.removeItem(key);
    } catch (_) {
        /* ignore */
    }
}

/** 예전 localStorage 데이터를 sessionStorage로 옮긴 뒤 localStorage는 비운다. */
function migrateLegacyStorage() {
    if (legacyMigrated) return;
    legacyMigrated = true;

    try {
        const legacyPages = localStorage.getItem(PAGES_STORAGE_KEY);
        if (legacyPages && !sessionStorage.getItem(PAGES_STORAGE_KEY)) {
            sessionStorage.setItem(PAGES_STORAGE_KEY, legacyPages);
        }
        localStorage.removeItem(PAGES_STORAGE_KEY);
    } catch (_) {
        /* ignore */
    }

    try {
        const legacyLocal = readJson(localStorage, SETTINGS_STORAGE_KEY);
        const legacySplitSession = readJson(sessionStorage, 'thinkingnote-session');
        const sessionSettings = readJson(sessionStorage, SETTINGS_STORAGE_KEY);
        if (!sessionSettings && (legacyLocal || legacySplitSession)) {
            writeJson(sessionStorage, SETTINGS_STORAGE_KEY, {
                ...getDefaultSettings(),
                ...(legacyLocal || {}),
                ...(legacySplitSession || {}),
            });
        }
        localStorage.removeItem(SETTINGS_STORAGE_KEY);
        localStorage.removeItem('thinkingnote-session');
        sessionStorage.removeItem('thinkingnote-session');
    } catch (_) {
        /* ignore */
    }
}

export function getPageMeta(id) {
    if (!app.pageMeta.has(id)) app.pageMeta.set(id, { updatedAt: Date.now(), pinned: false, orderBeforePin: null });
    return app.pageMeta.get(id);
}

export function touchPage(id) {
    getPageMeta(id).updatedAt = Date.now();
    scheduleSaveAppState();
}

export function scheduleSaveAppState() {
    if (app.suppressPagesSave) return;
    clearTimeout(app.pagesSaveTimer);
    app.pagesSaveTimer = window.setTimeout(saveAppState, 300);
}

export function serializeAppState() {
    const pages = [];
    app.hooks.forEachNotePage((page) => {
        if (!page?.id) return;
        const meta = getPageMeta(page.id);
        const list = app.hooks.isPageInDeleteList(page.id) ? 'delete' : 'all';
        pages.push({
            id: page.id,
            html: page.innerHTML,
            list,
            pinned: !!meta.pinned,
            updatedAt: meta.updatedAt,
            orderBeforePin: meta.orderBeforePin,
        });
    });
    return { pages, activeId: app.hooks.getActivePage()?.id || null };
}

export function saveAppState() {
    writeJson(sessionStorage, PAGES_STORAGE_KEY, serializeAppState());
}

export function clearSavedAppState() {
    clearTimeout(app.pagesSaveTimer);
    removeKey(sessionStorage, PAGES_STORAGE_KEY);
    removeKey(localStorage, PAGES_STORAGE_KEY);
}

export function getDefaultSettings() {
    return {
        theme: THEME_IDS.SYSTEM,
        lang: LANG_IDS.KO,
        noti: true,
        authMode: null,
        nickname: '',
        email: '',
        img: DEFAULT_PROFILE_IMG,
    };
}

export function loadSettings() {
    migrateLegacyStorage();
    const data = readJson(sessionStorage, SETTINGS_STORAGE_KEY);
    return { ...getDefaultSettings(), ...(data || {}) };
}

export function saveSettings(partial = {}) {
    migrateLegacyStorage();
    const next = { ...loadSettings(), ...partial };
    writeJson(sessionStorage, SETTINGS_STORAGE_KEY, next);
    removeKey(localStorage, SETTINGS_STORAGE_KEY);
    return next;
}

export function clearSessionSettings() {
    const current = loadSettings();
    return saveSettings({
        theme: current.theme,
        lang: current.lang,
        noti: true,
        authMode: null,
        nickname: '',
        email: '',
        img: DEFAULT_PROFILE_IMG,
    });
}

export function loadAppState() {
    migrateLegacyStorage();
    let data;
    try {
        const raw = sessionStorage.getItem(PAGES_STORAGE_KEY);
        if (!raw) return false;
        data = JSON.parse(raw);
    } catch (_) {
        return false;
    }
    if (!Array.isArray(data?.pages) || !data.pages.length || !app.noteArea) return false;

    app.suppressSavedStatus = true;
    app.suppressPagesSave = true;
    data.pages.forEach((item) => {
        if (!item?.id) return;
        app.pageMeta.set(item.id, {
            updatedAt: item.updatedAt || Date.now(),
            pinned: !!item.pinned,
            orderBeforePin: item.orderBeforePin ?? null,
        });
        const page = app.hooks.createPage(item.id, item.html || '<div><br></div>', false);
        const meta = getPageMeta(item.id);
        meta.updatedAt = item.updatedAt || Date.now();
        meta.pinned = !!item.pinned;
        meta.orderBeforePin = item.orderBeforePin ?? null;
        app.noteArea.appendChild(page);

        const areaItem = app.hooks.createPageAreaItem(item.id);
        if (item.list === 'delete') app.deletePageArea?.appendChild(areaItem);
        else app.allPageArea?.appendChild(areaItem);
        if (item.pinned && item.list !== 'delete') {
            areaItem.querySelector('.page-keep-btn')?.classList.add('on');
        }
        app.hooks.updatePageTitleElement(page);
        app.hooks.updatePageAreaDate(page);
    });
    sortPageArea(app.allPageArea);
    sortPageArea(app.deletePageArea);

    const activeId =
        data.activeId && app.hooks.getNotePageById(data.activeId) ? data.activeId : data.pages[0]?.id;
    if (activeId) app.hooks.selectPage(activeId);
    else app.hooks.deselectAllPages();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            app.suppressSavedStatus = false;
            app.suppressPagesSave = false;
            app.hooks.syncStatusTextFromActivePage();
            scheduleSaveAppState();
        });
    });
    return true;
}

export function sortPageArea(areaEl) {
    if (!areaEl) return;
    const items = [...areaEl.children];
    items.sort((a, b) => {
        const ma = getPageMeta(a.id);
        const mb = getPageMeta(b.id);
        if (ma.pinned && !mb.pinned) return -1;
        if (!ma.pinned && mb.pinned) return 1;
        return mb.updatedAt - ma.updatedAt;
    });
    items.forEach((item) => areaEl.appendChild(item));
}
