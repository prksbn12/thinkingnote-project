import {
  NICKNAME_RE,
  PW_RE,
  AUTH_RE,
} from './constants.js';

export const app = {
  pagesSaveTimer: 0,
  suppressPagesSave: false,
  pageMeta: new Map(),
  appRoute: null,
  loginRoute: null,
  noteArea: null,
  allPageArea: null,
  deletePageArea: null,
  sidebar: null,
  settingsDialog: null,
  joinDialog: null,
  resetDialog: null,
  sidebarSearchInput: null,
  sidebarSearchBtn: null,
  statusTxt: null,
  sidebarMenuBtn: null,
  sidebarCloseBtn: null,
  scrollCaretFrame: 0,
  noteAreaPointerDown: null,
  isDraggingSelection: false,
  normalizingSelection: false,
  pendingImageInsert: null,
  suppressPageFocusIn: false,
  suppressNextPasteBeforeInput: false,
  suppressScrollCaretIntoView: false,
  storedLineClassesClipboard: null,
  storedLineClipboardText: null,
  setSnapshot: null,
  pageTitleObservers: new WeakMap(),
  savedStatusTimer: 0,
  suppressSavedStatus: false,
  hooks: {},
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function byId(id) {
    return document.getElementById(id);
}

export function toggleClass(el, cls, on) {
    if (!el) return;
    if (on === undefined) el.classList.toggle(cls);
    else el.classList.toggle(cls, on);
    if (cls === 'on' && el.tagName === 'DIALOG') {
        const isOn = on === undefined ? el.classList.contains('on') : !!on;
        if (isOn) el.setAttribute('open', '');
        else el.removeAttribute('open');
    }
}

export function setButtonEnabled(btn, enabled) {
    if (!btn) return;
    btn.disabled = !enabled;
}

export function appendDualIcons(parent, offGlyph, onGlyph, offClass = 'blank-icon', onClass = 'check-icon') {
    const off = document.createElement('span');
    off.className = offClass;
    off.textContent = offGlyph;
    off.contentEditable = 'false';
    const on = document.createElement('span');
    on.className = onClass;
    on.textContent = onGlyph;
    on.contentEditable = 'false';
    parent.appendChild(off);
    parent.appendChild(on);
}

export function migratePageIconTags(root) {
    if (!root) return;
    root.querySelectorAll('i.icon').forEach((el) => {
        const span = document.createElement('span');
        for (const attr of el.attributes) span.setAttribute(attr.name, attr.value);
        while (el.firstChild) span.appendChild(el.firstChild);
        el.replaceWith(span);
    });
}

export function uniquePageId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

export function formatDate(d) {
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours();
    const ap = h < 12 ? '오전' : '오후';
    const h12 = h % 12 || 12;
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}. ${m}. ${day}. ${ap} ${h12}:${min}`;
}

export function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
}

export function normalizeEmail(v) {
    return (v || '').trim();
}

export function isValidNickname(v) {
    return NICKNAME_RE.test(v || '');
}

export function nicknameFromEmailLocal(localPart) {
    const cleaned = (localPart || '').replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 18);
    return isValidNickname(cleaned) ? cleaned : '';
}

export function isValidPw(v) {
    return PW_RE.test(v || '');
}

export function isValidAuth(v) {
    return AUTH_RE.test((v || '').trim());
}

export function isImageFile(file) {
    return file && file.type.startsWith('image/');
}

export function readImageFile(file, cb) {
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    reader.readAsDataURL(file);
}

export function setCheckboxValue(input, val) {
    if (!input) return;
    const checked = val === true || val === 'true';
    input.checked = checked;
    input.value = checked ? 'true' : 'false';
}

export function getCheckboxValue(input) {
    return !!input?.checked;
}

