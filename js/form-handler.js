import {
  app,
  $,
  $$,
  byId,
  toggleClass,
  setButtonEnabled,
  isValidEmail,
  normalizeEmail,
  isValidNickname,
  isValidPw,
  isValidAuth,
  setCheckboxValue,
  getCheckboxValue,
  isImageFile,
  readImageFile,
} from './utils.js';
import {
  AUTH_FOCUS_MSG,
  EMAIL_FOCUS_MSG,
  PW_FOCUS_MSG,
  NICKNAME_FOCUS_MSG,
  THEME_IDS,
  THEME_LABELS,
  LANG_IDS,
  LANG_LABELS,
  DEFAULT_PROFILE_IMG,
} from './constants.js';
import { saveSettings } from './storage-service.js';

export function syncSetMemberEmailFieldTrim() {
    const email = $('#set-member-email-input');
    if (email) email.value = normalizeEmail(email.value);
}

export function bindInputHints(input, hintEl, rules) {
    if (!input || !hintEl) return;

    function showFocusDefault() {
        hintEl.textContent = rules.focusMsg;
        hintEl.classList.remove('on', 'off');
    }

    function showValidationHint(v) {
        const ok = rules.validate(v);
        if (ok) {
            hintEl.textContent = rules.successMsg;
            hintEl.classList.add('on');
            hintEl.classList.remove('off');
        } else {
            hintEl.textContent = rules.errorMsg;
            hintEl.classList.add('off');
            hintEl.classList.remove('on');
        }
        return ok;
    }

    function showHintForValue(v) {
        if (!v || rules.isUnchanged?.(v)) {
            showFocusDefault();
            return rules.validate?.(v) ?? false;
        }
        return showValidationHint(v);
    }

    input.addEventListener('focus', () => {
        showHintForValue(input.value);
    });
    input.addEventListener('blur', () => {
        hintEl.textContent = '';
        hintEl.classList.remove('on', 'off');
    });
    input.addEventListener('input', () => {
        const v = input.value;
        if (!v && rules.emptyMsg) {
            hintEl.textContent = rules.emptyMsg;
            hintEl.classList.add('off');
            hintEl.classList.remove('on');
            rules.onChange?.(false);
            return;
        }
        const ok = showHintForValue(v);
        rules.onChange?.(ok);
    });
}

export function emailHintRules(extra = {}) {
    return {
        focusMsg: EMAIL_FOCUS_MSG,
        successMsg: '이메일이 입력되었어요.',
        errorMsg: '이메일을 다시 확인해 주세요.',
        validate: isValidEmail,
        ...extra,
    };
}

export function pwHintRules(extra = {}) {
    return {
        focusMsg: PW_FOCUS_MSG,
        successMsg: '비밀번호가 입력되었어요.',
        errorMsg: '비밀번호를 다시 확인해 주세요.',
        validate: isValidPw,
        ...extra,
    };
}

export function authHintRules(extra = {}) {
    return {
        focusMsg: AUTH_FOCUS_MSG,
        successMsg: '인증번호가 입력되었어요.',
        errorMsg: '인증번호를 다시 확인해 주세요.',
        validate: isValidAuth,
        ...extra,
    };
}

export function confirmHintRules(getPwInput, extra = {}) {
    return {
        focusMsg: '입력한 비밀번호와 동일한 비밀번호를 입력하세요.',
        successMsg: '비밀번호가 입력되었어요.',
        errorMsg: '비밀번호를 다시 확인해 주세요.',
        validate: (v) => {
            const pw = getPwInput?.();
            return v === (pw?.value || '') && isValidPw(pw?.value);
        },
        ...extra,
    };
}

export function nicknameHintRules(extra = {}) {
    return {
        focusMsg: NICKNAME_FOCUS_MSG,
        successMsg: '닉네임이 입력되었어요.',
        errorMsg: '닉네임을 다시 확인해 주세요.',
        validate: isValidNickname,
        ...extra,
    };
}

export function captureSetSnapshot() {
    syncSetMemberEmailFieldTrim();
    app.setSnapshot = {
        img: $('#set-member-profile-img img')?.src,
        nickname: $('#set-member-nickname-input')?.value,
        email: normalizeEmail($('#set-member-email-input')?.value),
        pw: $('#set-member-pw-input')?.value ?? '',
        theme: getActiveThemeId(),
        lang: getActiveLangId(),
        noti: $('#set-guest')?.classList.contains('on')
            ? false
            : getCheckboxValue(byId('set-noti-slide-input')),
    };
}

export function restoreSetSnapshot() {
    if (!app.setSnapshot) return;
    const img = $('#set-member-profile-img img');
    if (img) img.src = app.setSnapshot.img;
    const nicknameInput = $('#set-member-nickname-input');
    if (nicknameInput) nicknameInput.value = app.setSnapshot.nickname;
    const email = $('#set-member-email-input');
    if (email) email.value = app.setSnapshot.email;
    const pw = $('#set-member-pw-input');
    if (pw) pw.value = app.setSnapshot.pw ?? '';
    const themeId = app.setSnapshot.theme || THEME_IDS.SYSTEM;
    setTheme(themeId);
    setLang(app.setSnapshot.lang || LANG_IDS.KO);
    const isGuest = $('#set-guest')?.classList.contains('on');
    syncNotiControl({
        enabled: !isGuest,
        checked: isGuest ? false : (app.setSnapshot.noti ?? true),
    });
    clearSetMemberInputHint($('#set-member-nickname-input'));
    clearSetMemberInputHint($('#set-member-email-input'));
    clearSetMemberInputHint($('#set-member-pw-input'));
    setButtonEnabled($('#set-complete-btn'), false);
}

export function resetSetFields() {
    const auth = $('#set-member-auth-input');
    const confirm = $('#set-member-confirm-input');
    if (auth) {
        auth.value = '';
        auth.disabled = true;
        clearSetMemberInputHint(auth);
    }
    if (confirm) {
        confirm.value = '';
        confirm.disabled = true;
        clearSetMemberInputHint(confirm);
    }
    setButtonEnabled($('#set-complete-btn'), false);
    $$('.dropdown-btn-wrap').forEach((g) => {
        toggleClass(g, 'on', false);
    });
}

export function closeSet(options = {}) {
    const { restore = false, save = false } = options;

    if (restore) {
        restoreSetSnapshot();
        syncSetMemberDependentInputs(false);
    }

    if (save && !$('#set-complete-btn')?.disabled) {
        const setMemberProfileImg = $('#set-member-profile-img img');
        const sidebarProfileImg = $('#sidebar-profile-img img');
        if (setMemberProfileImg && sidebarProfileImg && app.setSnapshot?.img !== setMemberProfileImg.src) {
            sidebarProfileImg.src = setMemberProfileImg.src;
        }
        const nicknameInput = $('#set-member-nickname-input');
        let nickname = nicknameInput?.value ?? '';
        if (!isValidNickname(nickname)) {
            nickname = app.setSnapshot?.nickname ?? '';
            if (nicknameInput) nicknameInput.value = nickname;
        } else {
            const sidebarNickname = $('#sidebar-nickname');
            if (sidebarNickname && app.setSnapshot?.nickname !== nickname) {
                sidebarNickname.textContent = nickname;
            }
        }

        const emailInput = $('#set-member-email-input');
        const authInput = $('#set-member-auth-input');
        const pwInput = $('#set-member-pw-input');
        const confirmInput = $('#set-member-confirm-input');

        const prevEmail = app.setSnapshot?.email ?? '';
        const nextEmail = normalizeEmail(emailInput?.value ?? '');
        if (nextEmail !== prevEmail && !isValidAuth(authInput?.value ?? '')) {
            if (emailInput) emailInput.value = prevEmail;
        }

        const prevPw = app.setSnapshot?.pw ?? '';
        const nextPw = pwInput?.value ?? '';
        const confirmOk = (confirmInput?.value ?? '') === nextPw && isValidPw(nextPw);
        if (nextPw !== prevPw && !confirmOk) {
            if (pwInput) pwInput.value = prevPw;
        }

        captureSetSnapshot();
        persistSettingsFromDom();
    }

    toggleClass(app.settingsDialog, 'on', false);
    resetSetFields();
}

export function persistSettingsFromDom(extra = {}) {
    const fromDom = $('#set-member')?.classList.contains('on')
        ? 'member'
        : $('#set-guest')?.classList.contains('on')
          ? 'guest'
          : null;
    const authMode = 'authMode' in extra ? extra.authMode : fromDom;
    const noti =
        'noti' in extra
            ? extra.noti
            : authMode === 'guest'
              ? false
              : getCheckboxValue(byId('set-noti-slide-input'));
    return saveSettings({
        theme: getActiveThemeId(),
        lang: getActiveLangId(),
        noti,
        authMode,
        nickname: $('#set-member-nickname-input')?.value ?? '',
        email: normalizeEmail($('#set-member-email-input')?.value ?? ''),
        img: $('#set-member-profile-img img')?.src || DEFAULT_PROFILE_IMG,
        ...extra,
    });
}

export function clearSetMemberInputHint(input) {
    const hint = input?.parentElement?.querySelector('.input-txt');
    if (!hint) return;
    hint.textContent = '';
    hint.classList.remove('on', 'off');
}

export function syncSetMemberDependentField({ source, target, normalize, isValid, prevValue, focusOnEnable }) {
    if (!source || !target) return;
    const value = normalize ? normalize(source.value) : source.value;
    const enable = isValid(value) && value !== prevValue;
    target.disabled = !enable;
    if (!enable) {
        target.value = '';
        clearSetMemberInputHint(target);
    } else if (focusOnEnable) {
        target.focus();
    }
}

export function syncSetMemberAuthFromEmail(focusOnEnable) {
    syncSetMemberDependentField({
        source: $('#set-member-email-input'),
        target: $('#set-member-auth-input'),
        normalize: normalizeEmail,
        isValid: isValidEmail,
        prevValue: app.setSnapshot?.email ?? '',
        focusOnEnable,
    });
}

export function syncSetMemberConfirmFromPw(focusOnEnable) {
    syncSetMemberDependentField({
        source: $('#set-member-pw-input'),
        target: $('#set-member-confirm-input'),
        isValid: isValidPw,
        prevValue: app.setSnapshot?.pw ?? '',
        focusOnEnable,
    });
}

export function syncSetMemberDependentInputs(focusOnEnable) {
    syncSetMemberAuthFromEmail(focusOnEnable);
    syncSetMemberConfirmFromPw(focusOnEnable);
}

export function clearSetMemberDependentInput(input) {
    if (!input?.value) return;
    input.value = '';
    clearSetMemberInputHint(input);
    setButtonEnabled($('#set-complete-btn'), false);
}

export function clearSetMemberAuthOnEmailChange() {
    clearSetMemberDependentInput($('#set-member-auth-input'));
}

export function clearSetMemberConfirmOnPwChange() {
    clearSetMemberDependentInput($('#set-member-confirm-input'));
}

export function bindEnterKey(input, handler) {
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        handler(e, input);
    });
}

export function bindEnterFocus(input, nextInput, canAdvance) {
    bindEnterKey(input, (_, el) => {
        if (canAdvance && !canAdvance(el)) return;
        nextInput?.focus();
    });
}

export function bindEnterButton(input, button, canActivate) {
    bindEnterKey(input, () => {
        if (canActivate && !canActivate()) return;
        if (button?.disabled) return;
        button.click();
    });
}

export function bindSetMemberDependentEnter(input, syncFn, isValid) {
    bindEnterKey(input, (_, el) => {
        const snapshotKey = el.id === 'set-member-email-input' ? 'email' : 'pw';
        const prev = app.setSnapshot?.[snapshotKey] ?? '';
        const value = snapshotKey === 'email' ? normalizeEmail(el.value) : el.value;
        if (isValid(value) && value !== prev) {
            syncFn(true);
        }
    });
}

export function bindCompleteAreaEnter(modal, completeArea, completeBtn) {
    modal?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        if (!completeArea?.classList.contains('on')) return;
        // 마지막 step에서 Enter → 완료 전환 직후 같은 keydown이 버블링되면
        // 완료 버튼이 바로 눌려 모달이 닫히는 것을 막는다.
        if (!completeArea.contains(e.target)) return;
        e.preventDefault();
        if (completeBtn?.disabled) return;
        completeBtn.click();
    });
}

export function bindJoinTermEnter(step, nextBtn) {
    step?.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        if (!step.classList.contains('on')) return;
        if (nextBtn?.disabled) return;
        if (e.target.matches('input[type=checkbox], button, a')) return;
        e.preventDefault();
        nextBtn.click();
    });
}

export function bindLoginEnterFlow() {
    bindEnterFocus($('#login-email-input'), $('#login-pw-input'), (el) => isValidEmail(el.value));
    bindEnterButton($('#login-pw-input'), $('#login-member-btn'));
}

export function bindSetMemberEnterFlow() {
    bindEnterFocus($('#set-member-nickname-input'), $('#set-member-email-input'), (el) => isValidNickname(el.value));
    bindSetMemberDependentEnter($('#set-member-email-input'), syncSetMemberAuthFromEmail, isValidEmail);
    bindEnterFocus(
        $('#set-member-auth-input'),
        $('#set-member-pw-input'),
        (el) => !el.disabled && isValidAuth(el.value)
    );
    bindSetMemberDependentEnter($('#set-member-pw-input'), syncSetMemberConfirmFromPw, isValidPw);
    bindEnterButton($('#set-member-confirm-input'), $('#set-complete-btn'));
}

export function normalizeThemeId(themeId) {
    if (
        themeId === 'system-theme' ||
        themeId === 'system-theme-btn' ||
        themeId === THEME_IDS.SYSTEM
    ) {
        return THEME_IDS.SYSTEM;
    }
    if (
        themeId === 'light-theme' ||
        themeId === 'light-theme-btn' ||
        themeId === THEME_IDS.LIGHT
    ) {
        return THEME_IDS.LIGHT;
    }
    if (
        themeId === 'dark-theme' ||
        themeId === 'dark-theme-btn' ||
        themeId === THEME_IDS.DARK
    ) {
        return THEME_IDS.DARK;
    }
    return THEME_IDS.SYSTEM;
}

export function getThemeLabel(themeId) {
    return THEME_LABELS[normalizeThemeId(themeId)] || THEME_LABELS[THEME_IDS.SYSTEM];
}

export function inferThemeIdFromHtml() {
    const html = document.documentElement;
    if (html.classList.contains('light')) return THEME_IDS.LIGHT;
    if (html.classList.contains('dark')) return THEME_IDS.DARK;
    return THEME_IDS.SYSTEM;
}

export function getActiveThemeId() {
    const wrap = $('#set-theme-dropdown-btn-wrap');
    return normalizeThemeId(wrap?.dataset.activeTheme || inferThemeIdFromHtml());
}

export function applyThemeById(themeId) {
    const html = document.documentElement;
    html.classList.remove('light', 'dark');
    const id = normalizeThemeId(themeId);
    if (id === THEME_IDS.LIGHT) html.classList.add('light');
    else if (id === THEME_IDS.DARK) html.classList.add('dark');
}

export function setTheme(themeId, { updateLabel = true } = {}) {
    const wrap = $('#set-theme-dropdown-btn-wrap');
    const id = normalizeThemeId(themeId);
    if (wrap) wrap.dataset.activeTheme = id;
    applyThemeById(id);
    if (updateLabel) {
        const span = wrap?.querySelector('.dropdown-value');
        if (span) span.textContent = getThemeLabel(id);
    }
}

export function normalizeLangId(langId) {
    if (langId === LANG_IDS.KO || langId === 'ko' || langId === 'ko-KR') return LANG_IDS.KO;
    return LANG_IDS.KO;
}

export function getLangLabel(langId) {
    return LANG_LABELS[normalizeLangId(langId)] || LANG_LABELS[LANG_IDS.KO];
}

export function getActiveLangId() {
    const wrap = $('#set-lang-dropdown-btn-wrap');
    return normalizeLangId(wrap?.dataset.activeLang || LANG_IDS.KO);
}

export function setLang(langId, { updateLabel = true } = {}) {
    const wrap = $('#set-lang-dropdown-btn-wrap');
    const id = normalizeLangId(langId);
    if (wrap) wrap.dataset.activeLang = id;
    document.documentElement.lang = id === LANG_IDS.KO ? 'ko' : 'ko';
    if (updateLabel) {
        const span = wrap?.querySelector('.dropdown-value');
        if (span) span.textContent = getLangLabel(id);
    }
}

export function initTheme() {
    const wrap = $('#set-theme-dropdown-btn-wrap');
    const themeId = wrap?.dataset.activeTheme || inferThemeIdFromHtml();
    setTheme(themeId);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemSchemeChange = () => {
        if (getActiveThemeId() === THEME_IDS.SYSTEM) applyThemeById(THEME_IDS.SYSTEM);
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemSchemeChange);
    else mq.addListener(onSystemSchemeChange);
}

export function applyPersistedSettings(settings) {
    if (!settings) return;
    setTheme(settings.theme || THEME_IDS.SYSTEM);
    setLang(settings.lang || LANG_IDS.KO);
}

export function syncNotiControl({ enabled, checked }) {
    const input = byId('set-noti-slide-input');
    const wrap = input?.closest('.slide-input-wrap');
    const track = wrap?.querySelector('.slide-btn');
    if (!input) return;

    input.disabled = !enabled;
    setCheckboxValue(input, !!checked);
    if (track) {
        track.disabled = !enabled;
        track.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        syncSlideCheckTrack(input, track);
    }
    toggleClass(wrap, 'disabled', !enabled);
}

export function getAuthStepList(form) {
    if (!form) return null;
    if (app.joinDialog?.contains(form)) return byId('join-list');
    if (app.resetDialog?.contains(form)) return byId('reset-list');
    return null;
}

export function getAuthSteps(form) {
    const list = getAuthStepList(form);
    return list ? [...list.children] : [];
}

export function buildStepIndicators(form) {
    const list = form?.querySelector('.indicator-list');
    const steps = getAuthSteps(form);
    if (!list) return;
    list.innerHTML = '';
    steps.forEach(() => {
        const li = document.createElement('li');
        list.appendChild(li);
    });
    syncStepIndicators(form);
}

export function syncStepIndicators(form) {
    const list = form?.querySelector('.indicator-list');
    const steps = getAuthSteps(form);
    if (!list) return;
    const items = [...list.children];
    const activeIdx = steps.findIndex((s) => s.classList.contains('on'));
    items.forEach((li, i) => toggleClass(li, 'on', i === activeIdx));
}

export function initMarkInputGroups(root = document) {
    $$('.mark-input-wrap', root).forEach((group) => {
        const input = group.querySelector('input[type=checkbox]');
        const label = group.querySelector('label');
        if (!input || !label) return;

        setCheckboxValue(input, input.checked);
        label.removeAttribute('for');

        const toggleCheckbox = () => {
            setCheckboxValue(input, !input.checked);
            input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        group.addEventListener('click', (e) => {
            if (e.target.closest('a.link-a')) return;
            e.preventDefault();
            toggleCheckbox();
        });

        input.addEventListener('change', function () {
            setCheckboxValue(this, this.checked);
        });
    });
}

export function syncSlideCheckTrack(input, track) {
    track.setAttribute('aria-checked', input.checked ? 'true' : 'false');
}

export function initSlideCheckGroups(root = document) {
    $$('.slide-input-wrap', root).forEach((group) => {
        const input = group.querySelector('input[type=checkbox]');
        const track = group.querySelector('.slide-btn');
        if (!input || !track) return;

        setCheckboxValue(input, input.checked);

        track.setAttribute('role', 'switch');
        const title = group.closest('li')?.querySelector('.s-title');
        if (title) {
            if (!title.id) title.id = `${input.id}-label`;
            track.setAttribute('aria-labelledby', title.id);
        }
        syncSlideCheckTrack(input, track);

        track.addEventListener('click', (e) => {
            e.preventDefault();
            if (input.disabled || track.disabled) return;
            setCheckboxValue(input, !input.checked);
            syncSlideCheckTrack(input, track);
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });

        input.addEventListener('change', function () {
            setCheckboxValue(this, this.checked);
            syncSlideCheckTrack(this, track);
        });
    });
}

export function openAuth(modal) {
    toggleClass(modal, 'on', true);
    const form = $('.modal-form', modal);
    toggleClass(form, 'on', true);
    toggleClass($('.complete-area', modal), 'on', false);
}

export function closeAuth(modal, { resetCheckboxes = false } = {}) {
    toggleClass(modal, 'on', false);
    const form = $('.modal-form', modal);
    if (!form) return;
    getAuthSteps(form).forEach((s, i) => toggleClass(s, 'on', i === 0));
    form.querySelectorAll('input').forEach((inp) => {
        if (inp.type === 'checkbox') {
            if (resetCheckboxes) setCheckboxValue(inp, false);
        } else {
            inp.value = '';
        }
    });
    $$('.email-input-txt, .pw-input-txt, .auth-input-txt, .confirm-input-txt', form).forEach((p) => {
        p.textContent = '';
        p.classList.remove('on', 'off');
    });
    toggleClass($('.complete-area', modal), 'on', false);
    toggleClass(form, 'on', true);
    const nextBtn = $('.modal-next-btn', form);
    if (nextBtn) nextBtn.textContent = '다음';
    setButtonEnabled($('.modal-prev-btn', form), false);
    setButtonEnabled(nextBtn, false);
    syncStepIndicators(form);
}

export function openJoin() {
    openAuth(app.joinDialog);
}

export function openReset() {
    openAuth(app.resetDialog);
}

export function closeJoin() {
    closeAuth(app.joinDialog, { resetCheckboxes: true });
}

export function closeReset() {
    closeAuth(app.resetDialog);
}

export function bindModalOverlayClose(modal, closeFn) {
    modal?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) closeFn();
    });
}

export function bindModalDismiss(modal, closeFn) {
    $('.modal-close-btn', modal)?.addEventListener('click', closeFn);
    $('.modal-complete-btn', modal)?.addEventListener('click', closeFn);
    bindModalOverlayClose(modal, closeFn);
}

export function areRequiredJoinTermsChecked() {
    return (
        getCheckboxValue(byId('join-term-service-mark-input')) &&
        getCheckboxValue(byId('join-term-privacy-mark-input'))
    );
}

export function isJoinTermStep(step) {
    return !!step?.querySelector('#join-term-mark-input');
}

export function bindModalEscapeClose() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || e.isComposing) return;

        if (app.settingsDialog?.classList.contains('on')) {
            const openDropdown = $('.dropdown-btn-wrap.on');
            if (openDropdown) {
                toggleClass(openDropdown, 'on', false);
                e.preventDefault();
                return;
            }
            closeSet({ restore: true });
            e.preventDefault();
            return;
        }
        if (app.joinDialog?.classList.contains('on')) {
            closeJoin();
            e.preventDefault();
            return;
        }
        if (app.resetDialog?.classList.contains('on')) {
            closeReset();
            e.preventDefault();
        }
    });
}

export function initJoinReset() {
    bindModalDismiss(app.joinDialog, closeJoin);
    bindModalDismiss(app.resetDialog, closeReset);

    const joinForm = $('.modal-form', app.joinDialog);
    const resetForm = $('.modal-form', app.resetDialog);
    buildStepIndicators(joinForm);
    buildStepIndicators(resetForm);

    const wireStepForm = (form) => {
        if (!form) return;
        const modal = form.closest('.modal');
        const steps = getAuthSteps(form);
        const prevBtn = $('.modal-prev-btn', form);
        const nextBtn = $('.modal-next-btn', form);
        const completeArea = $('.complete-area', modal);
        const completeBtn = $('.modal-complete-btn', modal);

        function isStepValid(step) {
            if (!step) return false;
            if (isJoinTermStep(step)) {
                return areRequiredJoinTermsChecked();
            }
            const input = step.querySelector('input:not([type=checkbox])');
            if (!input) return false;
            if (input.classList.contains('email-input')) return isValidEmail(input.value);
            if (input.classList.contains('auth-input')) return isValidAuth(input.value);
            if (input.classList.contains('pw-input')) return isValidPw(input.value);
            if (input.classList.contains('confirm-input')) {
                const pw = form.querySelector('.pw-input');
                return input.value === (pw?.value || '') && isValidPw(pw?.value);
            }
            return false;
        }

        function syncNextBtnForActiveStep() {
            const step = steps.find((s) => s.classList.contains('on'));
            setButtonEnabled(nextBtn, isStepValid(step));
        }

        const goStep = (idx) => {
            steps.forEach((s, i) => toggleClass(s, 'on', i === idx));
            syncStepIndicators(form);
            setButtonEnabled(prevBtn, idx > 0);
        };

        form?.addEventListener('submit', (e) => e.preventDefault());

        steps.forEach((step) => {
            const input = step.querySelector('input:not([type=checkbox])');
            if (!input) return;
            input.addEventListener('input', () => {
                if (step.classList.contains('on')) syncNextBtnForActiveStep();
            });
            bindEnterButton(input, nextBtn, () => step.classList.contains('on'));
        });

        prevBtn?.addEventListener('click', () => {
            const idx = steps.findIndex((s) => s.classList.contains('on'));
            if (idx <= 0) return;
            const cur = steps[idx];
            const inp = cur.querySelector('input:not([type=checkbox])');
            if (inp) inp.value = '';
            if (isJoinTermStep(cur)) {
                setCheckboxValue(byId('join-term-mark-input'), false);
                ['join-term-service-mark-input', 'join-term-privacy-mark-input', 'join-term-marketing-mark-input'].forEach((id) => {
                    setCheckboxValue(byId(id), false);
                });
            }
            nextBtn.textContent = '다음';
            goStep(idx - 1);
            syncNextBtnForActiveStep();
        });

        nextBtn?.addEventListener('click', () => {
            if (nextBtn.disabled) return;
            const idx = steps.findIndex((s) => s.classList.contains('on'));
            const cur = steps[idx];
            if (!cur) return;

            if (idx >= steps.length - 1) {
                toggleClass(form, 'on', false);
                toggleClass(completeArea, 'on', true);
                completeBtn?.focus();
                return;
            }

            goStep(idx + 1);
            const nextInput = steps[idx + 1]?.querySelector('input:not([type=checkbox])');
            nextInput?.focus();
            if (idx + 1 >= steps.length - 1) {
                nextBtn.textContent = '확인';
            }
            setButtonEnabled(nextBtn, false);
        });
    };

    wireStepForm(joinForm);
    wireStepForm(resetForm);

    bindCompleteAreaEnter(app.joinDialog, $('.complete-area', app.joinDialog), $('.modal-complete-btn', app.joinDialog));
    bindCompleteAreaEnter(app.resetDialog, $('.complete-area', app.resetDialog), $('.modal-complete-btn', app.resetDialog));
    bindJoinTermEnter(
        getAuthSteps(joinForm).find((step) => isJoinTermStep(step)),
        $('.modal-next-btn', joinForm)
    );

    initMarkInputGroups();

    const termAll = $('#join-term-mark-input');
    const termIds = ['join-term-service-mark-input', 'join-term-privacy-mark-input', 'join-term-marketing-mark-input'];
    const syncJoinNextFromTerms = () => {
        setButtonEnabled($('.modal-next-btn', joinForm), areRequiredJoinTermsChecked());
    };
    termIds.forEach((id) => {
        const inp = byId(id);
        inp?.addEventListener('change', () => {
            const vals = termIds.map((tid) => getCheckboxValue(byId(tid)));
            setCheckboxValue(termAll, vals.every(Boolean));
            syncJoinNextFromTerms();
        });
    });
    termAll?.addEventListener('change', () => {
        const v = getCheckboxValue(termAll);
        termIds.forEach((tid) => setCheckboxValue(byId(tid), v));
        syncJoinNextFromTerms();
    });
}

