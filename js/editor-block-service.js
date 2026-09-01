import { app, $, $$, byId, toggleClass, setButtonEnabled, appendDualIcons, migratePageIconTags, isImageFile, readImageFile } from './utils.js';
import {
  NOTE_PAGE_SEL,
  NOTE_PAGE_ON_SEL,
  IMAGE_CLIPBOARD_MIME,
  LINE_CLIPBOARD_MIME,
  LINK_URL_RE,
  TOOL_LINE_CLASSES,
  INDENT_CLASS,
} from './constants.js';
import {
  scheduleSaveAppState,
  touchPage,
  getPageMeta,
} from './storage-service.js';
import * as lines from './editor-line-service.js';

export function getAdjacentImageBlock(line, direction) {
    const sibling = direction === 'forward' ? line.nextElementSibling : line.previousElementSibling;
    return isImageBlock(sibling) ? sibling : null;
}

export function focusIntoAdjacentImage(page, line, direction, { requireLineBoundary = true } = {}) {
    const image = getAdjacentImageBlock(line, direction);
    if (!image) return false;

    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    const side = direction === 'forward' ? 'after' : 'before';
    const atBoundary = direction === 'forward' ? lines.isAtLineEnd(line, sel) : lines.isAtLineStart(line, sel);

    if (!requireLineBoundary || atBoundary) {
        focusBesideImage(page, image, side);
        return true;
    }

    if (range.collapsed && range.startContainer === page) {
        const offset = range.startOffset;
        if (direction === 'forward') {
            if (page.childNodes[offset - 1] === line && page.childNodes[offset] === image) {
                focusBesideImage(page, image, side);
                return true;
            }
        } else if (page.childNodes[offset - 1] === image && page.childNodes[offset] === line) {
            focusBesideImage(page, image, side);
            return true;
        }
    }

    return false;
}

export function focusBesideImage(page, target, side) {
    const block = ensureImageBlock(
        page,
        isImageBlock(target) ? target : target?.closest?.(':scope > div.image, div.image') || target
    );
    if (!block) return;
    if (side === 'before') {
        const prevText = getPreviousTextBlock(block, page);
        if (prevText) {
            lines.focusLine(page, prevText, true);
            return;
        }
        beginTypingBesideImageRow(page, block, 'before');
        return;
    }
    const nextText = getNextTextBlock(block, page);
    if (nextText) {
        lines.focusLine(page, nextText, false);
        return;
    }
    beginTypingBesideImageRow(page, block, 'after');
}

export function focusBesideImageFromClick(page, imageBlock, clientY) {
    const rect = imageBlock.getBoundingClientRect();
    const side = clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    focusBesideImage(page, imageBlock, side);
}

export function beginTypingBesideImageRow(page, row, side, seed = '') {
    const refLine = side === 'before' ? getNextTextBlock(row, page) : getPreviousTextBlock(row, page);
    const line = lines.createTextLineElement(refLine);
    if (side === 'before') row.before(line);
    else row.after(line);
    lines.focusLine(page, line, false);
    if (seed) document.execCommand('insertText', false, seed);
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    return line;
}

export function isImageBlock(el) {
    if (!el?.classList?.contains('image')) return false;
    return !!el.querySelector(':scope > img');
}

export function isImageRow(el, page) {
    return isImageBlock(el) && !!page && el.parentElement === page;
}

export function getImageFullscreenButton(imageBlock) {
    return imageBlock?.querySelector(':scope > button.image-btn') ?? null;
}

export function ensureImageFullscreenIcon(imageBlock) {
    if (!imageBlock) return null;

    let btn = getImageFullscreenButton(imageBlock);
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-btn image-btn';
        btn.contentEditable = 'false';
        appendDualIcons(btn, 'fullscreen', 'fullscreen_exit', 'fullscreen-icon', 'exit-icon');
        const img = imageBlock.querySelector(':scope > img');
        if (img) imageBlock.insertBefore(btn, img);
        else imageBlock.prepend(btn);
    }

    if (!btn.querySelector(':scope > .fullscreen-icon')) {
        btn.querySelectorAll(':scope > span').forEach((icon) => icon.remove());
        appendDualIcons(btn, 'fullscreen', 'fullscreen_exit', 'fullscreen-icon', 'exit-icon');
    }

    btn.contentEditable = 'false';
    btn.querySelectorAll(':scope > span').forEach((icon) => {
        icon.contentEditable = 'false';
    });
    const img = imageBlock.querySelector(':scope > img');
    if (img && btn.nextElementSibling !== img) imageBlock.insertBefore(btn, img);
    return btn.querySelector(':scope > .fullscreen-icon');
}

export function stripNonImageChildren(imageBlock) {
    [...imageBlock.childNodes].forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
            node.remove();
            return;
        }
        if (
            node.nodeType === Node.ELEMENT_NODE &&
            node.tagName !== 'IMG' &&
            !node.classList.contains('image-btn')
        ) {
            node.remove();
        }
    });
}

export function normalizeImageBlock(imageBlock) {
    if (!imageBlock?.classList?.contains('image') && !isImageBlock(imageBlock)) return null;

    if (!imageBlock.classList.contains('image')) {
        imageBlock.classList.add('image');
    }

    stripNonImageChildren(imageBlock);
    applyImageBlockSetup(imageBlock);
    return imageBlock;
}

export function applyImageBlockSetup(imageBlock) {
    ensureImageFullscreenIcon(imageBlock);
    stripNonImageChildren(imageBlock);
    imageBlock.contentEditable = 'false';
    const btn = getImageFullscreenButton(imageBlock);
    if (btn) btn.contentEditable = 'false';
    const img = imageBlock.querySelector(':scope > img');
    if (img) {
        img.contentEditable = 'false';
        img.draggable = false;
    }
}

export function ensureImageBlock(page, target) {
    if (!target?.isConnected || !page) return null;
    if (isImageBlock(target)) {
        if (target.parentElement === page) return normalizeImageBlock(target);
        if (target.parentElement?.parentElement === page && !isImageBlock(target.parentElement)) {
            const normalized = normalizeImageBlock(target);
            target.parentElement.replaceWith(normalized);
            return normalized;
        }
    }
    return null;
}

export function createImageBlock(src) {
    const block = document.createElement('div');
    block.className = 'image';
    block.contentEditable = 'false';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn image-btn';
    btn.contentEditable = 'false';
    appendDualIcons(btn, 'fullscreen', 'fullscreen_exit', 'fullscreen-icon', 'exit-icon');
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.contentEditable = 'false';
    block.appendChild(btn);
    block.appendChild(img);
    setupImageBlock(block);
    return block;
}

export function normalizeImageBlocks(page) {
    if (!page) return;
    [...page.querySelectorAll(':scope > div > div.image')].forEach((imageBlock) => {
        const wrapper = imageBlock.parentElement;
        if (wrapper?.parentElement === page && !isImageBlock(wrapper)) {
            wrapper.replaceWith(normalizeImageBlock(imageBlock));
        }
    });
    page.querySelectorAll(':scope > div.image').forEach((block) => normalizeImageBlock(block));
}

export function getAdjacentTextBlock(fromEl, page, direction) {
    page = page || fromEl?.closest?.(NOTE_PAGE_SEL) || fromEl?.parentElement;
    if (!page) return null;
    const anchor = isImageBlock(fromEl)
        ? fromEl
        : fromEl?.parentElement === page
          ? fromEl
          : ensureImageBlock(page, fromEl) || fromEl;
    if (anchor?.parentElement !== page) return null;
    let sibling = direction === 'prev' ? anchor.previousElementSibling : anchor.nextElementSibling;
    while (sibling) {
        if (!isImageBlock(sibling)) return sibling;
        sibling = direction === 'prev' ? sibling.previousElementSibling : sibling.nextElementSibling;
    }
    return null;
}

export function getPreviousTextBlock(fromEl, page) {
    return getAdjacentTextBlock(fromEl, page, 'prev');
}

export function getNextTextBlock(fromEl, page) {
    return getAdjacentTextBlock(fromEl, page, 'next');
}

export function isChecklistLine(line) {
    return !!line?.classList?.contains('checklist');
}

export function getChecklistButton(line) {
    if (!isChecklistLine(line)) return null;
    return line.querySelector(':scope > button.checklist-btn');
}

export function ensureChecklistButton(line) {
    if (!isChecklistLine(line)) return null;

    let btn = getChecklistButton(line);
    if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'checklist-btn icon-btn';
        btn.contentEditable = 'false';
        appendDualIcons(btn, 'check_box_outline_blank', 'check_box');
        const span = getChecklistTextSpan(line);
        if (span) line.insertBefore(btn, span);
        else line.prepend(btn);
    }

    if (!btn.querySelector(':scope > .blank-icon')) {
        btn.querySelectorAll(':scope > span').forEach((icon) => icon.remove());
        appendDualIcons(btn, 'check_box_outline_blank', 'check_box');
    }

    btn.contentEditable = 'false';
    btn.querySelectorAll(':scope > span').forEach((icon) => {
        icon.contentEditable = 'false';
    });
    return btn;
}

export function getChecklistTextSpan(line) {
    if (!isChecklistLine(line)) return null;
    return line.querySelector(':scope > span');
}

export function wrapLineAsChecklist(line) {
    if (!line || isImageBlock(line)) return line;
    if (isChecklistLine(line)) {
        ensureChecklistStructure(line);
        return line;
    }

    line.classList.add('checklist');
    line.classList.remove('on');

    const text = line.textContent;
    line.textContent = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'checklist-btn icon-btn';
    btn.contentEditable = 'false';
    appendDualIcons(btn, 'check_box_outline_blank', 'check_box');
    const span = document.createElement('span');
    span.classList.add('checklist-txt');
    if (text) span.textContent = text;
    else span.innerHTML = '<br>';
    line.appendChild(btn);
    line.appendChild(span);
    return line;
}

export function unwrapChecklistLine(line) {
    if (!isChecklistLine(line)) return;
    const text = lines.getLineTextContent(line);
    line.classList.remove('checklist', 'on');
    if (text) line.textContent = text;
    else line.innerHTML = '<br>';
}

export function ensureChecklistStructure(line) {
    if (!isChecklistLine(line)) return;
    const span = getChecklistTextSpan(line);
    if (span) {
        span.classList.add('checklist-txt');
        ensureChecklistButton(line);
        return;
    }

    const wasOn = line.classList.contains('on');
    let text = line.textContent;

    line.textContent = '';
    const nextSpan = document.createElement('span');
    nextSpan.classList.add('checklist-txt');
    if (text) nextSpan.textContent = text;
    else nextSpan.innerHTML = '<br>';
    line.appendChild(nextSpan);
    if (wasOn) line.classList.add('on');
    ensureChecklistButton(line);
}

export function normalizeChecklistLineContent(line) {
    if (!isChecklistLine(line)) return;
    ensureChecklistStructure(line);
    const span = getChecklistTextSpan(line);
    const btn = getChecklistButton(line);
    if (!span || !btn) return;
    [...line.childNodes].forEach((node) => {
        if (node === btn || node === span) return;
        if (node.nodeType === Node.TEXT_NODE) {
            span.appendChild(document.createTextNode(node.textContent));
            node.remove();
        } else {
            span.appendChild(node);
        }
    });
}

export function setupChecklistLines(page) {
    if (!page) return;
    lines.getTextLines(page).forEach((line) => {
        if (isChecklistLine(line)) ensureChecklistStructure(line);
    });
}

export function toggleChecklistClass(targetLines) {
    if (!targetLines.length) return;
    const allHave = targetLines.every((line) => line.classList.contains('checklist'));
    const page = targetLines[0].parentElement;
    lines.withPreservedLineCaret(page, () => {
        targetLines.forEach((line) => {
            if (allHave) unwrapChecklistLine(line);
            else wrapLineAsChecklist(line);
        });
        touchPage(page.id);
        app.hooks.syncPageAreaFromPage(page);
        lines.updateToolbarState();
    });
}

export function isChecklistControlClick(line, event) {
    if (!line || !event) return false;
    const btn = event.target.closest('button.checklist-btn');
    return !!btn && line.contains(btn);
}

export function isImageControlClick(imageBlock, event) {
    if (!imageBlock || !event) return false;
    const btn = event.target.closest('button.image-btn');
    return !!btn && imageBlock.contains(btn);
}

export function getPageContentContextMenuTarget(event) {
    const page = event.target.closest(NOTE_PAGE_ON_SEL);
    if (!page || page.contentEditable !== 'true') return null;

    const imageBlock = event.target.closest(`${NOTE_PAGE_ON_SEL} > div.image`);
    if (imageBlock) return { page, kind: 'image', block: imageBlock };

    const line = event.target.closest(`${NOTE_PAGE_ON_SEL} > div`);
    if (line && line.parentElement === page && !isImageBlock(line)) {
        return { page, kind: 'text', block: line };
    }

    return null;
}

export function setupImageBlock(imageBlock) {
    if (!imageBlock?.classList?.contains('image')) return;
    normalizeImageBlock(imageBlock);
}

export function removeTrailingEmptyLineAfterImage(page) {
    const last = page?.lastElementChild;
    const prev = last?.previousElementSibling;
    if (!last || !prev || !isImageBlock(prev) || !lines.isEmptyBrLine(last, page)) return;
    last.remove();
}

export function isLinkableLine(line, page) {
    if (!line?.isConnected || isImageBlock(line)) return false;
    page = page || line.closest(NOTE_PAGE_SEL);
    if (page && isImageRow(line, page)) return false;
    return true;
}

export function trimLinkTrailingPunctuation(url) {
    return url.replace(/[.,;:!?)]+$/, '');
}

export function normalizeLinkHref(url) {
    if (/^www\./i.test(url)) return `https://${url}`;
    return url;
}

export function createLinkAnchor(url) {
    const a = document.createElement('a');
    a.href = normalizeLinkHref(url);
    a.className = 'link';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = url;
    return a;
}

export function openPageContentLink(link) {
    const href = link?.href;
    if (!href) return;
    window.open(href, '_blank', 'noopener,noreferrer');
}

export function linkifyTextNode(textNode) {
    const text = textNode.textContent;
    if (!text) return false;

    LINK_URL_RE.lastIndex = 0;
    if (!LINK_URL_RE.test(text)) return false;

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let changed = false;

    LINK_URL_RE.lastIndex = 0;
    let match;
    while ((match = LINK_URL_RE.exec(text)) !== null) {
        let url = trimLinkTrailingPunctuation(match[0]);
        if (!url) continue;
        changed = true;
        if (match.index > lastIndex) {
            frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        frag.appendChild(createLinkAnchor(url));
        lastIndex = match.index + match[0].length;
    }

    if (!changed) return false;
    if (lastIndex < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
    textNode.replaceWith(frag);
    return true;
}

export function linkifyLine(line) {
    if (!isLinkableLine(line)) return false;

    const root = lines.getLineEditableRoot(line);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            if (node.parentElement?.closest('a.link')) return NodeFilter.FILTER_REJECT;
            return node.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
    });

    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    let changed = false;
    textNodes.forEach((node) => {
        if (linkifyTextNode(node)) changed = true;
    });
    line.querySelectorAll(':scope > a.link').forEach((a) => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    });
    return changed;
}

export function linkifyLinePreservingCaret(page, line) {
    if (!page || !line) return;
    const sel = window.getSelection();
    const offset = sel?.rangeCount ? lines.getCaretOffsetInLine(line, sel) : null;
    linkifyLine(line);
    if (offset != null) lines.focusLine(page, line, offset);
}

export function getSelectedImageBlocks(page, range) {
    if (!page || !range || range.collapsed) return [];
    const span = lines.getBlockSpanInRange(page, range);
    if (!span) return [];

    const { startIdx, endIdx, divs } = span;
    const selected = [];
    for (let i = startIdx; i <= endIdx; i++) {
        const block = divs[i];
        if (!isImageBlock(block)) continue;
        try {
            if (typeof range.intersectsNode === 'function' && range.intersectsNode(block)) {
                selected.push(block);
                continue;
            }
        } catch {
        }
        try {
            const blockRange = document.createRange();
            blockRange.selectNode(block);
            if (
                range.compareBoundaryPoints(Range.START_TO_START, blockRange) <= 0 &&
                range.compareBoundaryPoints(Range.END_TO_END, blockRange) >= 0
            ) {
                selected.push(block);
            }
        } catch {
            selected.push(block);
        }
    }
    return selected;
}

export function serializeImageBlocksForClipboard(blocks) {
    return JSON.stringify(
        blocks
            .map((block) => ({
                src: block.querySelector(':scope > img')?.src || '',
            }))
            .filter((item) => item.src)
    );
}

export function getClipboardImagePayload(e) {
    const dt = lines.getClipboardDataTransfer(e);
    let raw = dt?.getData(IMAGE_CLIPBOARD_MIME);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) return null;
        return data.filter((item) => item?.src);
    } catch {
        return null;
    }
}

export function getClipboardImageFiles(e) {
    const dt = lines.getClipboardDataTransfer(e);
    if (!dt?.items?.length) return [];
    const files = [];
    for (let i = 0; i < dt.items.length; i += 1) {
        const item = dt.items[i];
        if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (file) files.push(file);
    }
    return files;
}

export function getClipboardImageUrlsFromHtml(e) {
    const dt = lines.getClipboardDataTransfer(e);
    const html = dt?.getData('text/html');
    if (!html) return [];
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const urls = [];
        doc.querySelectorAll('img[src]').forEach((img) => {
            const src = img.getAttribute('src')?.trim();
            if (!src || src.startsWith('cid:')) return;
            urls.push(src);
        });
        return urls;
    } catch {
        return [];
    }
}

export function readImageFilesAsDataUrls(files, cb) {
    if (!files.length) {
        cb([]);
        return;
    }
    const results = new Array(files.length);
    let pending = files.length;
    files.forEach((file, index) => {
        readImageFile(file, (src) => {
            results[index] = src;
            pending -= 1;
            if (pending === 0) cb(results.filter(Boolean));
        });
    });
}

export function willPasteImagesFromClipboard(e) {
    if (getClipboardImagePayload(e)?.length) return true;
    if (getClipboardImageFiles(e).length) return true;
    if (getClipboardImageUrlsFromHtml(e).length) return true;
    return false;
}

export function resolvePasteAnchor(page, sel) {
    if (!sel?.rangeCount) return { page, placement: 'append' };
    const range = sel.getRangeAt(0);

    const line = lines.getLineFromNode(range.startContainer, page, range, 'start');
    if (line && !isImageBlock(line) && !isImageRow(line, page)) {
        return resolveImageInsertPlacement(page, line, sel) || { page, placement: 'append' };
    }

    const imageBlock = getImageBlockFromSelection(page);
    if (imageBlock) {
        return { page, imageBlock, placement: 'afterImage' };
    }

    const block = lines.getPageBlockFromNode(range.startContainer, page, range, 'start');
    if (isImageBlock(block)) {
        return { page, imageBlock: block, placement: 'afterImage' };
    }

    return { page, placement: 'append' };
}

export function pasteImageBlocksIntoPage(page, images) {
    if (!images?.length || !page) return false;

    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    let range = sel.getRangeAt(0);
    if (!page.contains(range.commonAncestorContainer)) return false;

    if (!range.collapsed) {
        lines.deleteSelectedPageText(page, sel, range);
        if (!sel.rangeCount) return false;
        range = sel.getRangeAt(0);
    }

    const blocks = images.map((item) => createImageBlock(item.src)).filter(Boolean);
    if (!blocks.length) return false;

    const anchor = resolvePasteAnchor(page, sel);
    insertImageRowAtAnchor(page, blocks[0], anchor?.page === page ? anchor : null);
    for (let i = 1; i < blocks.length; i++) {
        blocks[i - 1].after(blocks[i]);
    }

    removeTrailingEmptyLineAfterImage(page);
    focusBesideImage(page, blocks[blocks.length - 1], 'after');
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    lines.scheduleScrollCaretIntoView(page);
    return true;
}

export function pasteImageBlocksFromClipboard(page, e, onComplete) {
    const finish = (ok) => {
        onComplete?.(ok);
        return ok;
    };

    const custom = getClipboardImagePayload(e);
    if (custom?.length) return finish(pasteImageBlocksIntoPage(page, custom));

    const files = getClipboardImageFiles(e);
    if (files.length) {
        const sel = window.getSelection();
        const savedRange =
            sel?.rangeCount && page.contains(sel.getRangeAt(0).commonAncestorContainer)
                ? sel.getRangeAt(0).cloneRange()
                : null;
        readImageFilesAsDataUrls(files, (srcs) => {
            if (savedRange && sel) {
                sel.removeAllRanges();
                sel.addRange(savedRange);
            }
            finish(pasteImageBlocksIntoPage(page, srcs.map((src) => ({ src }))));
        });
        return true;
    }

    const urls = getClipboardImageUrlsFromHtml(e);
    if (urls.length) return finish(pasteImageBlocksIntoPage(page, urls.map((src) => ({ src }))));

    return finish(false);
}

export function copySelectedImagesToClipboard(page, e) {
    lines.normalizePageSelection(page);
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !page.contains(range.commonAncestorContainer)) return false;

    const imageBlocks = getSelectedImageBlocks(page, range);
    if (!imageBlocks.length) return false;

    const payload = serializeImageBlocksForClipboard(imageBlocks);
    if (!payload || payload === '[]') return false;

    e.clipboardData.setData(IMAGE_CLIPBOARD_MIME, payload);
    e.clipboardData.setData('text/plain', '');
    e.preventDefault();
    return true;
}

export function setupImageBlocks(page) {
    normalizeImageBlocks(page);
}

export function removeImageBlock(page, target, focusTarget, focusPos = false) {
    if (!page || !target) return;
    const block = isImageBlock(target) ? target : ensureImageBlock(page, target);
    const removeEl = block || target;
    if (!removeEl?.isConnected) return;
    removeEl.remove();
    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
    lines.removeMeaninglessEmptyTextLines(page);
    app.hooks.updatePageTitleElement(page);
    if (focusTarget?.isConnected) lines.focusLine(page, focusTarget, focusPos);
    else if (lines.isPageStructureEmpty(page)) lines.focusPageCaret(page, 0);
}

export function ensureTextLineAfterImage(imageBlock) {
    const page = imageBlock.closest(NOTE_PAGE_SEL);
    const block = ensureImageBlock(page, imageBlock) || imageBlock.closest('div.image');
    const anchor = block || imageBlock;
    let next = anchor.nextElementSibling;
    while (next && isImageBlock(next)) {
        next = next.nextElementSibling;
    }
    if (!next) {
        next = document.createElement('div');
        next.innerHTML = '<br>';
        anchor.after(next);
        touchPage(page.id);
        app.hooks.syncPageAreaFromPage(page);
    } else {
        next.classList.remove('image', 'on');
    }
    return next;
}

export function getImageBlockFromSelection(page) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !page) return null;
    let node = sel.anchorNode;
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE && isImageRow(node.parentElement, page)) {
        return node.parentElement;
    }
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    let el = node;
    while (el && el.parentElement !== page) el = el.parentElement;
    if (isImageBlock(el)) return el;
    return null;
}

export function moveStrayContentOutOfImageBlocks(page) {
    page.querySelectorAll(':scope > div.image').forEach((imageBlock) => {
        setupImageBlock(imageBlock);
        const strayNodes = [...imageBlock.childNodes].filter(
            (n) =>
                (n.nodeType === Node.TEXT_NODE && n.textContent.length) ||
                (n.nodeType === Node.ELEMENT_NODE &&
                    n.tagName !== 'IMG' &&
                    !n.classList?.contains('icon') &&
                    !n.classList?.contains('image-btn'))
        );
        if (!strayNodes.length) return;

        const textLine = ensureTextLineAfterImage(imageBlock);
        const movedText = strayNodes
            .map((n) => (n.nodeType === Node.TEXT_NODE ? n.textContent : n.textContent))
            .join('');
        strayNodes.forEach((n) => n.remove());

        if (movedText) {
            if (textLine.querySelector('br') && !textLine.textContent.trim()) {
                textLine.textContent = movedText;
            } else {
                textLine.textContent += movedText;
            }
            textLine.classList.remove('image', 'on');
            lines.focusLine(page, textLine, true);
        }
    });
}

export function blockImageBlockInput(page, e) {
    if (e.inputType === 'insertFromPaste') return false;

    const imageBlock =
        e.target.closest?.(`${NOTE_PAGE_ON_SEL} > div.image`) || getImageBlockFromSelection(page);
    if (!imageBlock || !page.contains(imageBlock)) return false;

    if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward') {
        e.preventDefault();
        const prevText = getPreviousTextBlock(imageBlock, page);
        const nextText = getNextTextBlock(imageBlock, page);
        removeImageBlock(page, imageBlock, prevText || nextText, !!prevText);
        return true;
    }

    e.preventDefault();
    const pasteText = e.inputType === 'insertFromPaste' ? e.dataTransfer?.getData('text/plain') : '';
    const seed = e.inputType === 'insertText' ? e.data || '' : pasteText;
    if (seed) {
        const block = ensureImageBlock(page, imageBlock);
        if (block) beginTypingBesideImageRow(page, block, 'after', seed);
    } else focusBesideImage(page, imageBlock, 'after');
    return true;
}

export function handleImageRowCaretKeydown(page, sel, range, e, caret) {
    const { row, side } = caret;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const prevText = getPreviousTextBlock(row, page);
        if (prevText) {
            lines.focusLine(
                page,
                prevText,
                e.key === 'ArrowUp' ? lines.getCaretOffsetInLine(prevText, sel) : true
            );
        } else {
            beginTypingBesideImageRow(page, row, 'before');
        }
        return true;
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextText = getNextTextBlock(row, page);
        if (nextText) {
            lines.focusLine(
                page,
                nextText,
                e.key === 'ArrowDown' ? lines.getCaretOffsetInLine(nextText, sel) : false
            );
        } else {
            beginTypingBesideImageRow(page, row, 'after');
        }
        return true;
    }

    if (e.key === 'Backspace') {
        e.preventDefault();
        if (side === 'after') {
            const prevText = getPreviousTextBlock(row, page);
            const nextText = getNextTextBlock(row, page);
            removeImageBlock(page, row, prevText || nextText, !!prevText);
        } else {
            const prevText = getPreviousTextBlock(row, page);
            if (prevText) lines.focusLine(page, prevText, true);
            else beginTypingBesideImageRow(page, row, 'before');
        }
        return true;
    }

    if (e.key === 'Delete') {
        e.preventDefault();
        if (side === 'before') {
            const prevText = getPreviousTextBlock(row, page);
            const nextText = getNextTextBlock(row, page);
            removeImageBlock(page, row, prevText || nextText, false);
        } else {
            const nextText = getNextTextBlock(row, page);
            if (nextText) lines.focusLine(page, nextText, false);
            else beginTypingBesideImageRow(page, row, 'after');
        }
        return true;
    }

    if (e.key === 'Enter') {
        e.preventDefault();
        beginTypingBesideImageRow(page, row, side);
        return true;
    }

    if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        e.key.length === 1 &&
        !e.isComposing
    ) {
        e.preventDefault();
        beginTypingBesideImageRow(page, row, side, e.key);
        return true;
    }

    return false;
}

export function handlePageBlockCaretKeydown(page, sel, range, e, caret) {
    return handleImageRowCaretKeydown(page, sel, range, e, {
        row: caret.row,
        side: caret.blockSide,
    });
}

export function selectionIncludesImageBlock(page, range) {
    if (!page || !range || range.collapsed) return false;
    return lines.getPageChildDivs(page).some((div) => {
        if (!isImageBlock(div)) return false;
        if (typeof range.intersectsNode === 'function') {
            try {
                if (range.intersectsNode(div)) return true;
            } catch {
            }
        }
        try {
            const blockRange = document.createRange();
            blockRange.selectNode(div);
            return (
                range.compareBoundaryPoints(Range.START_TO_START, blockRange) <= 0 &&
                range.compareBoundaryPoints(Range.END_TO_END, blockRange) >= 0
            );
        } catch {
            return false;
        }
    });
}

export function resolveImageInsertPlacement(page, line, sel) {
    if (!line || isImageBlock(line) || isImageRow(line, page)) return null;
    if (lines.isEmptyBrLine(line, page)) {
        return { page, line, placement: 'replaceLine' };
    }
    const offset = lines.getCaretOffsetInLine(line, sel);
    const textLen = lines.getLineTextContent(line).length;
    if (offset === 0) return { page, line, placement: 'before', offset };
    if (offset >= textLen) return { page, line, placement: 'after', offset };
    return { page, line, placement: 'split', offset };
}

export function captureImageInsertAnchor() {
    // 파일 선택창이 뜨면 셀렉션이 사라져서, click보다 먼저 삽입 위치를 저장해야 한다.
    const page = app.hooks.getActivePage();
    if (!page) {
        app.pendingImageInsert = null;
        return;
    }

    const sel = window.getSelection();
    if (sel?.rangeCount) {
        const range = sel.getRangeAt(0);
        if (page.contains(range.commonAncestorContainer)) {
            const line = lines.getLineFromNode(range.startContainer, page, range, 'start');
            if (line) {
                app.pendingImageInsert = resolveImageInsertPlacement(page, line, sel);
                return;
            }

            const imageBlock = getImageBlockFromSelection(page);
            if (imageBlock) {
                app.pendingImageInsert = { page, imageBlock, placement: 'afterImage' };
                return;
            }

            const block = lines.getPageBlockFromNode(range.startContainer, page, range, 'start');
            if (isImageBlock(block)) {
                app.pendingImageInsert = { page, imageBlock: block, placement: 'afterImage' };
                return;
            }
        }
    }

    const ctx = lines.getLineContext();
    if (ctx?.page === page && ctx.line) {
        app.pendingImageInsert = resolveImageInsertPlacement(page, ctx.line, sel);
        return;
    }

    app.pendingImageInsert = { page, placement: 'append' };
}

export function insertImageRowAtAnchor(page, row, anchor) {
    if (anchor?.line?.isConnected && anchor.placement === 'replaceLine') {
        anchor.line.replaceWith(row);
        return;
    }
    if (anchor?.line?.isConnected && anchor.placement === 'before') {
        anchor.line.before(row);
        return;
    }
    if (anchor?.line?.isConnected && anchor.placement === 'after') {
        anchor.line.after(row);
        return;
    }
    if (anchor?.line?.isConnected && anchor.placement === 'split') {
        lines.splitLineAtOffset(anchor.line, anchor.offset);
        anchor.line.after(row);
        return;
    }
    if (anchor?.row?.isConnected && anchor.placement === 'beforeRow') {
        anchor.row.before(row);
        return;
    }
    if (anchor?.row?.isConnected && anchor.placement === 'afterRow') {
        anchor.row.after(row);
        return;
    }
    if (anchor?.imageBlock?.isConnected && anchor.placement === 'afterImage') {
        ensureImageBlock(page, anchor.imageBlock).after(row);
        return;
    }

    const sel = window.getSelection();
    const ctx = lines.getLineContext();
    if (ctx?.page === page && ctx.line && sel?.rangeCount) {
        const placement = resolveImageInsertPlacement(page, ctx.line, sel);
        if (placement?.placement === 'replaceLine') {
            ctx.line.replaceWith(row);
            return;
        }
        if (placement?.placement === 'before') {
            ctx.line.before(row);
            return;
        }
        if (placement?.placement === 'after') {
            ctx.line.after(row);
            return;
        }
        if (placement?.placement === 'split') {
            lines.splitLineAtOffset(ctx.line, placement.offset);
            ctx.line.after(row);
            return;
        }
    }

    const imageBlock = getImageBlockFromSelection(page);
    if (imageBlock) {
        ensureImageBlock(page, imageBlock).after(row);
        return;
    }

    const lastLine = lines.getTextLines(page).at(-1);
    if (lastLine) lastLine.after(row);
    else page.appendChild(row);
}

export function insertImageToBoard(src) {
    const page = app.hooks.getActivePage();
    if (!page) return;
    const block = createImageBlock(src);

    const anchor = app.pendingImageInsert?.page === page ? app.pendingImageInsert : null;
    app.pendingImageInsert = null;

    insertImageRowAtAnchor(page, block, anchor);
    removeTrailingEmptyLineAfterImage(page);
    focusBesideImage(page, block, 'after');

    touchPage(page.id);
    app.hooks.syncPageAreaFromPage(page);
}

export function handleImageInput(input, onPick, onInvalid) {
    input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!isImageFile(file)) {
            alert('이미지 파일을 다시 선택해 주세요.');
            input.value = '';
            onInvalid?.();
            return;
        }
        readImageFile(file, (src) => {
            onPick(src);
            input.value = '';
        });
    });
}

