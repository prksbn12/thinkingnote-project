import { app, $, $$, byId, toggleClass, setButtonEnabled, appendDualIcons, migratePageIconTags } from './utils.js';
import {
  SIZE_CLASSES,
  COLOR_CLASSES,
  INDENT_CLASS,
  TOOL_LINE_CLASSES,
  NOTE_PAGE_SEL,
  NOTE_PAGE_ON_SEL,
  IMAGE_CLIPBOARD_MIME,
  LINE_CLIPBOARD_MIME,
} from './constants.js';
import {
  scheduleSaveAppState,
  touchPage,
  getPageMeta,
  sortPageArea,
} from './storage-service.js';
import * as blocks from './editor-block-service.js';

export function getLineContext() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const page =
        (range.startContainer.nodeType === Node.ELEMENT_NODE
            ? range.startContainer
            : range.startContainer.parentElement
        )?.closest?.(NOTE_PAGE_SEL) ?? null;
    if (!page) return null;
    const line = getLineFromNode(range.startContainer, page, range);
    if (!line) return { page, line: null, sel };
    return { page, line, sel };
}

export function captureActiveLineCaret(page) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !page) return null;
    const range = sel.getRangeAt(0);
    if (!page.contains(range.commonAncestorContainer)) return null;
    const line = getLineFromNode(range.startContainer, page, range);
    if (!line) return null;
    return {
        line,
        offset: getCaretOffsetInLine(line, sel),
    };
}

export function restoreActiveLineCaret(page, snapshot) {
    if (!page || !snapshot?.line?.isConnected) return;
    requestAnimationFrame(() => {
        focusLine(page, snapshot.line, snapshot.offset);
    });
}

export function withPreservedLineCaret(page, fn) {
    if (!page) {
        fn();
        return;
    }
    const snapshot = captureActiveLineCaret(page);
    fn();
    restoreActiveLineCaret(page, snapshot);
}

export function getCaretOffsetInLine(line, sel) {
    const range = sel.getRangeAt(0);
    const page = line.parentElement;
    const root = getLineEditableRoot(line);
    if (range.startContainer === page) {
        const idx = [...page.childNodes].indexOf(line);
        if (idx !== -1 && range.startOffset === idx) return 0;
    }
    if (blocks.isChecklistLine(line) && !root.contains(range.startContainer) && range.startContainer !== root) {
        if (line.contains(range.startContainer) || range.startContainer === line) return 0;
    }
    const measure = document.createRange();
    measure.selectNodeContents(root);
    try {
        measure.setEnd(range.startContainer, range.startOffset);
    } catch {
        return 0;
    }
    return measure.toString().length;
}

export function isAtLineStart(line, sel) {
    return getCaretOffsetInLine(line, sel) === 0;
}

export function isAtLineEnd(line, sel) {
    const root = getLineEditableRoot(line);
    const range = sel.getRangeAt(0);
    if (!root.contains?.(range.startContainer) && range.startContainer !== root) {
        if (blocks.isChecklistLine(line) && line.contains(range.startContainer)) return false;
        return false;
    }
    const measure = document.createRange();
    measure.selectNodeContents(root);
    try {
        measure.setStart(range.startContainer, range.startOffset);
    } catch {
        return false;
    }
    if (measure.toString().length === 0) return true;
    if (!getLineTextContent(line).length && root.querySelector('br')) return true;
    return getCaretOffsetInLine(line, sel) >= getLineTextContent(line).length;
}

export function getOffsetInLine(line, container, offset) {
    const root = getLineEditableRoot(line);
    const measure = document.createRange();
    measure.selectNodeContents(root);
    try {
        measure.setEnd(container, offset);
    } catch {
        return getLineTextContent(line).length;
    }
    return measure.toString().length;
}

export function focusPageCaret(page, offset) {
    if (!page || !app.hooks.isEditablePage(page)) return;
    // 프로그래매틱 포커스 때 focusin이 캐럿을 다시 잡아채지 않도록 한 프레임만 억제한다.
    app.suppressPageFocusIn = true;
    page.contentEditable = 'true';
    page.focus({ preventScroll: true });
    const range = document.createRange();
    const sel = window.getSelection();
    const clamped = Math.max(0, Math.min(offset, page.childNodes.length));
    range.setStart(page, clamped);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    requestAnimationFrame(() => {
        app.suppressPageFocusIn = false;
    });
    scheduleScrollCaretIntoView(page);
}

export function isCaretAtPageOffset(page, range) {
    return !!page && !!range?.collapsed && range.startContainer === page;
}

export function getPageCaretSide(page, range) {
    if (!isCaretAtPageOffset(page, range)) return null;
    const offset = range.startOffset;
    const prev = page.childNodes[offset - 1] ?? null;
    const next = page.childNodes[offset] ?? null;
    if (blocks.isImageRow(next, page)) return { side: 'before', row: next, page };
    if (blocks.isImageRow(prev, page)) return { side: 'after', row: prev, page };
    return { side: 'neutral', row: null, page };
}

export function createTextLineElement(referenceLine) {
    const div = document.createElement('div');
    const page = referenceLine?.closest?.(NOTE_PAGE_SEL);
    const cls =
        referenceLine && !blocks.isImageBlock(referenceLine) && !(page && blocks.isImageRow(referenceLine, page))
            ? copyTextLineClasses(referenceLine)
            : '';
    if (cls) div.className = cls;
    if (div.classList.contains('checklist')) blocks.wrapLineAsChecklist(div);
    else div.innerHTML = '<br>';
    return div;
}

export function focusPageEdge(page, edge) {
    const divs = getPageChildDivs(page);
    if (!divs.length) {
        focusPageCaret(page, 0);
        return;
    }
    const atStart = edge === 'start';
    const target = atStart ? divs[0] : divs[divs.length - 1];
    if (blocks.isImageBlock(target)) {
        blocks.focusBesideImage(page, target, atStart ? 'before' : 'after');
        return;
    }
    focusLine(page, target, !atStart);
}

export function focusPageStart(page) {
    focusPageEdge(page, 'start');
}

export function focusPageEnd(page) {
    focusPageEdge(page, 'end');
}

export function collapseSelectionToEnd(page, sel, range) {
    if (isFullPageTextSelection(page, range)) {
        focusPageEnd(page);
        return;
    }

    const endBlock = getPageBlockFromNode(range.endContainer, page, range, 'end');
    if (endBlock && blocks.isImageBlock(endBlock)) {
        blocks.focusBesideImage(page, endBlock, 'after');
        return;
    }

    const endLine = getLineFromNode(range.endContainer, page, range, 'end');
    if (endLine) {
        const offset = getOffsetInLine(endLine, range.endContainer, range.endOffset);
        focusLine(page, endLine, offset >= endLine.textContent.length ? true : offset);
        return;
    }

    focusPageEnd(page);
}

export function collapseSelectionToStart(page, sel, range) {
    if (isFullPageTextSelection(page, range)) {
        focusPageStart(page);
        return;
    }

    const startBlock = getPageBlockFromNode(range.startContainer, page, range, 'start');
    if (startBlock && blocks.isImageBlock(startBlock)) {
        const prev = startBlock.previousElementSibling;
        if (prev && !blocks.isImageBlock(prev)) focusLine(page, prev, true);
        else blocks.focusBesideImage(page, startBlock, 'before');
        return;
    }

    const startLine = getLineFromNode(range.startContainer, page, range, 'start');
    if (startLine) {
        const offset = getOffsetInLine(startLine, range.startContainer, range.startOffset);
        focusLine(page, startLine, offset > 0 ? offset : false);
        return;
    }

    focusPageStart(page);
}

export function scheduleScrollCaretIntoView(page) {
    const targetPage = page || app.hooks.getActivePage();
    if (!targetPage || app.isDraggingSelection || app.suppressScrollCaretIntoView) return;
    cancelAnimationFrame(app.scrollCaretFrame);
    // DOM·셀렉션 반영 후 레이아웃이 잡힌 다음에야 caret rect를 재야 스크롤이 맞다.
    app.scrollCaretFrame = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (targetPage.isConnected) scrollCaretIntoView(targetPage);
        });
    });
}

export function scrollCaretIntoView(page, line) {
    if (!app.noteArea || !page) return;

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;

    const range = sel.getRangeAt(0);
    if (!page.contains(range.commonAncestorContainer) || !range.collapsed) return;

    const scrollPadding = 24;
    const rootRect = app.noteArea.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(page).lineHeight) || 24;
    let caretTop;
    let caretBottom;

    const clientRects = range.getClientRects();
    if (clientRects.length) {
        const rect = clientRects[0];
        caretTop = rect.top;
        caretBottom = rect.bottom || rect.top + lineHeight;
    } else {
        const block = getPageBlockFromNode(range.startContainer, page, range, 'start');
        const pageCaret = getPageCaretSide(page, range);
        let target = line || (block && !blocks.isImageBlock(block) && !blocks.isImageRow(block, page) ? block : getLineFromNode(range.startContainer, page, range, 'start'));
        if (!target && pageCaret?.row) target = pageCaret.row;
        if (!target) return;
        const targetRect = target.getBoundingClientRect();
        if (pageCaret?.side === 'before') {
            caretTop = targetRect.top;
            caretBottom = targetRect.top + lineHeight;
        } else if (pageCaret?.side === 'after') {
            caretTop = targetRect.bottom - lineHeight;
            caretBottom = targetRect.bottom;
        } else {
            caretTop = targetRect.top;
            caretBottom = targetRect.bottom;
        }
    }

    if (caretTop < rootRect.top + scrollPadding) {
        app.noteArea.scrollTop += caretTop - rootRect.top - scrollPadding;
    } else if (caretBottom > rootRect.bottom - scrollPadding) {
        app.noteArea.scrollTop += caretBottom - rootRect.bottom + scrollPadding;
    }
}

export function ensureLineEditable(line) {
    if (!line || blocks.isImageBlock(line) || line.querySelector('img')) return line;
    if (blocks.isChecklistLine(line)) {
        blocks.ensureChecklistStructure(line);
        const span = blocks.getChecklistTextSpan(line);
        if (!span) return line;
        if (span.textContent.length > 0) return line;
        if (!span.querySelector('br')) span.appendChild(document.createElement('br'));
        return line;
    }
    if (line.textContent.length > 0) return line;
    if (!line.querySelector('br')) {
        line.appendChild(document.createElement('br'));
    }
    return line;
}

export function placeRangeAtLine(range, line, edge) {
    const root = getLineEditableRoot(line);
    const atStart = edge === 'start';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    if (atStart) {
        const firstText = walker.nextNode();
        if (firstText) {
            range.setStart(firstText, 0);
            range.collapse(true);
            return;
        }
        const br = root.querySelector('br');
        if (br || root.firstChild) {
            range.setStart(root, 0);
            range.collapse(true);
            return;
        }
        range.selectNodeContents(root);
        range.collapse(true);
        return;
    }

    let lastText = null;
    let node = walker.nextNode();
    while (node) {
        lastText = node;
        node = walker.nextNode();
    }
    if (lastText) {
        range.setStart(lastText, lastText.length);
        range.collapse(true);
        return;
    }
    if (root.lastChild) {
        range.setStart(root, root.childNodes.length);
        range.collapse(true);
        return;
    }
    range.selectNodeContents(root);
    range.collapse(false);
}

export function placeRangeAtLineStart(range, line) {
    placeRangeAtLine(range, line, 'start');
}

export function placeRangeAtLineEnd(range, line) {
    placeRangeAtLine(range, line, 'end');
}

export function focusLine(page, line, position) {
    if (!line || line.querySelector('img') || !app.hooks.isEditablePage(page)) return;
    ensureLineEditable(line);
    // 프로그래매틱 포커스 때 focusin이 캐럿을 다시 잡아채지 않도록 한 프레임만 억제한다.
    app.suppressPageFocusIn = true;
    page.contentEditable = 'true';
    const range = document.createRange();
    const sel = window.getSelection();
    const root = getLineEditableRoot(line);
    const textLen = getLineTextContent(line).length;

    if (position === true) {
        if (textLen === 0) placeRangeAtLineStart(range, line);
        else placeRangeAtLineEnd(range, line);
    } else if (position === false) {
        placeRangeAtLineStart(range, line);
    } else if (typeof position === 'number') {
        const offset = Math.min(Math.max(0, position), textLen);
        let remaining = offset;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let textNode = walker.nextNode();
        while (textNode) {
            const len = textNode.length;
            if (remaining <= len) {
                range.setStart(textNode, remaining);
                range.collapse(true);
                break;
            }
            remaining -= len;
            textNode = walker.nextNode();
        }
        if (!textNode) {
            if (textLen === 0) placeRangeAtLineStart(range, line);
            else placeRangeAtLineEnd(range, line);
        }
    } else {
        if (textLen === 0) placeRangeAtLineStart(range, line);
        else placeRangeAtLineEnd(range, line);
    }

    sel.removeAllRanges();
    sel.addRange(range);
    page.focus({ preventScroll: true });
    requestAnimationFrame(() => {
        app.suppressPageFocusIn = false;
    });
    scheduleScrollCaretIntoView(page);
}

export function cleanupEmptyLine(page, line) {
    if (!line?.isConnected || blocks.isImageBlock(line) || getLineTextContent(line).trim()) return line;
    const prev = line.previousElementSibling;
    const next = line.nextElementSibling;
    line.remove();
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    const remaining = page.querySelectorAll(':scope > div');
    if (!remaining.length) {
        app.hooks.updatePageTitleElement(page);
        focusPageCaret(page, 0);
        return null;
    }
    if (prev) focusLine(page, prev, true);
    else if (next) focusLine(page, next, false);
    return null;
}

export function getLineEditableRoot(line) {
    if (blocks.isChecklistLine(line)) return blocks.getChecklistTextSpan(line) || line;
    return line;
}

export function getLineTextContent(line) {
    if (!line) return '';
    if (blocks.isChecklistLine(line)) return blocks.getChecklistTextSpan(line)?.textContent ?? '';
    return line.textContent ?? '';
}

export function setLineTextContent(line, text) {
    if (!line) return;
    if (blocks.isChecklistLine(line)) {
        blocks.ensureChecklistStructure(line);
        const span = blocks.getChecklistTextSpan(line);
        if (!span) return;
        if (text) span.textContent = text;
        else span.innerHTML = '<br>';
        return;
    }
    if (text) line.textContent = text;
    else line.innerHTML = '<br>';
}

export function hasToolLineFormat(line) {
    return TOOL_LINE_CLASSES.some((c) => line?.classList.contains(c));
}

export function shouldExitToolLineFormat(line) {
    // 같은 포맷이 이어진 빈 줄에서 Enter는 포맷을 이어쓰기보다, 앞에 일반 빈 줄을 두고 포맷을 해제한다.
    if (!hasToolLineFormat(line) || getLineTextContent(line).trim()) return false;
    const prev = getAdjacentTextLine(line, 'prev');
    return (
        !!prev &&
        hasToolLineFormat(prev) &&
        copyTextLineClasses(prev) === copyTextLineClasses(line) &&
        !!getLineTextContent(prev).trim()
    );
}

export function createStyledLineAfter(line) {
    const next = document.createElement('div');
    const cls = copyTextLineClasses(line);
    if (cls) next.className = cls;
    if (next.classList.contains('checklist')) blocks.wrapLineAsChecklist(next);
    else next.innerHTML = '<br>';
    line.after(next);
    return next;
}

export function removeToolLineClasses(line) {
    if (!line) return;
    if (blocks.isChecklistLine(line)) blocks.unwrapChecklistLine(line);
    TOOL_LINE_CLASSES.forEach((c) => line.classList.remove(c));
    line.classList.remove('on');
}

export function copyTextLineClasses(lineOrClassName) {
    const className =
        typeof lineOrClassName === 'string' ? lineOrClassName : lineOrClassName?.className;
    if (!className) return '';
    return className
        .split(/\s+/)
        .filter((c) => c && (TOOL_LINE_CLASSES.includes(c) || c === INDENT_CLASS))
        .join(' ');
}

export function applyLineClassesString(line, cls) {
    if (!line) return;
    const hadChecklist = blocks.isChecklistLine(line);
    TOOL_LINE_CLASSES.forEach((c) => line.classList.remove(c));
    line.classList.remove(INDENT_CLASS);
    line.classList.remove('on');
    if (hadChecklist) blocks.unwrapChecklistLine(line);
    if (!cls) return;
    cls.split(/\s+/)
        .filter((c) => c && (TOOL_LINE_CLASSES.includes(c) || c === INDENT_CLASS))
        .forEach((c) => line.classList.add(c));
    if (line.classList.contains('checklist')) blocks.wrapLineAsChecklist(line);
}

export function getClipboardLineClassesList(e, pastedText = null) {
    let raw = e?.clipboardData?.getData(LINE_CLIPBOARD_MIME);
    if (!raw && e?.dataTransfer) raw = e.dataTransfer.getData(LINE_CLIPBOARD_MIME);
    if (raw) {
        try {
            const data = JSON.parse(raw);
            if (Array.isArray(data)) return data;
        } catch {
        }
    }
    const text = pastedText ?? getClipboardPlainText(e);
    // OS/브라우저가 커스텀 MIME을 버리는 경우가 많아, 같은 plain text면 프로세스 내 스타일 캐시를 쓴다.
    if (app.storedLineClassesClipboard && text === app.storedLineClipboardText) {
        return app.storedLineClassesClipboard;
    }
    return null;
}

export function copySelectedLineStylesToClipboard(page, e) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !e?.clipboardData) return false;
    const range = sel.getRangeAt(0);
    if (!page.contains(range.commonAncestorContainer)) return false;
    if (!range.collapsed && blocks.getSelectedImageBlocks(page, range).length) return false;

    let lines = getSelectedLines().filter((line) => !blocks.isImageBlock(line) && !blocks.isImageRow(line, page));
    if (!lines.length) {
        const line = getLineFromNode(range.startContainer, page, range);
        if (line && !blocks.isImageBlock(line) && !blocks.isImageRow(line, page)) lines = [line];
    }
    if (!lines.length) return false;

    const classStrings = lines.map(copyTextLineClasses);
    const payload = JSON.stringify(classStrings);
    const text = range.collapsed ? lines.map((line) => getLineTextContent(line)).join('\n') : sel.toString();

    app.storedLineClassesClipboard = classStrings;
    app.storedLineClipboardText = text;
    e.clipboardData.setData('text/plain', text);
    e.clipboardData.setData(LINE_CLIPBOARD_MIME, payload);
    e.preventDefault();
    return true;
}

export function shouldApplyPastedLineClasses(line, page) {
    return isEmptyBrLine(line, page);
}

export function applyPastedLineClasses(line, clipboardEvent, index = 0, pastedText = null) {
    const classList = getClipboardLineClassesList(clipboardEvent, pastedText);
    if (!classList?.length) return;
    applyLineClassesString(line, classList[index] ?? classList[0] ?? '');
}

export function isEmptyBrLine(el, page) {
    page = page || el?.closest?.(NOTE_PAGE_SEL);
    if (!el || el.tagName !== 'DIV' || blocks.isImageBlock(el) || (page && blocks.isImageRow(el, page))) return false;
    if (blocks.isChecklistLine(el)) {
        const span = blocks.getChecklistTextSpan(el);
        if (!span) return !getLineTextContent(el).trim();
        if (span.textContent.trim()) return false;
        return (
            span.childNodes.length === 0 ||
            (span.childNodes.length === 1 && span.firstChild?.nodeName === 'BR')
        );
    }
    if (el.textContent.trim()) return false;
    return (
        el.childNodes.length === 0 ||
        (el.childNodes.length === 1 && el.firstChild?.nodeName === 'BR')
    );
}

export function isPageStructureEmpty(page) {
    return !getPageChildDivs(page).length;
}

export function removeOrphanPageNodes(page) {
    if (!page) return;
    [...page.childNodes].forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? '';
            if (!text.trim()) {
                node.remove();
                return;
            }
            const line = createTextLineElement();
            setLineTextContent(line, text);
            page.replaceChild(line, node);
            return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            node.remove();
            return;
        }
        if (node.tagName === 'DIV') return;
        if (node.tagName === 'BR') {
            node.remove();
            return;
        }
        const line = createTextLineElement();
        const text = node.textContent ?? '';
        if (text.trim()) setLineTextContent(line, text);
        page.replaceChild(line, node);
    });
}

export function removeMeaninglessEmptyTextLines(page) {
    if (!page) return;
    blocks.removeTrailingEmptyLineAfterImage(page);

    const textLines = getTextLines(page);
    const hasNonEmptyText = textLines.some((line) => getLineTextContent(line).trim());
    const hasImages = !!page.querySelector(':scope > div.image');

    // 이미지만 남고 실제 텍스트가 없을 때만 빈 줄 정리.
    // 이미지와 링크 사이의 <div><br></div> 같은 의도된 간격은 유지한다.
    if (!hasNonEmptyText && hasImages) {
        textLines.forEach((line) => {
            if (isEmptyBrLine(line, page)) line.remove();
        });
    }

    blocks.removeTrailingEmptyLineAfterImage(page);
}

export function normalizePageAfterContentChange(page, { focus = false } = {}) {
    if (!page) return;

    removeOrphanPageNodes(page);
    removeMeaninglessEmptyTextLines(page);

    getTextLines(page).forEach((line) => {
        if (blocks.isChecklistLine(line)) {
            blocks.ensureChecklistStructure(line);
            const span = blocks.getChecklistTextSpan(line);
            if (span && !span.textContent.trim() && !span.querySelector('br')) {
                span.innerHTML = '<br>';
            }
            return;
        }
        if (!line.textContent.trim() && !line.querySelector('br')) {
            line.innerHTML = '<br>';
        }
    });

    blocks.removeTrailingEmptyLineAfterImage(page);

    if (!getPageChildDivs(page).length) {
        app.hooks.updatePageTitleElement(page);
        if (focus) focusPageCaret(page, 0);
        return;
    }

    if (focus) {
        const lines = getTextLines(page);
        const target = lines.find(isEmptyBrLine) || lines[lines.length - 1];
        if (target) focusLine(page, target, false);
        else {
            const last = page.lastElementChild;
            if (last && blocks.isImageBlock(last)) blocks.focusBesideImage(page, last, 'after');
        }
    }
}

export function beginTypingOnEmptyPage(page, seed = '', clipboardEvent = null) {
    const line = createTextLineElement();
    if (clipboardEvent) applyPastedLineClasses(line, clipboardEvent, 0, seed);
    page.appendChild(line);
    focusLine(page, line, false);
    if (seed) document.execCommand('insertText', false, seed);
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    return line;
}

export function getClipboardDataTransfer(e) {
    return e?.clipboardData || e?.dataTransfer || null;
}

export function getClipboardPlainText(e) {
    const dt = getClipboardDataTransfer(e);
    if (dt?.types?.includes?.('text/plain')) {
        return dt.getData('text/plain');
    }
    if (typeof e?.data === 'string') return e.data;
    return '';
}

export function stripInlineMarkupFromLine(line) {
    if (!line?.isConnected || blocks.isImageBlock(line) || blocks.isChecklistLine(line)) return;
    if (!line.querySelector('span, font, b, strong, i, em, u')) return;
    // contenteditable 기본 rich paste를 줄 단위 plain 모델로 되돌린다.
    line.textContent = line.textContent;
}

export function stripInlineMarkupFromPage(page) {
    if (!page) return;
    getTextLines(page).forEach(stripInlineMarkupFromLine);
}

export function getActivePageFromEvent(e) {
    return e.target.closest?.(NOTE_PAGE_ON_SEL) ?? null;
}

export function pasteMultilinePlainTextAt(page, line, before, after, text, clipboardEvent = null) {
    const pasteIntoEmptyLine = shouldApplyPastedLineClasses(line, page);
    if (pasteIntoEmptyLine) applyPastedLineClasses(line, clipboardEvent, 0, text);

    const parts = text.split(/\r?\n/);
    const first = before + parts[0];
    if (first) setLineTextContent(line, first);
    else if (blocks.isChecklistLine(line)) setLineTextContent(line, '');
    else line.innerHTML = '<br>';
    ensureLineEditable(line);
    blocks.linkifyLine(line);

    let refLine = line;
    for (let i = 1; i < parts.length; i++) {
        const newLine = createTextLineElement(line);
        if (pasteIntoEmptyLine || getClipboardLineClassesList(clipboardEvent, text)?.[i]) {
            applyPastedLineClasses(newLine, clipboardEvent, i, text);
        }
        const content = i === parts.length - 1 ? parts[i] + after : parts[i];
        if (content) setLineTextContent(newLine, content);
        else if (blocks.isChecklistLine(newLine)) setLineTextContent(newLine, '');
        else newLine.innerHTML = '<br>';
        refLine.after(newLine);
        blocks.linkifyLine(newLine);
        refLine = newLine;
    }

    focusLine(page, refLine, parts[parts.length - 1].length);
}

export function isZwspOnlyText(text) {
    return text == null || /^[\u200B\s]*$/.test(text);
}

export function pastePlainTextIntoPage(page, text, clipboardEvent = null) {
    if (text == null || !page) return false;
    if (isZwspOnlyText(text)) return false;

    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (!page.contains(range.commonAncestorContainer)) return false;

    const caret = getPageCaretSide(page, range);
    if (caret?.row && caret.side !== 'neutral') {
        if (isZwspOnlyText(text)) return false;
        blocks.beginTypingBesideImageRow(page, caret.row, caret.side, text);
        touchPage(page.id);
        app.hooks.syncPageAreaFromPage(page);
        scheduleScrollCaretIntoView(page);
        return true;
    }

    if (isPageStructureEmpty(page)) {
        beginTypingOnEmptyPage(page, text, clipboardEvent);
        scheduleScrollCaretIntoView(page);
        return true;
    }

    const line = getLineFromNode(range.startContainer, page, range);
    if (!line || blocks.isImageBlock(line) || blocks.isImageRow(line, page)) return false;

    const startOffset = getCaretOffsetInLine(line, sel);
    const endOffset = range.collapsed
        ? startOffset
        : getOffsetInLine(line, range.endContainer, range.endOffset);

    stripInlineMarkupFromLine(line);

    const full = getLineTextContent(line);
    const before = full.slice(0, startOffset);
    const after = full.slice(endOffset);

    if (!/\r|\n/.test(text)) {
        if (shouldApplyPastedLineClasses(line, page)) {
            applyPastedLineClasses(line, clipboardEvent, 0, text);
        }
        setLineTextContent(line, before + text + after);
        ensureLineEditable(line);
        blocks.linkifyLine(line);
        focusLine(page, line, startOffset + text.length);
    } else {
        pasteMultilinePlainTextAt(page, line, before, after, text, clipboardEvent);
    }

    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    scheduleScrollCaretIntoView(page);
    return true;
}

export function insertLineAfter(refLine, className) {
    const page = refLine.parentElement;
    const div = document.createElement('div');
    const cls = copyTextLineClasses(className || refLine.className);
    if (cls) div.className = cls;
    if (className && className.includes('br')) div.innerHTML = '<br>';
    refLine.after(div);
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    return div;
}

export function mergeLines(prev, next) {
    const page = prev.parentElement;
    const mergeOffset = getLineTextContent(prev).length;
    if (isEmptyBrLine(prev, page)) {
        applyLineClassesString(prev, copyTextLineClasses(next));
    }
    setLineTextContent(prev, getLineTextContent(prev) + getLineTextContent(next));
    next.remove();
    ensureLineEditable(prev);
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    focusLine(page, prev, mergeOffset);
}

export function splitLineAtOffset(line, offset) {
    const page = line.parentElement;
    const full = getLineTextContent(line);
    const before = full.slice(0, offset);
    const after = full.slice(offset);
    setLineTextContent(line, before);
    ensureLineEditable(line);
    const next = document.createElement('div');
    const cls = copyTextLineClasses(line);
    if (cls) next.className = cls;
    if (blocks.isChecklistLine(line)) {
        blocks.wrapLineAsChecklist(next);
        setLineTextContent(next, after);
    } else if (after) {
        next.textContent = after;
    } else {
        next.innerHTML = '<br>';
    }
    line.after(next);
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    return next;
}

export function splitLineAtCursor(line, sel) {
    const offset = getCaretOffsetInLine(line, sel);
    const next = splitLineAtOffset(line, offset);
    focusLine(line.parentElement, next, false);
}

export function getOffsetOnPageNode(page, node, range, boundary) {
    if (!range || node !== page) return 0;
    if (node === range.startContainer && node === range.endContainer) {
        return getPageRangeOffset(page, range, boundary) ?? range.startOffset;
    }
    return node === range.endContainer ? range.endOffset : range.startOffset;
}

export function getLineFromPageOffset(page, container, offset) {
    if (container !== page) return null;
    for (let i = offset; i < page.childNodes.length; i++) {
        const node = page.childNodes[i];
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'DIV' && !blocks.isImageBlock(node) && !blocks.isImageRow(node, page)) {
            return node;
        }
    }
    for (let i = offset - 1; i >= 0; i--) {
        const node = page.childNodes[i];
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'DIV' && !blocks.isImageBlock(node) && !blocks.isImageRow(node, page)) {
            return node;
        }
    }
    return null;
}

export function getPageRangeOffset(page, range, boundary) {
    if (!range || page !== range.startContainer || page !== range.endContainer) return null;
    return boundary === 'end' ? range.endOffset : range.startOffset;
}

export function getPageBlockFromNode(node, page, range, boundary = 'start') {
    if (!page || !node) return null;

    if (node === page) {
        const offset = getOffsetOnPageNode(page, node, range, boundary);
        const child = page.childNodes[offset];
        if (child?.nodeType === Node.ELEMENT_NODE && child.tagName === 'DIV') return child;
        const prev = page.childNodes[offset - 1];
        if (prev?.nodeType === Node.ELEMENT_NODE && prev.tagName === 'DIV') return prev;
        return null;
    }

    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && el.parentElement !== page) el = el.parentElement;
    if (el && el !== page && el.tagName === 'DIV') {
        if (blocks.isImageBlock(el) && el.parentElement === page) return el;
        if (!blocks.isImageBlock(el)) return el;
    }
    return null;
}

export function getLineFromNode(node, page, range, boundary = 'start') {
    if (!page || !node) return null;

    if (node.nodeType === Node.ELEMENT_NODE && blocks.isImageBlock(node)) return null;
    if (node.parentElement && blocks.isImageBlock(node.parentElement)) return null;

    if (node === page) {
        return getLineFromPageOffset(page, node, getOffsetOnPageNode(page, node, range, boundary));
    }

    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && el.parentElement !== page) el = el.parentElement;
    if (el && el !== page && !blocks.isImageBlock(el) && !blocks.isImageRow(el, page)) return el;
    return null;
}

export function rangesEqual(a, b) {
    return (
        a.startContainer === b.startContainer &&
        a.startOffset === b.startOffset &&
        a.endContainer === b.endContainer &&
        a.endOffset === b.endOffset
    );
}

export function computeBlockSpanInRange(page, range) {
    const divs = getPageChildDivs(page);
    if (!divs.length) return null;

    let startIdx = Infinity;
    let endIdx = -1;

    divs.forEach((div, i) => {
        try {
            if (range.intersectsNode(div)) {
                startIdx = Math.min(startIdx, i);
                endIdx = Math.max(endIdx, i);
            }
        } catch {
        }
    });

    const startBlock = getPageBlockFromNode(range.startContainer, page, range, 'start');
    const endBlock = getPageBlockFromNode(range.endContainer, page, range, 'end');
    if (startBlock) {
        const i = divs.indexOf(startBlock);
        if (i !== -1) {
            startIdx = Math.min(startIdx, i);
            endIdx = Math.max(endIdx, i);
        }
    }
    if (endBlock) {
        const i = divs.indexOf(endBlock);
        if (i !== -1) {
            startIdx = Math.min(startIdx, i);
            endIdx = Math.max(endIdx, i);
        }
    }

    const fullRange = getFullPageSelectionRange(page);
    if (fullRange) {
        try {
            if (range.compareBoundaryPoints(Range.START_TO_START, fullRange) <= 0) {
                startIdx = Math.min(startIdx, 0);
            }
            if (range.compareBoundaryPoints(Range.END_TO_END, fullRange) >= 0) {
                endIdx = Math.max(endIdx, divs.length - 1);
            }
        } catch {
        }
    }

    if (startIdx === Infinity || endIdx === -1) return null;
    return { startIdx, endIdx, divs };
}

export function getBlockSpanInRange(page, range) {
    if (isFullPageTextSelection(page, range)) {
        const divs = getPageChildDivs(page);
        return { startIdx: 0, endIdx: divs.length - 1, divs };
    }
    return computeBlockSpanInRange(page, range);
}

export function expandSelectionWithImageBlocks(page) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !page.contains(range.commonAncestorContainer)) return false;

    if (isFullPageTextSelection(page, range)) {
        const fullRange = getFullPageSelectionRange(page);
        if (!fullRange || rangesEqual(range, fullRange)) return false;
        sel.removeAllRanges();
        sel.addRange(fullRange);
        return true;
    }

    const span = getBlockSpanInRange(page, range);
    if (!span) return false;

    const { startIdx, endIdx, divs } = span;
    const blocksInSpan = divs.slice(startIdx, endIdx + 1);
    if (!blocksInSpan.some((el) => blocks.isImageBlock(el))) return false;

    const newRange = document.createRange();
    const startBlock = divs[startIdx];
    const endBlock = divs[endIdx];

    if (blocks.isImageBlock(startBlock)) {
        newRange.setStartBefore(startBlock);
    } else {
        newRange.setStart(range.startContainer, range.startOffset);
    }

    if (blocks.isImageBlock(endBlock)) {
        newRange.setEndAfter(endBlock);
    } else {
        newRange.setEnd(range.endContainer, range.endOffset);
    }

    for (let i = startIdx; i <= endIdx; i++) {
        const block = divs[i];
        if (!blocks.isImageBlock(block)) continue;
        try {
            if (newRange.comparePoint(block, 0) > 0) newRange.setStartBefore(block);
            if (newRange.comparePoint(block, block.childNodes.length) < 0) newRange.setEndAfter(block);
        } catch {
            // comparePoint가 일부 이미지/경계 노드에서 던지므로, 실패 시 블록 통째로 포함한다.
            newRange.setStartBefore(block);
            newRange.setEndAfter(block);
        }
    }

    if (rangesEqual(range, newRange)) return false;
    sel.removeAllRanges();
    sel.addRange(newRange);
    return true;
}

export function normalizePageSelection(page) {
    if (app.normalizingSelection || !page) return;
    app.normalizingSelection = true;
    try {
        expandSelectionWithImageBlocks(page);
    } finally {
        app.normalizingSelection = false;
    }
}

export function afterSelectionInput(page) {
    if (!page) return;
    normalizePageSelection(page);
    const sel = window.getSelection();
    if (sel?.rangeCount && sel.getRangeAt(0).collapsed) {
        scheduleScrollCaretIntoView(page);
    }
}

export function handlePageCaretKeydown(page, sel, range, e) {
    if (e.shiftKey && e.key.startsWith('Arrow')) return false;

    if (!isCaretAtPageOffset(page, range)) return false;

    const offset = range.startOffset;
    const prev = page.childNodes[offset - 1] ?? null;
    const next = page.childNodes[offset] ?? null;
    let row = null;
    let blockSide = null;

    if (blocks.isImageRow(next, page)) {
        row = next;
        blockSide = 'before';
    } else if (blocks.isImageRow(prev, page)) {
        row = prev;
        blockSide = 'after';
    } else {
        return false;
    }

    return blocks.handlePageBlockCaretKeydown(page, sel, range, e, { row, blockSide });
}

export function getSelectedLines() {
    const page = app.hooks.getActivePage();
    if (!page || !app.hooks.isEditablePage(page)) return [];

    const sel = window.getSelection();
    if (!sel.rangeCount) return [];

    const range = sel.getRangeAt(0);
    if (!page.contains(range.commonAncestorContainer)) return [];

    if (range.collapsed) {
        const line = getLineFromNode(range.startContainer, page, range);
        return line ? [line] : [];
    }

    const startLine = getLineFromNode(range.startContainer, page, range, 'start');
    const endLine = getLineFromNode(range.endContainer, page, range, 'end');
    if (!startLine) return [];
    if (!endLine || startLine === endLine) return [startLine];

    const lines = getTextLines(page);
    const startIdx = lines.indexOf(startLine);
    const endIdx = lines.indexOf(endLine);
    if (startIdx === -1 || endIdx === -1) return [startLine];

    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);
    return lines.slice(from, to + 1);
}

export function getTargetLines() {
    return getSelectedLines();
}

export function getIndentTargetLines(page) {
    return getTargetLines().filter((line) => !blocks.isImageBlock(line) && !blocks.isImageRow(line, page));
}

export function setLineIndent(page, lines, indented) {
    if (!page || !lines.length) return false;
    lines.forEach((line) => {
        if (indented) line.classList.add(INDENT_CLASS);
        else line.classList.remove(INDENT_CLASS);
    });
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    return true;
}

export function applyLineSizeClass(className) {
    const lines = getTargetLines();
    if (!lines.length) return;
    const page = lines[0].parentElement;

    withPreservedLineCaret(page, () => {
        lines.forEach((line) => {
            SIZE_CLASSES.forEach((c) => line.classList.remove(c));
            if (className) line.classList.add(className);
        });

        touchPage(page.id);
        app.hooks.syncPageAreaFromPage(page);
        updateToolbarState();
    });
}

export function toggleLineClass(className, exclusive) {
    const lines = getTargetLines();
    if (!lines.length) return;

    const allHave = lines.every((line) => line.classList.contains(className));
    const page = lines[0].parentElement;

    withPreservedLineCaret(page, () => {
        lines.forEach((line) => {
            if (allHave) {
                line.classList.remove(className);
            } else {
                line.classList.add(className);
                (exclusive || [])
                    .filter((c) => c !== className)
                    .forEach((c) => line.classList.remove(c));
            }
        });

        touchPage(page.id);
        app.hooks.syncPageAreaFromPage(page);
        updateToolbarState();
    });
}

export function lineHasClass(line, cls) {
    return line?.classList.contains(cls);
}

export function updateToolbarState() {
    const lines = getSelectedLines();
    const map = [
        ['#tool-size-h1-opt-btn', 'h1-size', SIZE_CLASSES],
        ['#tool-size-h2-opt-btn', 'h2-size', SIZE_CLASSES],
        ['#tool-size-decrease-opt-btn', 'decrease-size', SIZE_CLASSES],
        ['#tool-bold-opt-btn', 'bold'],
        ['#tool-underlined-opt-btn', 'underlined'],
        ['#tool-color-red-opt-btn', 'red-color', COLOR_CLASSES],
        ['#tool-color-orange-opt-btn', 'orange-color', COLOR_CLASSES],
        ['#tool-color-green-opt-btn', 'green-color', COLOR_CLASSES],
        ['#tool-color-blue-opt-btn', 'blue-color', COLOR_CLASSES],
        ['#tool-color-l-opt-btn', 'l-color', COLOR_CLASSES],
        ['#tool-checklist-opt-btn', 'checklist'],
        ['#tool-box-opt-btn', 'box'],
    ];

    map.forEach(([sel, cls]) => {
        const id = sel.slice(1);
        const btn = byId(id) || $(sel);
        if (!btn) return;
        toggleClass(btn, 'on', lines.length > 0 && lines.every((line) => lineHasClass(line, cls)));
    });

    const incBtn = $('#tool-size-increase-opt-btn');
    if (incBtn) {
        const defaultSize =
            lines.length > 0 && lines.every((line) => !SIZE_CLASSES.some((c) => line.classList.contains(c)));
        toggleClass(incBtn, 'on', defaultSize);
    }
    const xxlBtn = $('#tool-color-xxl-opt-btn');
    if (xxlBtn) {
        const noColor =
            lines.length > 0 && lines.every((line) => !COLOR_CLASSES.some((c) => line.classList.contains(c)));
        toggleClass(xxlBtn, 'on', noColor);
    }
}

export function getTextLines(page) {
    return getPageChildDivs(page).filter((d) => !blocks.isImageBlock(d));
}

export function getPageChildDivs(page) {
    return [...page.querySelectorAll(':scope > div')];
}

export function getFullPageSelectionRange(page) {
    const divs = getPageChildDivs(page);
    if (!divs.length) return null;
    const range = document.createRange();
    range.setStartBefore(divs[0]);
    range.setEndAfter(divs[divs.length - 1]);
    return range;
}

export function selectionSpansAllBlocks(page, range) {
    if (!range || range.collapsed || !page) return false;
    const divs = getPageChildDivs(page);
    if (!divs.length) return false;
    const fullRange = getFullPageSelectionRange(page);
    if (!fullRange) return false;
    try {
        return (
            range.compareBoundaryPoints(Range.START_TO_START, fullRange) <= 0 &&
            range.compareBoundaryPoints(Range.END_TO_END, fullRange) >= 0
        );
    } catch {
        return false;
    }
}

export function isFullPageTextSelection(page, range) {
    if (!range || range.collapsed) return false;
    const divs = getPageChildDivs(page);
    if (!divs.length) return false;

    if (selectionSpansAllBlocks(page, range)) return true;

    const span = computeBlockSpanInRange(page, range);
    if (!span) return false;

    for (let i = 0; i < span.startIdx; i++) {
        if (!blocks.isImageBlock(divs[i])) return false;
    }
    for (let i = span.endIdx + 1; i < divs.length; i++) {
        if (!blocks.isImageBlock(divs[i])) return false;
    }
    for (let i = 0; i < divs.length; i++) {
        if (blocks.isImageBlock(divs[i])) continue;
        if (i < span.startIdx || i > span.endIdx) return false;
    }
    return true;
}

export function isPageTextEmpty(page) {
    if (!page) return false;
    const divs = getPageChildDivs(page);
    if (!divs.length) return true;
    if (page.querySelector(':scope > div.image')) return false;
    const lines = getTextLines(page);
    if (!lines.length) return true;
    return lines.every((line) => !getLineTextContent(line).trim());
}

export function finalizeEmptyPageOnDeselect(page) {
    if (!page?.id || !isPageTextEmpty(page)) return;
    app.hooks.removePageCompletely(page.id);
}

export function selectAllPageText(page, sel) {
    const fullRange = getFullPageSelectionRange(page);
    if (!fullRange || !sel) return;
    sel.removeAllRanges();
    sel.addRange(fullRange);
    normalizePageSelection(page);
}

export function clearAllPageText(page) {
    getPageChildDivs(page).forEach((line) => line.remove());
    touchPage(page.id);
    normalizePageAfterContentChange(page, { focus: true });
    app.hooks.syncPageAreaFromPage(page);
    sortPageArea(app.allPageArea);
}

export function resetPageToEmptyLine(page) {
    clearAllPageText(page);
}

export function deleteSelectedPageText(page, sel, range) {
    if (isFullPageTextSelection(page, range)) {
        clearAllPageText(page);
        return;
    }
    normalizePageSelection(page);
    range = sel.getRangeAt(0);
    if (blocks.selectionIncludesImageBlock(page, range)) {
        range.deleteContents();
        blocks.moveStrayContentOutOfImageBlocks(page);
        normalizePageAfterContentChange(page, { focus: true });
        touchPage(page.id);
        app.hooks.syncPageAreaFromPage(page);
        return;
    }
    document.execCommand('delete', false);
    normalizePageAfterContentChange(page, { focus: true });
    app.hooks.syncPageAreaFromPage(page);
}

export function getAdjacentTextLine(line, direction) {
    const page = line.parentElement;
    let sibling = direction === 'prev' ? line.previousElementSibling : line.nextElementSibling;
    while (sibling && blocks.isImageBlock(sibling)) {
        sibling = direction === 'prev' ? sibling.previousElementSibling : sibling.nextElementSibling;
    }
    return sibling || null;
}

