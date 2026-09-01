import { app, $, $$, byId, toggleClass, setButtonEnabled, appendDualIcons, migratePageIconTags, uniquePageId, formatDate, isValidEmail, normalizeEmail, isValidNickname, nicknameFromEmailLocal, isValidPw, isImageFile, readImageFile, setCheckboxValue, getCheckboxValue } from './utils.js';
import {
  MOBILE_MAX,
  SIZE_CLASSES,
  COLOR_CLASSES,
  INDENT_CLASS,
  TOOL_LINE_CLASSES,
  WELCOME_HTML,
  PAGE_AREA_ITEM_SEL,
  NOTE_PAGE_SEL,
  NOTE_PAGE_ON_SEL,
  SAVED_STATUS_TEXT,
  SAVED_STATUS_MS,
  PAGES_STORAGE_KEY,
  IMAGE_CLIPBOARD_MIME,
  LINE_CLIPBOARD_MIME,
  DEFAULT_PROFILE_IMG,
} from './constants.js';
import {
  getPageMeta,
  touchPage,
  scheduleSaveAppState,
  saveAppState,
  clearSavedAppState,
  loadAppState,
  sortPageArea,
  loadSettings,
  clearSessionSettings,
} from './storage-service.js';
import * as lines from './editor-line-service.js';
import * as blocks from './editor-block-service.js';
import {
  bindInputHints,
  emailHintRules,
  pwHintRules,
  authHintRules,
  confirmHintRules,
  nicknameHintRules,
  captureSetSnapshot,
  restoreSetSnapshot,
  resetSetFields,
  closeSet,
  clearSetMemberInputHint,
  syncSetMemberAuthFromEmail,
  syncSetMemberConfirmFromPw,
  syncSetMemberDependentInputs,
  clearSetMemberAuthOnEmailChange,
  clearSetMemberConfirmOnPwChange,
  bindLoginEnterFlow,
  bindSetMemberEnterFlow,
  initTheme,
  setTheme,
  setLang,
  normalizeThemeId,
  normalizeLangId,
  applyPersistedSettings,
  persistSettingsFromDom,
  syncNotiControl,
  syncSetCompleteBtn,
  initMarkInputGroups,
  initSlideCheckGroups,
  openAuth,
  closeAuth,
  openJoin,
  openReset,
  closeJoin,
  closeReset,
  bindModalOverlayClose,
  bindModalEscapeClose,
  initJoinReset,
  syncSetMemberEmailFieldTrim,
} from './form-handler.js';

function wireStorageHooks() {
  app.hooks.forEachNotePage = forEachNotePage;
  app.hooks.isPageInDeleteList = isPageInDeleteList;
  app.hooks.getActivePage = getActivePage;
  app.hooks.createPage = createPage;
  app.hooks.createPageAreaItem = createPageAreaItem;
  app.hooks.updatePageTitleElement = updatePageTitleElement;
  app.hooks.updatePageAreaDate = updatePageAreaDate;
  app.hooks.getNotePageById = getNotePageById;
  app.hooks.selectPage = selectPage;
  app.hooks.deselectAllPages = deselectAllPages;
  app.hooks.syncStatusTextFromActivePage = syncStatusTextFromActivePage;
  app.hooks.isEditablePage = isEditablePage;
  app.hooks.syncPageAreaFromPage = syncPageAreaFromPage;
  app.hooks.removePageCompletely = removePageCompletely;
}

function bindDomRefs() {
    app.appRoute = byId('app-route');
    app.loginRoute = byId('login-route');
    app.noteArea = byId('note-area');
    app.allPageArea = byId('sidebar-all-page-area');
    app.deletePageArea = byId('sidebar-delete-page-area');
    app.sidebar = byId('sidebar');
    app.settingsDialog = byId('set');
    app.joinDialog = byId('join');
    app.resetDialog = byId('reset');
    app.sidebarSearchInput = byId('sidebar-search-input');
    app.sidebarSearchBtn = byId('sidebar-search-btn');
    app.statusTxt = byId('toolbar-status-txt');
    app.sidebarMenuBtn = byId('sidebar-menu-btn');
    app.sidebarCloseBtn = byId('sidebar-close-btn');
}

function getNotePageById(id) {
    if (!app.noteArea || !id) return null;
    return app.noteArea.querySelector(`:scope > div#${CSS.escape(id)}`);
}

function getActivePage() {
    return app.noteArea?.querySelector(':scope > div.on') ?? null;
}

function forEachNotePage(fn) {
    $$(':scope > div', app.noteArea).forEach(fn);
}

function forEachPageAreaItem(fn) {
    $$(PAGE_AREA_ITEM_SEL).forEach(fn);
}

function getStatusTextEl() {
    return app.statusTxt;
}

function getActivePageAreaItem() {
    return app.allPageArea?.querySelector(':scope > div.on') ?? null;
}

function syncStatusTextFromActivePage() {
    const statusEl = getStatusTextEl();
    if (!statusEl) return;
    const dateText = getActivePageAreaItem()?.querySelector('.date-txt')?.textContent ?? '';
    statusEl.textContent = dateText;
    statusEl.classList.remove('on');
}

function showPageSavedStatus() {
    if (app.suppressSavedStatus) return;
    const statusEl = getStatusTextEl();
    if (!statusEl || !getActivePage()) return;
    statusEl.textContent = SAVED_STATUS_TEXT;
    statusEl.classList.add('on');
    clearTimeout(app.savedStatusTimer);
    app.savedStatusTimer = window.setTimeout(() => {
        syncStatusTextFromActivePage();
    }, SAVED_STATUS_MS);
}

function queryPageAreaItem(area, id) {
    if (!area || !id) return null;
    return area.querySelector(`:scope > div#${CSS.escape(id)}`);
}

function findPageAreaItem(id) {
    return queryPageAreaItem(app.allPageArea, id) || queryPageAreaItem(app.deletePageArea, id);
}

function updatePageAreaDate(pageEl, { showSaved = false } = {}) {
    if (!pageEl?.id) return;
    const item = findPageAreaItem(pageEl.id);
    const dateEl = item?.querySelector('.date-txt');
    if (dateEl) {
        const updatedAt = new Date(getPageMeta(pageEl.id).updatedAt);
        dateEl.textContent = formatDate(updatedAt);
        if (dateEl.tagName === 'TIME') dateEl.dateTime = updatedAt.toISOString();
    }
    if (!pageEl.classList.contains('on')) return;
    if (showSaved) showPageSavedStatus();
    else syncStatusTextFromActivePage();
}

function getFirstPageLine(pageEl) {
    if (!pageEl) return null;
    const pageLines = [...pageEl.querySelectorAll(':scope > div')].filter((d) => !blocks.isImageBlock(d) && !blocks.isImageRow(d, pageEl));
    return pageLines.find((line) => !lines.isEmptyBrLine(line)) ?? null;
}

function isPageTitleLine(page, line) {
    if (!page || !line || blocks.isImageBlock(line) || blocks.isImageRow(line, page)) return false;
    const titleLine = getFirstPageLine(page);
    if (titleLine) return line === titleLine;
    const pageLines = lines.getTextLines(page);
    return pageLines.length > 0 && pageLines[0] === line;
}

function getPageTitleText(pageEl) {
    const line = getFirstPageLine(pageEl);
    if (!line || blocks.isImageBlock(line)) return '';
    return lines.getLineTextContent(line);
}

function updatePageTitleElement(pageEl) {
    if (!pageEl?.id) return;
    const item = findPageAreaItem(pageEl.id);
    const titleEl = item?.querySelector('.page-title');
    if (titleEl) titleEl.textContent = getPageTitleText(pageEl);
}

function syncPageTitleFromEditor(page, { showSaved = false } = {}) {
    if (!page?.classList.contains('on')) return;
    if (showSaved) touchPage(page.id);
    updatePageTitleElement(page);
    if (showSaved) sortPageArea(app.allPageArea);
    updatePageAreaDate(page, { showSaved });
}

function bindPageTitleSync(page) {
    if (!page || app.pageTitleObservers.has(page)) return;
    const observer = new MutationObserver(() => {
        if (!page.isConnected || !page.classList.contains('on')) return;
        syncPageTitleFromEditor(page);
    });
    observer.observe(page, {
        childList: true,
        subtree: true,
        characterData: true,
    });
    app.pageTitleObservers.set(page, observer);
}

function clearAppState() {
    if (app.sidebarSearchInput) app.sidebarSearchInput.value = '';
    if (app.noteArea) app.noteArea.innerHTML = '';
    if (app.allPageArea) app.allPageArea.innerHTML = '';
    if (app.deletePageArea) app.deletePageArea.innerHTML = '';
    app.pageMeta.clear();
    clearSavedAppState();
    clearSessionSettings();
    resetAuthProfileDom();
    closeSet();
}

function resetAuthProfileDom() {
    toggleClass($('#set-guest'), 'on', true);
    toggleClass($('#set-member'), 'on', false);
    const sidebarNickname = $('#sidebar-nickname');
    if (sidebarNickname) sidebarNickname.textContent = '';
    const sidebarImg = $('#sidebar-profile-img img');
    if (sidebarImg) sidebarImg.src = DEFAULT_PROFILE_IMG;
    const setImg = $('#set-member-profile-img img');
    if (setImg) setImg.src = DEFAULT_PROFILE_IMG;
    const nicknameInput = $('#set-member-nickname-input');
    if (nicknameInput) nicknameInput.value = '';
    const emailInput = $('#set-member-email-input');
    if (emailInput) emailInput.value = '';
    const pwInput = $('#set-member-pw-input');
    if (pwInput) pwInput.value = '';
    syncNotiControl({ enabled: false, checked: false });
    captureSetSnapshot();
}

function applyAuthSession(settings) {
    const mode = settings?.authMode;
    if (mode === 'member') {
        toggleClass($('#set-guest'), 'on', false);
        toggleClass($('#set-member'), 'on', true);
        const nickname = settings.nickname || '';
        const email = settings.email || '';
        const img = settings.img || DEFAULT_PROFILE_IMG;
        const nicknameInput = $('#set-member-nickname-input');
        const emailInput = $('#set-member-email-input');
        const setImg = $('#set-member-profile-img img');
        const sidebarNickname = $('#sidebar-nickname');
        const sidebarImg = $('#sidebar-profile-img img');
        if (nicknameInput) nicknameInput.value = nickname;
        if (emailInput) emailInput.value = email;
        if (setImg) setImg.src = img;
        if (sidebarNickname) sidebarNickname.textContent = nickname;
        if (sidebarImg) sidebarImg.src = img;
        syncNotiControl({ enabled: true, checked: settings.noti ?? true });
    } else if (mode === 'guest') {
        toggleClass($('#set-guest'), 'on', true);
        toggleClass($('#set-member'), 'on', false);
        const sidebarNickname = $('#sidebar-nickname');
        if (sidebarNickname) sidebarNickname.textContent = settings.nickname || '게스트';
        syncNotiControl({ enabled: false, checked: false });
    }
    captureSetSnapshot();
    syncSetMemberDependentInputs(false);
}

function clearLoginState() {
    const email = $('#login-email-input');
    const pw = $('#login-pw-input');
    if (email) email.value = '';
    if (pw) pw.value = '';
    const loginForm = $('#login-form');
    if (loginForm) {
        $$('.email-input-txt, .pw-input-txt', loginForm).forEach((p) => {
            p.textContent = '';
            p.className = p.className.replace(/\b(on|off)\b/g, '').trim();
            if (!p.classList.contains('input-txt')) p.classList.add('input-txt');
        });
    }
    closeJoin();
    closeReset();
}

function showLoginRoute() {
    toggleClass(app.loginRoute, 'on', true);
    toggleClass(app.appRoute, 'on', false);
    clearAppState();
}

function showAppRoute() {
    toggleClass(app.appRoute, 'on', true);
    toggleClass(app.loginRoute, 'on', false);
    clearLoginState();
    if (app.noteArea && !app.noteArea.querySelector(':scope > div')) {
        if (!loadAppState()) createWelcomePage();
    }
    syncSidebarResponsive();
}

/** 로그인 성공 시 회원·사이드바 필드 연동 (showAppRoute 전에 값을 보관해야 함) */

function syncSetMemberFromLogin(emailValue, pwValue) {
    const normalizedEmail = normalizeEmail(emailValue);
    const nickname = nicknameFromEmailLocal(normalizedEmail.split('@')[0] || '');
    const setMemberEmail = byId('set-member-email-input');
    const setMemberNickname = byId('set-member-nickname-input');
    const setMemberPw = byId('set-member-pw-input');
    const sidebarNickname = byId('sidebar-nickname');

    if (setMemberEmail) setMemberEmail.value = normalizedEmail;
    if (setMemberNickname) setMemberNickname.value = nickname;
    if (setMemberPw) setMemberPw.value = pwValue;
    if (sidebarNickname) sidebarNickname.textContent = nickname;

    toggleClass($('#set-guest'), 'on', false);
    toggleClass($('#set-member'), 'on', true);
    syncNotiControl({ enabled: true, checked: true });
    captureSetSnapshot();
    syncSetMemberDependentInputs(false);
    persistSettingsFromDom({ authMode: 'member', noti: true });
}

function handleLoginMember() {
    const emailInput = byId('login-email-input');
    const pwInput = byId('login-pw-input');
    if (!emailInput || !pwInput) return;

    const emailValue = emailInput.value.trim();
    const pwValue = pwInput.value;

    let ok = true;
    if (!isValidEmail(emailValue)) {
        const hint = emailInput.parentElement?.querySelector('.email-input-txt');
        if (hint) {
            hint.textContent = '이메일을 다시 확인해 주세요.';
            hint.classList.add('off');
        }
        ok = false;
    }
    if (!isValidPw(pwValue)) {
        const hint = pwInput.parentElement?.querySelector('.pw-input-txt');
        if (hint) {
            hint.textContent = '비밀번호를 다시 확인해 주세요.';
            hint.classList.add('off');
        }
        ok = false;
    }
    if (!ok) return;

    syncSetMemberFromLogin(emailValue, pwValue);
    showAppRoute();
}

function createPage(id, html, active) {
    const page = document.createElement('div');
    page.className = active ? 'on' : '';
    page.id = id;
    page.contentEditable = 'false';
    page.innerHTML = html || '<div><br></div>';
    migratePageIconTags(page);
    blocks.setupImageBlocks(page);
    blocks.setupChecklistLines(page);
    blocks.removeTrailingEmptyLineAfterImage(page);
    getPageMeta(id).updatedAt = Date.now();
    bindPageTitleSync(page);
    return page;
}

function createPageAreaItem(id) {
    const item = document.createElement('div');
    item.id = id;
    item.innerHTML = `
        <button type="button" class="page-btn"><span class="page-title s-title"></span><time class="date-txt"></time></button>
        <div class="btn-row-wrap"><button type="button" class="page-delete-btn icon-btn">delete</button><button type="button" class="page-keep-btn icon-btn"><span class="keep-icon">keep</span><span class="undo-icon">undo</span></button></div>`;
    return item;
}

function syncPageAreaFromPage(pageEl) {
    if (!pageEl?.id) return;
    updatePageTitleElement(pageEl);
    updatePageAreaDate(pageEl);
    sortPageArea(app.allPageArea);
}

function addPageToSidebar(id, select) {
    if (!app.allPageArea) return;
    const item = createPageAreaItem(id);
    app.allPageArea.prepend(item);
    syncPageAreaFromPage(getNotePageById(id));
    if (select) selectPage(id);
    sortPageArea(app.allPageArea);
    scheduleSaveAppState();
}

function selectPage(id) {
    const prev = getActivePage();
    if (prev && prev.id !== id) lines.finalizeEmptyPageOnDeselect(prev);

    forEachNotePage((p) => {
        const on = p.id === id;
        toggleClass(p, 'on', on);
        syncPageContentEditable(p);
        if (on && isEditablePage(p)) {
            blocks.setupImageBlocks(p);
            blocks.setupChecklistLines(p);
            requestAnimationFrame(() => blocks.removeTrailingEmptyLineAfterImage(p));
        }
    });
    forEachPageAreaItem((item) => {
        toggleClass(item, 'on', item.id === id);
        if (item.classList.contains('off')) toggleClass(item, 'on', false);
    });
    clearTimeout(app.savedStatusTimer);
    syncStatusTextFromActivePage();
}

function deselectAllPages() {
    $$(':scope > div.on', app.noteArea).forEach((p) => lines.finalizeEmptyPageOnDeselect(p));
    forEachNotePage((p) => {
        toggleClass(p, 'on', false);
        syncPageContentEditable(p);
    });
    forEachPageAreaItem((item) => toggleClass(item, 'on', false));
    window.getSelection()?.removeAllRanges();
    clearTimeout(app.savedStatusTimer);
    const statusEl = getStatusTextEl();
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.classList.remove('on');
    }
}

function createWelcomePage() {
    // 환영 페이지 초기 제목 동기화가 '저장되었어요'를 잠깐 띄우지 않게 한다.
    app.suppressSavedStatus = true;
    const id = uniquePageId();
    const page = createPage(id, WELCOME_HTML, true);
    app.noteArea.appendChild(page);
    addPageToSidebar(id, true);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            app.suppressSavedStatus = false;
            syncStatusTextFromActivePage();
        });
    });
}

function createEmptyPage() {
    const id = uniquePageId();
    const page = createPage(id, '<div><br></div>', true);
    app.noteArea.appendChild(page);
    addPageToSidebar(id, true);
    const line = page.querySelector(':scope > div');
    requestAnimationFrame(() => lines.focusLine(page, line, false));
}

function removePageCompletely(id) {
    getNotePageById(id)?.remove();
    queryPageAreaItem(app.allPageArea, id)?.remove();
    queryPageAreaItem(app.deletePageArea, id)?.remove();
    app.pageMeta.delete(id);
    scheduleSaveAppState();
}

function isPageInAllList(id) {
    return !!queryPageAreaItem(app.allPageArea, id);
}

function isPageInDeleteList(id) {
    return !!queryPageAreaItem(app.deletePageArea, id);
}

function isEditablePage(pageOrId) {
    const id = typeof pageOrId === 'string' ? pageOrId : pageOrId?.id;
    if (!id) return false;
    if (isPageInDeleteList(id)) return false;
    return isPageInAllList(id);
}

function syncPageContentEditable(page) {
    if (!page) return;
    page.contentEditable = page.classList.contains('on') && isEditablePage(page) ? 'true' : 'false';
}

function applySearchFilter() {
    const kw = (app.sidebarSearchInput?.value || '').trim();
    const lower = kw.toLowerCase();
    const matched = new Set();

    if (kw) {
        forEachNotePage((page) => {
            const text = page.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
            if (text.includes(lower)) matched.add(page.id);
        });
    }

    forEachPageAreaItem((item) => {
        if (!kw || matched.has(item.id)) {
            item.classList.remove('off');
            return;
        }
        item.classList.add('off');
        item.classList.remove('on');
    });
}

function syncSidebarResponsive() {
    if (!app.sidebar) return;
    const mobile = window.innerWidth <= MOBILE_MAX;
    toggleClass(app.sidebar, 'on', !mobile);
    syncToolBtnWrapMobileClasses();
}

function syncToolBtnWrapMobileClasses() {
    const wrap = byId('tool-btn-wrap');
    if (!wrap) return;
    const items = [...wrap.children];
    if (!items.length) return;

    if (window.innerWidth > MOBILE_MAX) {
        items.forEach((item) => {
            toggleClass(item, 'off', false);
        });
        return;
    }

    const active = items.find((item) => item.classList.contains('on'));
    if (active) {
        items.forEach((item) => {
            toggleClass(item, 'off', item !== active);
        });
        return;
    }

    items.forEach((item) => {
        toggleClass(item, 'off', false);
    });
}

function initRoutes() {
    // 라우트 전환·정리는 showAppRoute / showLoginRoute에서만 처리한다.
}

function initSidebar() {
    app.sidebarMenuBtn?.addEventListener('click', () => toggleClass(app.sidebar, 'on', true));
    app.sidebarCloseBtn?.addEventListener('click', () => toggleClass(app.sidebar, 'on', false));
    app.sidebar?.addEventListener('click', (e) => {
        if (e.target.classList.contains('sidebar-overlay')) toggleClass(app.sidebar, 'on', false);
    });
    $('#sidebar-settings-btn')?.addEventListener('click', () => {
        captureSetSnapshot();
        syncSetMemberDependentInputs(false);
        toggleClass(app.settingsDialog, 'on', true);
    });
    $('#sidebar-logout-btn')?.addEventListener('click', showLoginRoute);
    $('#set-guest-login-btn')?.addEventListener('click', showLoginRoute);

    $$('.toggle-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('on');
        });
    });

    app.sidebarSearchInput?.addEventListener('input', () => {
        applySearchFilter();
    });

    app.sidebarSearchBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        if ((app.sidebarSearchInput?.value || '').trim()) {
            app.sidebarSearchInput.value = '';
            applySearchFilter();
        } else {
            app.sidebarSearchInput.focus();
        }
    });

    $('#sidebar-search-form')?.addEventListener('submit', (e) => e.preventDefault());
}

function initPageAreas() {
    const onPageAreaClick = (e) => {
        const item = e.target.closest(PAGE_AREA_ITEM_SEL);
        if (!item || item.classList.contains('off')) return;

        if (e.target.closest('.page-delete-btn')) {
            e.stopPropagation();
            const fromAll = item.parentElement === app.allPageArea;
            if (fromAll) {
                const keepBtn = item.querySelector('.page-keep-btn');
                toggleClass(keepBtn, 'on', false);
                app.deletePageArea.appendChild(item);
                sortPageArea(app.deletePageArea);
                syncPageContentEditable(getNotePageById(item.id));
                window.getSelection()?.removeAllRanges();
                scheduleSaveAppState();
            } else {
                removePageCompletely(item.id);
            }
            return;
        }

        if (e.target.closest('.page-keep-btn')) {
            e.stopPropagation();
            const keepBtn = item.querySelector('.page-keep-btn');
            const fromDelete = item.parentElement === app.deletePageArea;
            if (fromDelete) {
                const meta = getPageMeta(item.id);
                app.allPageArea.appendChild(item);
                toggleClass(keepBtn, 'on', !!meta.pinned);
                sortPageArea(app.allPageArea);
                syncPageContentEditable(getNotePageById(item.id));
                scheduleSaveAppState();
                return;
            }
            const meta = getPageMeta(item.id);
            if (!keepBtn.classList.contains('on')) {
                meta.orderBeforePin = [...app.allPageArea.children].indexOf(item);
                keepBtn.classList.add('on');
                meta.pinned = true;
                app.allPageArea.prepend(item);
            } else {
                keepBtn.classList.remove('on');
                meta.pinned = false;
                if (meta.orderBeforePin != null) {
                    const items = [...app.allPageArea.children];
                    const ref = items[meta.orderBeforePin] || null;
                    if (ref && ref !== item) app.allPageArea.insertBefore(item, ref);
                    else app.allPageArea.appendChild(item);
                }
                meta.orderBeforePin = null;
            }
            sortPageArea(app.allPageArea);
            scheduleSaveAppState();
            return;
        }

        selectPage(item.id);
    };

    app.allPageArea?.addEventListener('click', onPageAreaClick);
    app.deletePageArea?.addEventListener('click', onPageAreaClick);
}

function initBoard() {
    document.addEventListener('selectionchange', () => {
        const page = getActivePage();
        if (!page) return;
        const ctx = lines.getLineContext();
        if (!isPageTitleLine(page, ctx?.line)) return;
        updatePageTitleElement(page);
    });

    app.noteArea?.addEventListener('mousedown', (e) => {
        app.noteAreaPointerDown = { x: e.clientX, y: e.clientY };
        if (e.button === 0) app.isDraggingSelection = false;

        const imageBlock = e.target.closest(`${NOTE_PAGE_ON_SEL} > div.image`);
        if (e.button === 2 && blocks.getPageContentContextMenuTarget(e)) {
            // 컨텍스트 메뉴 열릴 때 selectionchange/캐럿 스크롤로 뷰포트가 튀지 않게 한다.
            app.suppressScrollCaretIntoView = true;
        }
        if (
            imageBlock &&
            e.button === 0 &&
            !e.shiftKey &&
            !e.ctrlKey &&
            !e.metaKey &&
            !blocks.isImageControlClick(imageBlock, e)
        ) {
            const page = imageBlock.closest(NOTE_PAGE_ON_SEL);
            if (!page || !isEditablePage(page)) return;
            // 브라우저가 이미지 안으로 캐럿을 넣지 못하게 막고, 위·아래 텍스트 줄로만 포커스한다.
            e.preventDefault();
            e.stopPropagation();
            blocks.focusBesideImageFromClick(page, imageBlock, e.clientY);
        }
        const checklistLine = e.target.closest(`${NOTE_PAGE_ON_SEL} > div.checklist`);
        if (checklistLine && blocks.isChecklistControlClick(checklistLine, e) && e.button === 0) {
            const page = checklistLine.closest(NOTE_PAGE_ON_SEL);
            if (page && isEditablePage(page)) e.preventDefault();
        }
        if (imageBlock && blocks.isImageControlClick(imageBlock, e) && e.button === 0) {
            const page = imageBlock.closest(NOTE_PAGE_ON_SEL);
            if (page && isEditablePage(page)) e.preventDefault();
        }
    });

    window.addEventListener(
        'pointerdown',
        (e) => {
            if (e.button !== 2) app.suppressScrollCaretIntoView = false;
        },
        true
    );
    window.addEventListener('keydown', () => {
        app.suppressScrollCaretIntoView = false;
    });

    app.noteArea?.addEventListener('mousemove', (e) => {
        if (e.buttons & 1) app.isDraggingSelection = true;
    });

    app.noteArea?.addEventListener('click', (e) => {
        const moved =
            app.noteAreaPointerDown &&
            (Math.abs(e.clientX - app.noteAreaPointerDown.x) > 4 ||
                Math.abs(e.clientY - app.noteAreaPointerDown.y) > 4);
        app.noteAreaPointerDown = null;
        if (moved) return;

        const pageLink = e.target.closest(`${NOTE_PAGE_ON_SEL} a.link`);
        if (pageLink && e.button === 0) {
            e.preventDefault();
            blocks.openPageContentLink(pageLink);
            return;
        }

        if (e.target === app.noteArea || (e.target.parentElement === app.noteArea && e.target.classList.contains('on'))) {
            const page = e.target === app.noteArea ? getActivePage() : e.target;
            if (!page) {
                createEmptyPage();
                return;
            }
            if (!isEditablePage(page)) return;
            if (lines.isPageStructureEmpty(page)) {
                lines.focusPageCaret(page, 0);
                return;
            }
            lines.focusPageEnd(page);
            return;
        }
        const checklistLine = e.target.closest(`${NOTE_PAGE_ON_SEL} > div.checklist`);
        if (checklistLine && blocks.isChecklistControlClick(checklistLine, e) && e.button === 0) {
            const page = checklistLine.closest(NOTE_PAGE_ON_SEL);
            if (!page || !isEditablePage(page)) return;
            e.preventDefault();
            checklistLine.classList.toggle('on');
            return;
        }
        const imageBlock = e.target.closest(`${NOTE_PAGE_ON_SEL} > div.image`);
        if (imageBlock && blocks.isImageControlClick(imageBlock, e) && e.button === 0) {
            const page = imageBlock.closest(NOTE_PAGE_SEL);
            if (!page || !isEditablePage(page)) return;
            e.preventDefault();
            imageBlock.classList.toggle('on');
            if (page.id) touchPage(page.id);
            return;
        }
        if (imageBlock && !blocks.isImageControlClick(imageBlock, e) && e.button === 0) {
            e.preventDefault();
            const page = imageBlock.closest(NOTE_PAGE_ON_SEL);
            if (!page || !isEditablePage(page)) return;
            blocks.focusBesideImageFromClick(page, imageBlock, e.clientY);
            return;
        }
    });

    app.noteArea?.addEventListener('focusin', (e) => {
        const page = e.target.closest?.(NOTE_PAGE_ON_SEL);
        if (!page || !isEditablePage(page) || e.target !== page || app.suppressPageFocusIn || app.suppressScrollCaretIntoView) return;
        const pageLines = lines.getTextLines(page);
        const target = pageLines.find((l) => lines.isEmptyBrLine(l)) || pageLines[pageLines.length - 1];
        if (target) {
            lines.focusLine(page, target, false);
            blocks.removeTrailingEmptyLineAfterImage(page);
            return;
        }
        const last = page.lastElementChild;
        if (last && blocks.isImageBlock(last)) {
            blocks.focusBesideImage(page, last, 'after');
            blocks.removeTrailingEmptyLineAfterImage(page);
            return;
        }
        if (!page.childNodes.length) {
            lines.focusPageCaret(page, 0);
        }
        blocks.removeTrailingEmptyLineAfterImage(page);
    });

    app.noteArea?.addEventListener('input', (e) => {
        const page = e.target.closest?.(NOTE_PAGE_ON_SEL);
        if (!page || !isEditablePage(page)) return;
        blocks.moveStrayContentOutOfImageBlocks(page);
        lines.removeOrphanPageNodes(page);
        lines.stripInlineMarkupFromPage(page);
        const ctx = lines.getLineContext();
        const line =
            ctx?.page === page
                ? ctx.line
                : e.target.closest?.(`${NOTE_PAGE_ON_SEL} > div`);
        if (line && !blocks.isImageBlock(line) && !blocks.isImageRow(line, page) && line.classList.contains('image')) {
            line.classList.remove('image', 'on');
        }
        if (line && blocks.isChecklistLine(line)) blocks.normalizeChecklistLineContent(line);
        if (!e.isComposing && line && blocks.isLinkableLine(line, page)) {
            blocks.linkifyLinePreservingCaret(page, line);
        }
        syncPageTitleFromEditor(page, { showSaved: true });
        lines.scheduleScrollCaretIntoView(page);
    });

    app.noteArea?.addEventListener('dragstart', (e) => {
        if (!lines.getActivePageFromEvent(e)) return;
        e.preventDefault();
    });

    app.noteArea?.addEventListener('dragover', (e) => {
        if (!lines.getActivePageFromEvent(e)) return;
        e.preventDefault();
    });

    app.noteArea?.addEventListener('drop', (e) => {
        if (!lines.getActivePageFromEvent(e)) return;
        e.preventDefault();
    });

    app.noteArea?.addEventListener('copy', (e) => {
        const page = e.target.closest?.(NOTE_PAGE_ON_SEL) || getActivePage();
        if (!page) return;
        if (blocks.copySelectedImagesToClipboard(page, e)) return;
        lines.copySelectedLineStylesToClipboard(page, e);
    }, true);

    app.noteArea?.addEventListener('paste', (e) => {
        const page = e.target.closest?.(NOTE_PAGE_ON_SEL);
        if (!page || !isEditablePage(page)) return;
        // paste와 beforeinput이 둘 다 오므로, 커스텀 삽입 후 브라우저 기본 붙여넣기가 한 번 더 들어가지 않게 막는다.
        if (blocks.willPasteImagesFromClipboard(e)) {
            e.preventDefault();
            app.suppressNextPasteBeforeInput = true;
            blocks.pasteImageBlocksFromClipboard(page, e, () => {
                requestAnimationFrame(() => {
                    app.suppressNextPasteBeforeInput = false;
                });
            });
            return;
        }
        const text = lines.getClipboardPlainText(e);
        if (!lines.pastePlainTextIntoPage(page, text, e)) return;
        e.preventDefault();
        app.suppressNextPasteBeforeInput = true;
        requestAnimationFrame(() => {
            app.suppressNextPasteBeforeInput = false;
        });
    });

    app.noteArea?.addEventListener('beforeinput', (e) => {
        const page = e.target.closest?.(NOTE_PAGE_ON_SEL);
        if (!page || !isEditablePage(page)) return;
        if (blocks.blockImageBlockInput(page, e)) return;

        if (e.inputType === 'insertFromDrop') {
            e.preventDefault();
            return;
        }

        if (e.inputType === 'insertFromPaste') {
            if (app.suppressNextPasteBeforeInput) return;
            if (blocks.willPasteImagesFromClipboard(e)) {
                e.preventDefault();
                app.suppressNextPasteBeforeInput = true;
                blocks.pasteImageBlocksFromClipboard(page, e, () => {
                    requestAnimationFrame(() => {
                        app.suppressNextPasteBeforeInput = false;
                    });
                });
                return;
            }
            const text = lines.getClipboardPlainText(e);
            if (lines.pastePlainTextIntoPage(page, text, e)) {
                e.preventDefault();
                return;
            }
        }

        if (
            lines.isPageStructureEmpty(page) &&
            e.inputType &&
            (e.inputType.startsWith('insert') || e.inputType === 'insertParagraph')
        ) {
            e.preventDefault();
            const seed = e.data || '';
            lines.beginTypingOnEmptyPage(page, seed);
            return;
        }

        const sel = window.getSelection();
        if (sel?.rangeCount) {
            const range = sel.getRangeAt(0);
            const caret = lines.getPageCaretSide(page, range);
            if (
                caret?.row &&
                caret.side !== 'neutral' &&
                e.inputType &&
                (e.inputType.startsWith('insert') || e.inputType === 'insertParagraph')
            ) {
                e.preventDefault();
                const seed = e.data || '';
                if (seed) blocks.beginTypingBesideImageRow(page, caret.row, caret.side, seed);
                else blocks.focusBesideImage(page, caret.row, caret.side);
                return;
            }
        }

        requestAnimationFrame(() => syncPageTitleFromEditor(page, { showSaved: true }));
    });

    app.noteArea?.addEventListener('compositionend', (e) => {
        const page = e.target.closest?.(NOTE_PAGE_ON_SEL);
        if (!page || !isEditablePage(page)) return;
        syncPageTitleFromEditor(page, { showSaved: true });
        const ctx = lines.getLineContext();
        if (ctx?.line && blocks.isLinkableLine(ctx.line, page)) {
            blocks.linkifyLinePreservingCaret(page, ctx.line);
        }
        lines.scheduleScrollCaretIntoView(page);
    });

    app.noteArea?.addEventListener('mouseup', (e) => {
        const page = e.target.closest?.(NOTE_PAGE_ON_SEL);
        if (!page) return;
        app.isDraggingSelection = false;
        lines.afterSelectionInput(page);
    });

    document.addEventListener('selectionchange', () => {
        const page = getActivePage();
        if (!page || app.isDraggingSelection) return;
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        const range = sel.getRangeAt(0);
        if (!page.contains(range.commonAncestorContainer)) return;
        if (range.collapsed) lines.scheduleScrollCaretIntoView(page);
    });

    app.noteArea?.addEventListener('keyup', (e) => {
        if (e.isComposing) return;
        const page = getActivePage();
        if (!page || !isEditablePage(page)) return;

        const ctx = lines.getLineContext();
        const firstLine = getFirstPageLine(page);
        const editsFirstLine =
            isPageTitleLine(page, ctx?.line) ||
            (!firstLine && e.target.closest?.(NOTE_PAGE_ON_SEL) === page);
        const isTextEditKey =
            e.key.length === 1 ||
            e.key === 'Backspace' ||
            e.key === 'Delete' ||
            e.key === 'Enter';

        if (editsFirstLine && isTextEditKey) {
            syncPageTitleFromEditor(page, { showSaved: true });
        }

        if (!app.isDraggingSelection && !e.key.startsWith('Arrow')) {
            lines.afterSelectionInput(page);
        }
    });

    app.noteArea?.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            const page = getActivePage();
            if (!page || !isEditablePage(page)) return;
            e.preventDefault();
            lines.selectAllPageText(page, window.getSelection());
            return;
        }

        const ctx = lines.getLineContext();
        if (!ctx?.page?.classList.contains('on') || !isEditablePage(ctx.page)) return;
        const { line, sel, page } = ctx;

        if ((e.key === 'Backspace' || e.key === 'Delete') && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            if (!range.collapsed && page.contains(range.commonAncestorContainer)) {
                e.preventDefault();
                lines.deleteSelectedPageText(page, sel, range);
                return;
            }
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            const indentLines = lines.getIndentTargetLines(page);
            if (indentLines.length) lines.setLineIndent(page, indentLines, !e.shiftKey);
            return;
        }

        const arrowCollapseMap = {
            ArrowLeft: 'start',
            ArrowUp: 'start',
            ArrowRight: 'end',
            ArrowDown: 'end',
        };
        const collapseDir = arrowCollapseMap[e.key];
        if (collapseDir && !e.shiftKey && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            if (!range.collapsed && page.contains(range.commonAncestorContainer)) {
                e.preventDefault();
                if (collapseDir === 'start') {
                    lines.collapseSelectionToStart(page, sel, range);
                } else {
                    lines.collapseSelectionToEnd(page, sel, range);
                }
                return;
            }
        }

        if (sel.rangeCount) {
            const range = sel.getRangeAt(0);
            if (
                range.collapsed &&
                page.contains(range.commonAncestorContainer) &&
                lines.handlePageCaretKeydown(page, sel, range, e)
            ) {
                return;
            }
        }

        if (!line) {
            const imageBlock = blocks.getImageBlockFromSelection(page);
            if (e.key === 'Backspace' && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                if (range.collapsed) {
                    if (blocks.isImageBlock(imageBlock)) {
                        e.preventDefault();
                        const prevText = blocks.getPreviousTextBlock(imageBlock, page);
                        const nextText = blocks.getNextTextBlock(imageBlock, page);
                        blocks.removeImageBlock(page, imageBlock, prevText || nextText, !!prevText);
                        return;
                    }
                    if (range.startContainer === page) {
                        const prevNode = page.childNodes[range.startOffset - 1];
                        if (blocks.isImageBlock(prevNode)) {
                            e.preventDefault();
                            const focusTarget =
                                lines.getLineFromPageOffset(page, page, range.startOffset) ||
                                blocks.getPreviousTextBlock(prevNode, page);
                            blocks.removeImageBlock(page, prevNode, focusTarget, false);
                            return;
                        }
                    }
                }
            }
            if (e.key === 'Delete' && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                if (range.collapsed && blocks.isImageBlock(imageBlock)) {
                    e.preventDefault();
                    const prevText = blocks.getPreviousTextBlock(imageBlock, page);
                    const nextText = blocks.getNextTextBlock(imageBlock, page);
                    blocks.removeImageBlock(page, imageBlock, prevText || nextText, !!prevText);
                    return;
                }
            }
            if (
                imageBlock &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                (e.key === 'Enter' || (e.key.length === 1 && !e.isComposing))
            ) {
                e.preventDefault();
                blocks.beginTypingBesideImageRow(page, imageBlock, 'after', e.key === 'Enter' ? '' : e.key);
                return;
            }
            if (
                lines.isPageStructureEmpty(page) &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey &&
                (e.key === 'Enter' || (e.key.length === 1 && !e.isComposing))
            ) {
                e.preventDefault();
                lines.beginTypingOnEmptyPage(page, e.key === 'Enter' ? '' : e.key);
            }
            return;
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (sel.rangeCount) {
                const range = sel.getRangeAt(0);
                if (!range.collapsed && lines.isFullPageTextSelection(page, range)) {
                    // 페이지 전체 선택 상태에서 Enter는 줄바꿈이 아니라 빈 한 줄로 초기화한다.
                    lines.resetPageToEmptyLine(page);
                    return;
                }
            }
            const text = lines.getLineTextContent(line);
            const empty = !text.trim();
            const atStart = lines.isAtLineStart(line, sel);
            const atEnd = lines.isAtLineEnd(line, sel);
            const mid = !atStart && !atEnd && text.length > 0;

            if (empty) {
                if (lines.shouldExitToolLineFormat(line)) {
                    const brDiv = document.createElement('div');
                    brDiv.innerHTML = '<br>';
                    line.before(brDiv);
                    lines.removeToolLineClasses(line);
                    lines.focusLine(page, line, true);
                } else if (lines.hasToolLineFormat(line)) {
                    const next = lines.createStyledLineAfter(line);
                    lines.focusLine(page, next, true);
                } else {
                    const brDiv = document.createElement('div');
                    brDiv.innerHTML = '<br>';
                    line.before(brDiv);
                    lines.focusLine(page, line, true);
                }
            } else if (atStart) {
                const brDiv = document.createElement('div');
                const cls = lines.copyTextLineClasses(line);
                if (cls) brDiv.className = cls;
                if (brDiv.classList.contains('checklist')) blocks.wrapLineAsChecklist(brDiv);
                else brDiv.innerHTML = '<br>';
                line.before(brDiv);
                lines.focusLine(page, line, false);
            } else if (atEnd) {
                const next = lines.createStyledLineAfter(line);
                lines.focusLine(page, next, true);
            } else if (mid) {
                lines.splitLineAtCursor(line, sel);
            }
            touchPage(page.id);
            syncPageAreaFromPage(page);
            return;
        }

        if (e.key === 'Backspace') {
            e.preventDefault();
            const text = lines.getLineTextContent(line);
            const atStart = lines.isAtLineStart(line, sel);
            const isFirstLine = isPageTitleLine(page, line);
            const prevEl = line.previousElementSibling;

            if (atStart && line.classList.contains(INDENT_CLASS)) {
                lines.setLineIndent(page, [line], false);
                return;
            }

            if (!text.trim() && atStart) {
                if (blocks.isImageBlock(prevEl)) {
                    blocks.removeImageBlock(page, prevEl, line, false);
                } else {
                    const prev = lines.getAdjacentTextLine(line, 'prev');
                    line.remove();
                    if (prev) lines.focusLine(page, prev, true);
                    else lines.normalizePageAfterContentChange(page, { focus: true });
                }
            } else if (atStart) {
                if (blocks.isImageBlock(prevEl)) {
                    blocks.removeImageBlock(page, prevEl, line, false);
                } else {
                    const prev = lines.getAdjacentTextLine(line, 'prev');
                    if (prev) lines.mergeLines(prev, line);
                }
            } else {
                document.execCommand('delete', false);
                lines.removeOrphanPageNodes(page);
                if (line.isConnected && !lines.getLineTextContent(line).trim()) {
                    lines.cleanupEmptyLine(page, line);
                } else if (!line.isConnected) {
                    lines.normalizePageAfterContentChange(page, { focus: true });
                }
            }
            touchPage(page.id);
            if (isFirstLine) updatePageTitleElement(page);
            syncPageAreaFromPage(page);
            return;
        }

        if (e.key === 'Delete') {
            e.preventDefault();
            const atEnd = lines.isAtLineEnd(line, sel);
            const nextEl = line.nextElementSibling;
            if (atEnd && blocks.isImageBlock(nextEl)) {
                blocks.removeImageBlock(page, nextEl, line, true);
                touchPage(page.id);
                syncPageAreaFromPage(page);
                return;
            }
            document.execCommand('delete', false);
            lines.removeOrphanPageNodes(page);
            if (!line.isConnected) {
                lines.normalizePageAfterContentChange(page, { focus: true });
            }
            touchPage(page.id);
            syncPageAreaFromPage(page);
            return;
        }

        if (e.key === 'ArrowLeft') {
            if (e.shiftKey) return;
            if (lines.isAtLineStart(line, sel) && blocks.focusIntoAdjacentImage(page, line, 'backward')) {
                e.preventDefault();
                return;
            }
            const prev = lines.getAdjacentTextLine(line, 'prev');
            if (lines.isAtLineStart(line, sel) && prev) {
                e.preventDefault();
                lines.focusLine(page, prev, true);
            }
            return;
        }

        if (e.key === 'ArrowRight') {
            if (e.shiftKey) return;
            if (lines.isAtLineEnd(line, sel) && blocks.focusIntoAdjacentImage(page, line, 'forward')) {
                e.preventDefault();
                return;
            }
            const next = lines.getAdjacentTextLine(line, 'next');
            if (lines.isAtLineEnd(line, sel) && next) {
                e.preventDefault();
                lines.focusLine(page, next, false);
            }
            return;
        }

        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            if (e.shiftKey) return;
            if (e.key === 'ArrowUp' && blocks.focusIntoAdjacentImage(page, line, 'backward')) {
                e.preventDefault();
                return;
            }
            if (e.key === 'ArrowDown' && blocks.focusIntoAdjacentImage(page, line, 'forward')) {
                e.preventDefault();
                return;
            }
            const siblings = lines.getTextLines(page);
            const idx = siblings.indexOf(line);
            const target = e.key === 'ArrowUp' ? siblings[idx - 1] : siblings[idx + 1];
            if (target) {
                e.preventDefault();
                const offset = lines.getCaretOffsetInLine(line, sel);
                lines.focusLine(page, target, offset);
            }
        }
    });

}

function initToolbar() {
    function bindLineFormatToolButton(btn, handler) {
        if (!btn) return;
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            handler(e);
        });
    }

    $$('.tool-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const inner = btn.closest('.tool-btn-inner');
            const wasOn = inner?.classList.contains('on');
            $$('#tool-btn-wrap > .tool-btn-inner').forEach((item) => toggleClass(item, 'on', false));
            if (!wasOn) toggleClass(inner, 'on', true);
            syncToolBtnWrapMobileClasses();
        });
    });

    $('#toolbar')?.addEventListener('click', (e) => {
        if (e.target.closest('.tool-btn, .icon-btn, .add-btn, label, input')) return;
        $$('#tool-btn-wrap > .tool-btn-inner').forEach((inner) => toggleClass(inner, 'on', false));
        syncToolBtnWrapMobileClasses();
    });

    $('.add-btn')?.addEventListener('click', () => {
        forEachPageAreaItem((item) => toggleClass(item, 'on', false));
        deselectAllPages();
    });

    const sizeToolMap = [
        ['#tool-size-h1-opt-btn', 'h1-size'],
        ['#tool-size-h2-opt-btn', 'h2-size'],
        ['#tool-size-decrease-opt-btn', 'decrease-size'],
    ];

    sizeToolMap.forEach(([sel, cls]) => {
        const id = sel.slice(1);
        const btn = byId(id) || $(sel);
        bindLineFormatToolButton(btn, () => lines.applyLineSizeClass(cls));
    });

    const toolMap = [
        ['#tool-bold-opt-btn', 'bold', []],
        ['#tool-underlined-opt-btn', 'underlined', []],
        ['#tool-color-red-opt-btn', 'red-color', COLOR_CLASSES],
        ['#tool-color-orange-opt-btn', 'orange-color', COLOR_CLASSES],
        ['#tool-color-green-opt-btn', 'green-color', COLOR_CLASSES],
        ['#tool-color-blue-opt-btn', 'blue-color', COLOR_CLASSES],
        ['#tool-color-l-opt-btn', 'l-color', COLOR_CLASSES.filter((c) => c !== 'l-color')],
        ['#tool-checklist-opt-btn', 'checklist', []],
        ['#tool-box-opt-btn', 'box', []],
    ];

    toolMap.forEach(([sel, cls, ex]) => {
        const id = sel.slice(1);
        const btn = byId(id) || $(sel);
        bindLineFormatToolButton(btn, () => {
            if (cls === 'checklist') blocks.toggleChecklistClass(lines.getTargetLines());
            else lines.toggleLineClass(cls, ex);
        });
    });

    bindLineFormatToolButton($('#tool-size-increase-opt-btn'), () => lines.applyLineSizeClass(null));

    bindLineFormatToolButton($('#tool-color-xxl-opt-btn'), () => {
        const page = getActivePage();
        if (!page) return;
        lines.withPreservedLineCaret(page, () => {
            lines.getTargetLines().forEach((line) => {
                COLOR_CLASSES.forEach((c) => line.classList.remove(c));
                touchPage(line.parentElement.id);
                syncPageAreaFromPage(line.parentElement);
            });
            lines.updateToolbarState();
        });
    });

    const toolImageInput = $('#tool-image-input');
    const toolImageBtn = $('#tool-image-opt-btn');
    toolImageBtn?.addEventListener('mousedown', () => blocks.captureImageInsertAnchor());
    toolImageBtn?.addEventListener('click', () => toolImageInput?.click());
    toolImageInput?.addEventListener('click', () => toggleClass(toolImageBtn, 'on', true));
    toolImageInput?.addEventListener('cancel', () => toggleClass(toolImageBtn, 'on', false));
    toolImageInput?.addEventListener('blur', () => toggleClass(toolImageBtn, 'on', false));
    blocks.handleImageInput(
        toolImageInput,
        (src) => {
            blocks.insertImageToBoard(src);
            toggleClass(toolImageBtn, 'on', false);
        },
        () => toggleClass(toolImageBtn, 'on', false)
    );

    document.addEventListener('selectionchange', () => lines.updateToolbarState());
}

function initDropdowns() {
    $$('.dropdown-btn-wrap').forEach((group) => {
        const valueBtn = group.querySelector('.dropdown-btn');
        valueBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOn = group.classList.contains('on');
            $$('.dropdown-btn-wrap').forEach((g) => toggleClass(g, 'on', false));
            if (!isOn) toggleClass(group, 'on', true);
        });
        group.querySelectorAll('.dropdown-opt-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const span = group.querySelector('.dropdown-value');
                if (span) span.textContent = btn.textContent.trim();
                toggleClass(group, 'on', false);
                if (group.id === 'set-theme-dropdown-btn-wrap') {
                    const themeId = normalizeThemeId(btn.id);
                    setTheme(themeId, { updateLabel: false });
                    syncSetCompleteBtn();
                }
                if (group.id === 'set-lang-dropdown-btn-wrap') {
                    const langId = normalizeLangId(btn.id);
                    setLang(langId, { updateLabel: false });
                    syncSetCompleteBtn();
                }
            });
        });
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('.dropdown-btn-wrap')) return;
        $$('.dropdown-btn-wrap').forEach((g) => {
            toggleClass(g, 'on', false);
        });
    });

    bindModalOverlayClose(app.settingsDialog, () => closeSet({ restore: true }));
}

function initSettings() {
    $('.modal-close-btn', app.settingsDialog)?.addEventListener('click', () => {
        closeSet({ restore: true });
    });

    $('#set-complete-btn')?.addEventListener('click', () => {
        if ($('#set-complete-btn')?.disabled) return;
        closeSet({ save: true });
    });

    const setMemberProfileImgInput = $('#set-member-profile-img-input');
    blocks.handleImageInput(setMemberProfileImgInput, (src) => {
        const img = $('#set-member-profile-img img');
        if (img) img.src = src;
        syncSetCompleteBtn();
    });

    bindInputHints(
        $('#set-member-nickname-input'),
        $('#set-member-nickname-input-txt'),
        nicknameHintRules({
            isUnchanged: (v) => v === (app.setSnapshot?.nickname ?? ''),
            onChange() {
                syncSetCompleteBtn();
            },
        })
    );

    bindInputHints(
        $('#set-member-email-input'),
        $('#set-member-email-input')?.parentElement?.querySelector('.email-input-txt'),
        emailHintRules({
            isUnchanged: (v) => normalizeEmail(v) === (app.setSnapshot?.email ?? ''),
            onChange() {
                clearSetMemberAuthOnEmailChange();
                syncSetMemberAuthFromEmail(false);
                syncSetCompleteBtn();
            },
        })
    );

    bindInputHints(
        $('#set-member-auth-input'),
        $('#set-member-auth-input')?.parentElement?.querySelector('.auth-input-txt'),
        authHintRules({
            onChange() {
                syncSetCompleteBtn();
            },
        })
    );

    bindInputHints(
        $('#set-member-pw-input'),
        $('#set-member-pw-input')?.parentElement?.querySelector('.pw-input-txt'),
        pwHintRules({
            isUnchanged: (v) => v === (app.setSnapshot?.pw ?? ''),
            onChange() {
                clearSetMemberConfirmOnPwChange();
                syncSetMemberConfirmFromPw(false);
                syncSetCompleteBtn();
            },
        })
    );

    bindInputHints(
        $('#set-member-confirm-input'),
        $('#set-member-confirm-input')?.parentElement?.querySelector('.confirm-input-txt'),
        confirmHintRules(() => $('#set-member-pw-input'), {
            onChange() {
                syncSetCompleteBtn();
            },
        })
    );

    initSlideCheckGroups();
    bindSetMemberEnterFlow();

    $('#set-member-form')?.addEventListener('submit', (e) => e.preventDefault());

    byId('set-noti-slide-input')?.addEventListener('change', function () {
        if (this.disabled) return;
        syncSetCompleteBtn();
    });

    toggleClass($('#set-guest'), 'on', true);
    $('#set-member')?.classList.remove('on');
}

function initLogin() {
    const skipSetMemberFormInput = (input) => !!input.closest('#set-member-form');

    $$('.email-input').forEach((input) => {
        if (skipSetMemberFormInput(input)) return;
        const hint = input.parentElement?.querySelector('.email-input-txt');
        bindInputHints(input, hint, emailHintRules());
    });

    $$('.pw-input').forEach((input) => {
        if (skipSetMemberFormInput(input)) return;
        const hint = input.parentElement?.querySelector('.pw-input-txt');
        bindInputHints(input, hint, pwHintRules());
    });

    $$('.auth-input').forEach((input) => {
        if (skipSetMemberFormInput(input)) return;
        const hint = input.parentElement?.querySelector('.auth-input-txt');
        bindInputHints(input, hint, authHintRules());
    });

    $$('.confirm-input').forEach((input) => {
        if (skipSetMemberFormInput(input)) return;
        const hint = input.parentElement?.querySelector('.confirm-input-txt');
        const form = input.closest('form');
        bindInputHints(input, hint, confirmHintRules(() => form?.querySelector('.pw-input')));
    });

    $('#login-join-btn')?.addEventListener('click', openJoin);
    $('#login-reset-btn')?.addEventListener('click', openReset);

    $('#login-guest-btn')?.addEventListener('click', () => {
        showAppRoute();
        toggleClass($('#set-guest'), 'on', true);
        toggleClass($('#set-member'), 'on', false);
        const sidebarNickname = $('#sidebar-nickname');
        if (sidebarNickname) sidebarNickname.textContent = '게스트';
        syncNotiControl({ enabled: false, checked: false });
        captureSetSnapshot();
        persistSettingsFromDom({
            authMode: 'guest',
            nickname: '게스트',
            email: '',
            img: DEFAULT_PROFILE_IMG,
            noti: false,
        });
    });

    const loginForm = $('#login-form');
    loginForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLoginMember();
    });

    $('#login-member-btn')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleLoginMember();
    });

    bindLoginEnterFlow();
}

function init() {
    bindDomRefs();
    wireStorageHooks();
    const settings = loadSettings();
    applyPersistedSettings(settings);
    initTheme();
    window.addEventListener('resize', syncSidebarResponsive);
    syncSidebarResponsive();

    initRoutes();
    initSidebar();
    initPageAreas();
    initBoard();
    initToolbar();
    initDropdowns();
    initSettings();
    initLogin();
    initJoinReset();
    bindModalEscapeClose();
    captureSetSnapshot();

    if (settings.authMode === 'guest' || settings.authMode === 'member') {
        applyAuthSession(settings);
        showAppRoute();
    } else {
        syncNotiControl({ enabled: false, checked: false });
        if (app.appRoute?.classList.contains('on')) {
            showAppRoute();
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

