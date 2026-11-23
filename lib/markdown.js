// makefun-site's Markdown (README.md, "Markdown"): its own subset, lexed into block tokens and then rendered, in the
// shape of marked's lexer and parser. Blocks: ATX headings (each with an id), fenced code, thematic breaks,
// blockquotes, flat lists and paragraphs. Inline: code spans, strong, emphasis, links and backslash escapes. No raw
// HTML (every < is escaped), no setext headings, no indented code, no tables, no reference links, no underscore
// emphasis.

import { escapeHtml, slugify, uniqueSlug } from './text.js';

const BLANK = /^[ \t]*$/;
const FENCE_OPEN = /^```([A-Za-z0-9_+-]*)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*$/;
const HR = /^(?:---|\*\*\*)[ \t]*$/;
const QUOTE = /^>/;
const BULLET = /^[-*] (.*)$/;
const ORDERED = /^(\d{1,9})\. (.*)$/;
const CONTINUED = /^ {2,}\S/;

/** A heading line's level and text, or null (a heading's text is never empty). */
function headingOf(line) {
  const m = HEADING.exec(line);
  return m === null || m[2] === '' ? null : { depth: m[1].length, text: m[2] };
}

/** Whether `line` ends a paragraph: a blank line, a fence, a heading or a thematic break. */
function endsParagraph(line) {
  return BLANK.test(line) || FENCE_OPEN.test(line) || headingOf(line) !== null || HR.test(line);
}

/** A paragraph line as it is rendered: spaces and tabs at either end dropped. */
const trimLine = (line) => line.replace(/^[ \t]+|[ \t]+$/g, '');

/** `src`'s block tokens, in order. */
export function lex(src) {
  const lines = src.split('\n');
  const tokens = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BLANK.test(line)) {
      i++;
      continue;
    }
    const fence = FENCE_OPEN.exec(line);
    if (fence !== null) {
      const body = [];
      i++;
      while (i < lines.length && !FENCE_CLOSE.test(lines[i])) body.push(lines[i++]);
      i++;
      tokens.push({ type: 'code', lang: fence[1], lines: body });
      continue;
    }
    const heading = headingOf(line);
    if (heading !== null) {
      tokens.push({ type: 'heading', depth: heading.depth, text: heading.text });
      i++;
      continue;
    }
    if (HR.test(line)) {
      tokens.push({ type: 'hr' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body = [];
      while (i < lines.length && QUOTE.test(lines[i])) body.push(lines[i++].replace(/^> ?/, ''));
      tokens.push({ type: 'blockquote', lines: body.map(trimLine).filter((l) => l !== '') });
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet === null ? ORDERED.exec(line) : null;
    if (bullet !== null || ordered !== null) {
      const isOrdered = ordered !== null;
      const marker = isOrdered ? ORDERED : BULLET;
      const items = [];
      while (i < lines.length) {
        const m = marker.exec(lines[i]);
        if (m !== null) {
          items.push([trimLine(isOrdered ? m[2] : m[1])]);
          i++;
        } else if (CONTINUED.test(lines[i])) {
          items[items.length - 1].push(trimLine(lines[i]));
          i++;
        } else break;
      }
      tokens.push({ type: 'list', ordered: isOrdered, start: isOrdered ? Number(ordered[1]) : 1, items: items.map((parts) => parts.join('\n')) });
      continue;
    }
    const body = [trimLine(line)];
    i++;
    while (i < lines.length && !endsParagraph(lines[i])) body.push(trimLine(lines[i++]));
    tokens.push({ type: 'paragraph', text: body.join('\n') });
  }
  return tokens;
}

/** The characters a backslash escapes. */
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>']);

/** The first index from `from` where `s` holds `what` outside a backslash escape, or -1. */
function findUnescaped(s, what, from) {
  let j = s.indexOf(what, from);
  while (j !== -1) {
    let k = j;
    while (k > from && s.charCodeAt(k-1) === 92) k--;
    if (((j-k)&1) === 0) return j;
    j = s.indexOf(what,j+1);
  }
  return -1;
}

/** The first single * from `from` (one whose run is not **), outside an escape, or -1. */
function findSingleStar(s, from) {
  for (let j = from; j < s.length; j++) {
    const c = s[j];
    if (c === '\\' && j + 1 < s.length && ESCAPABLE.has(s[j + 1])) {
      j++;
      continue;
    }
    if (c !== '*') continue;
    if (s[j + 1] === '*') {
      j++;
      continue;
    }
    return j;
  }
  return -1;
}

// Scan ordinary text in spans; the existing inline rules handle just the special marks.
const special = /[\\`*\[&<>"']/g;
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** `s` rendered inline; `env.link(target)` is a link's href. */
export function inline(s, env) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    special.lastIndex = i;
    if (!special.test(s)) return out + s.slice(i);
    const index = special.lastIndex - 1;
    if (index > i) out += s.slice(i, index);
    i = index;
    const c = s[i];
    if (c === '\\' && i + 1 < s.length && ESCAPABLE.has(s[i + 1])) {
      out += escapeHtml(s[i + 1]);
      i += 2;
      continue;
    }
    if (c === '`') {
      const j = s.indexOf('`', i + 1);
      if (j > i + 1) {
        out += `<code>${escapeHtml(s.slice(i + 1, j))}</code>`;
        i = j + 1;
      } else {
        out += '`';
        i++;
      }
      continue;
    }
    if (c === '*') {
      if (s[i + 1] === '*') {
        const j = findUnescaped(s, '**', i + 2);
        if (j > i + 2) {
          out += `<strong>${inline(s.slice(i + 2, j), env)}</strong>`;
          i = j + 2;
        } else {
          out += '**';
          i += 2;
        }
        continue;
      }
      const j = findSingleStar(s, i + 1);
      if (j > i + 1) {
        out += `<em>${inline(s.slice(i + 1, j), env)}</em>`;
        i = j + 1;
      } else {
        out += '*';
        i++;
      }
      continue;
    }
    if (c === '[') {
      const k = findUnescaped(s, ']', i + 1);
      const m = k !== -1 && s[k + 1] === '(' ? s.indexOf(')', k + 2) : -1;
      const target = m === -1 ? '' : s.slice(k + 2, m);
      if (target !== '' && !/\s/.test(target)) {
        out += `<a href="${escapeHtml(env.link(target))}">${inline(s.slice(i + 1, k), env)}</a>`;
        i = m + 1;
        continue;
      }
      out += '[';
      i++;
      continue;
    }
    out += entities[c] ?? c;
    i++;
  }
  return out;
}

/**
 * `src` rendered: its HTML (each block on its own lines, a "\n" after the last), its table of contents (every level 2
 * and 3 heading: level, id and its inline HTML) and its excerpt (the first paragraph's inline HTML, or "").
 */
function fallbackMarkdown(src, env) {
  const ids = new Set();
  const blocks = [];
  const toc = [];
  let excerpt = null;
  for (const t of lex(src)) {
    switch (t.type) {
      case 'heading': {
        const id = uniqueSlug(slugify(t.text), ids);
        const html = inline(t.text, env);
        blocks.push(`<h${t.depth} id="${id}">${html}</h${t.depth}>`);
        if (t.depth === 2 || t.depth === 3) toc.push({ level: t.depth, id, html });
        break;
      }
      case 'code': {
        const cls = t.lang === '' ? '' : ` class="language-${escapeHtml(t.lang)}"`;
        blocks.push(`<pre><code${cls}>${t.lines.map((l) => `${escapeHtml(l)}\n`).join('')}</code></pre>`);
        break;
      }
      case 'hr':
        blocks.push('<hr>');
        break;
      case 'blockquote':
        blocks.push(t.lines.length === 0 ? '<blockquote>\n</blockquote>' : `<blockquote>\n<p>${inline(t.lines.join('\n'), env)}</p>\n</blockquote>`);
        break;
      case 'list': {
        const tag = t.ordered ? 'ol' : 'ul';
        const open = t.ordered && t.start !== 1 ? `<ol start="${t.start}">` : `<${tag}>`;
        blocks.push(`${open}\n${t.items.map((item) => `<li>${inline(item, env)}</li>\n`).join('')}</${tag}>`);
        break;
      }
      case 'paragraph': {
        const html = inline(t.text, env);
        if (excerpt === null) excerpt = html;
        blocks.push(`<p>${html}</p>`);
        break;
      }
    }
  }
  return { html: blocks.map((b) => `${b}\n`).join(''), toc, excerpt: excerpt ?? '' };
}

const isBlank = s => s === '' || ((s.charCodeAt(0) === 32 || s.charCodeAt(0) === 9) && BLANK.test(s));
const fence = s => s.charCodeAt(0) === 96 ? FENCE_OPEN.exec(s) : null;
const heading = s => s.charCodeAt(0) === 35 ? headingOf(s) : null;
const hr = s => (s[0] === '-' || s[0] === '*') && HR.test(s);
function trimmed(s) {
  let a=0,b=s.length;
  while (a<b && (s.charCodeAt(a)===32 || s.charCodeAt(a)===9)) a++;
  while (b>a && (s.charCodeAt(b-1)===32 || s.charCodeAt(b-1)===9)) b--;
  return a===0&&b===s.length ? s : s.slice(a,b);
}
export function renderMarkdown(src, env) {
  const lines = src.split('\n');
  const ids = new Set(), toc = [];
  const html=[]; let excerpt=null;
  // Preserve the reference's regex behavior while cheaply rejecting ordinary lines.
  if (/[\r\u2028\u2029]/.test(src)) return fallbackMarkdown(src,env);
  let i=0;
  while (i<lines.length) {
    const line=lines[i++];
    if (isBlank(line)) continue;
    const f=fence(line);
    if (f) {
      const cls=f[1] ? ' class="language-'+escapeHtml(f[1])+'"' : '';
      let block='<pre><code'+cls+'>'; 
      while(i<lines.length && !(lines[i][0]==='`' && FENCE_CLOSE.test(lines[i]))) {
        block+=escapeHtml(lines[i++])+'\n';
      }
      if(i<lines.length)i++;
      html.push(block+'</code></pre>\n');
      continue;
    }
    const h=heading(line);
    if(h) {
      const id=uniqueSlug(slugify(h.text),ids), title=inline(h.text,env), d=h.depth;
      html.push('<h'+d+' id="'+id+'">'+title+'</h'+d+'>\n');
      if (d===2 || d===3) toc.push({level:d,id,html:title});
      continue;
    }
    if(hr(line)){ html.push('<hr>\n'); continue; }
    if(line[0]==='>') {
      let body='', hasText=false;
      let l=line;
      do {
        const part=trimmed(l.startsWith('> ') ? l.slice(2) : l.slice(1));
        if(part!==''){if(hasText)body+='\n';body+=part;hasText=true;}
        if (i===lines.length || lines[i][0]!=='>') break;
        l=lines[i++];
      } while(true);
      html.push(hasText ? '<blockquote>\n<p>'+inline(body,env)+'</p>\n</blockquote>\n' : '<blockquote>\n</blockquote>\n');
      continue;
    }
    const bullet=(line[0]==='-' || line[0]==='*') ? BULLET.exec(line) : null;
    const ordered=!bullet && line[0]>='0' && line[0]<='9' ? ORDERED.exec(line) : null;
    if (bullet || ordered) {
      const tag=ordered?'ol':'ul', start=ordered?Number(ordered[1]):1;
      html.push((ordered && start!==1 ? '<ol start="'+start+'">' : '<'+tag+'>')+'\n');
      let item=trimmed(ordered?ordered[2]:bullet[1]);
      while(i<lines.length) {
        const l=lines[i], m=ordered ? ORDERED.exec(l) : BULLET.exec(l);
        if(m) { html.push('<li>'+inline(item,env)+'</li>\n');item=trimmed(ordered?m[2]:m[1]); }
        else if(l.charCodeAt(0)===32&&l.charCodeAt(1)===32&&CONTINUED.test(l))item+='\n'+trimmed(l);
        else break;
        i++;
      }
      html.push('<li>'+inline(item,env)+'</li>\n</'+tag+'>\n');
      continue;
    }
    let body=trimmed(line);
    while(i<lines.length) {
      const l=lines[i];
      if(isBlank(l) || fence(l) || heading(l) || hr(l)) break;
      body+='\n'+trimmed(l); i++;
    }
    const rendered=inline(body,env);
    if(excerpt===null)excerpt=rendered;
    html.push('<p>'+rendered+'</p>\n');
  }
  return {html:html.join(''),toc,excerpt:excerpt??''};
}
