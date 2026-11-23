// makefun-site's template dialect (README.md, "Templates"): its own, not Liquid, Nunjucks, Mustache or EJS.
//
//   {{ path }}               the value at path, HTML-escaped
//   {{{ path }}}             the value at path, raw
//   {% for x in path %} ... {% endfor %}      each element of an array, x bound to it and loop to
//                                             { index (from 1), first, last, length }
//   {% if path %} ... {% else %} ... {% endif %}   and {% if not path %}; the else is optional
//   {% include "name" %}     the template `name` rendered in the same scope, at most INCLUDE_DEPTH deep
//
// A path is names joined by dots (a-z, A-Z, 0-9 and _, from a letter or _). A {% %} tag alone on its line (only spaces
// or tabs beside it) takes its whole line with it, its newline included. A template is parsed once into a tree of
// nodes, and rendering walks the tree in a chain of scopes.

/** The deepest an include nests: one past it renders nothing. */
export const INCLUDE_DEPTH = 8;

const PATH = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const FOR = /^for ([A-Za-z_][A-Za-z0-9_]*) in (\S+)$/;
const IF = /^if (not )?(\S+)$/;
const INCLUDE = /^include "([a-z0-9-]+)"$/;

/** A template that does not parse: its name and why. */
export class TemplateError extends Error {}

/** The path `text` names, split at its dots, or a TemplateError. */
function pathOf(name, text) {
  if (!PATH.test(text)) throw new TemplateError(`template "${name}": ${JSON.stringify(text)} is not a path`);
  return text.split('.');
}

/** `src`'s tokens: text, {{ }}, {{{ }}} and {% %}, a standalone tag's line taken with it. */
function tokenize(name, src) {
  const tokens = [];
  let text = '';
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open === -1 || open === src.length - 1) {
      text += src.slice(i);
      break;
    }
    const next = src[open + 1];
    if (next !== '{' && next !== '%') {
      text += src.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    text += src.slice(i, open);
    if (next === '{') {
      const raw = src[open + 2] === '{';
      const close = src.indexOf(raw ? '}}}' : '}}', open + (raw ? 3 : 2));
      if (close === -1) throw new TemplateError(`template "${name}": a ${raw ? '{{{' : '{{'} is not closed`);
      if (text !== '') tokens.push({ t: 'text', text });
      text = '';
      tokens.push({ t: raw ? 'raw' : 'var', path: pathOf(name, src.slice(open + (raw ? 3 : 2), close).trim()) });
      i = close + (raw ? 3 : 2);
      continue;
    }
    const close = src.indexOf('%}', open + 2);
    if (close === -1) throw new TemplateError(`template "${name}": a {% is not closed`);
    const end = close + 2;
    const lineStart = src.lastIndexOf('\n', open - 1) + 1;
    const nl = src.indexOf('\n', end);
    const lineEnd = nl === -1 ? src.length : nl;
    const standalone = /^[ \t]*$/.test(src.slice(lineStart, open)) && /^[ \t]*$/.test(src.slice(end, lineEnd));
    if (standalone) text = text.slice(0, text.length - (open - lineStart));
    if (text !== '') tokens.push({ t: 'text', text });
    text = '';
    tokens.push({ t: 'tag', tag: src.slice(open + 2, close).trim() });
    i = standalone ? (nl === -1 ? src.length : nl + 1) : end;
  }
  if (text !== '') tokens.push({ t: 'text', text });
  return tokens;
}

/** `src` parsed into its tree of nodes (a TemplateError when it does not parse). */
export function parseTemplate(name, src) {
  const root = { kind: 'root', body: [] };
  const stack = [root];
  let body = root.body;
  for (const tok of tokenize(name, src)) {
    if (tok.t === 'text') body.push({ kind: 'text', text: tok.text });
    else if (tok.t === 'var' || tok.t === 'raw') body.push({ kind: tok.t, path: tok.path });
    else {
      const tag = tok.tag;
      const top = stack[stack.length - 1];
      let m;
      if ((m = FOR.exec(tag)) !== null) {
        const node = { kind: 'for', name: m[1], path: pathOf(name, m[2]), body: [] };
        body.push(node);
        stack.push(node);
        body = node.body;
      } else if ((m = IF.exec(tag)) !== null) {
        const node = { kind: 'if', not: m[1] !== undefined, path: pathOf(name, m[2]), then: [], else: null };
        body.push(node);
        stack.push(node);
        body = node.then;
      } else if (tag === 'else') {
        if (top.kind !== 'if' || top.else !== null) throw new TemplateError(`template "${name}": an else outside an if`);
        top.else = [];
        body = top.else;
      } else if (tag === 'endfor' || tag === 'endif') {
        if (top.kind !== (tag === 'endfor' ? 'for' : 'if')) throw new TemplateError(`template "${name}": an ${tag} with no open ${tag.slice(3)}`);
        stack.pop();
        const parent = stack[stack.length - 1];
        body = parent.kind === 'root' ? parent.body : parent.kind === 'for' ? parent.body : parent.else ?? parent.then;
      } else if ((m = INCLUDE.exec(tag)) !== null) body.push({ kind: 'include', name: m[1] });
      else throw new TemplateError(`template "${name}": {% ${tag} %} is not a tag`);
    }
  }
  if (stack.length > 1) throw new TemplateError(`template "${name}": a ${stack[stack.length - 1].kind} is not closed`);
  return root.body;
}

/** The value at `path` in the scope chain: its first name from the nearest scope holding it, then own properties. */
function rootValue(scope, name) {
  while (scope !== null && !Object.hasOwn(scope.vars, name)) scope = scope.parent;
  return scope === null ? undefined : scope.vars[name];
}
function lookup(scope, path) {
  let v = rootValue(scope, path[0]);
  for (let k = 1; k < path.length; k++) {
    if (v === null || typeof v !== 'object' || !Object.hasOwn(v, path[k])) return undefined;
    v = v[path[k]];
  }
  return v;
}

/** A value as text: a string itself, a number in JavaScript's digits, true or false, an array's items joined by ", ", else "". */
function textOf(v) {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map(textOf).join(', ');
  return '';
}

/** Whether a value counts as true in an if: not undefined, null, false, "", 0 or an empty array. */
function truthy(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== undefined && v !== null && v !== false && v !== '' && v !== 0;
}

/** Free template variables, including dependencies of nested includes. */
export function includePlans(templates, shared) {
  const deps = new Map(), visiting = new Set(), plans = new Map();
  function free(nodes, names) {
    for (const n of nodes) {
      if (n.path) names.add(n.path[0]);
      if (n.kind === 'include') {
        const required = depsOf(n.name);
        if (!required) return false;
        for (const key of required) names.add(key);
      } else if (n.kind === 'if') {
        if (!free(n.then, names) || n.else && !free(n.else, names)) return false;
      } else if (n.kind === 'for') {
        const nested = new Set();
        if (!free(n.body, nested)) return false;
        for (const key of nested) if (key !== n.name && key !== 'loop') names.add(key);
      }
    }
    return true;
  }
  function depsOf(name) {
    if (deps.has(name)) return deps.get(name);
    if (visiting.has(name)) return null;
    visiting.add(name);
    const names = new Set();
    const valid = free(templates.get(name) ?? [], names);
    visiting.delete(name);
    const result = valid ? names : null;
    deps.set(name, result);
    return result;
  }
  for (const [name, nodes] of templates) {
    const keys = depsOf(name);
    if (!keys) continue;
    const varying = [...keys].filter(key => !Object.hasOwn(shared, key));
    if (varying.length <= 1) plans.set(name, {
      nodes,
      stable: [...keys].filter(key => Object.hasOwn(shared, key)),
      varying: varying[0],
      results: [],
    });
  }
  return plans;
}

function renderInclude(name, scope, ctx, depth) {
  const fn = ctx.compiled.get(name);
  if (fn === undefined || depth > INCLUDE_DEPTH) return '';
  const plan = ctx.plans.get(name);
  if (!plan || plan.stable.some(key => rootValue(scope,key) !== ctx.shared[key])) {
    return fn(scope, ctx, depth);
  }
  let bucket = plan.results[depth];
  if (bucket === undefined) bucket = plan.results[depth] = new Map();
  const value = plan.varying === undefined ? undefined : rootValue(scope, plan.varying);
  let answer = bucket.get(value);
  if (answer === undefined) {
    answer = fn(scope, ctx, depth);
    bucket.set(value, answer);
  }
  return answer;
}

// All literals and property names are emitted as JSON strings. Only our fixed
// grammar produces code; template text itself is never interpreted as JS.
export function compileTemplates(templates) {
  let serial=0;
  const funcs=[];
  const quote=JSON.stringify;
  for(const [name,nodes] of templates) {
    const roots=new Map();
    function nameOf(key, env) {
      if(env.has(key))return env.get(key);
      let id=roots.get(key);
      if(id===undefined){id='v'+serial++;roots.set(key,id);}
      return id;
    }
    function expr(path, env) {
      let s=nameOf(path[0],env);
      for(let i=1;i<path.length;i++) s='field('+s+','+quote(path[i])+')';
      return s;
    }
    function includes(nodes) {
      return nodes.some(n=>n.kind==='include'||n.kind==='for'&&includes(n.body)||n.kind==='if'&&(includes(n.then)||n.else&&includes(n.else)));
    }
    function emit(nodes, env, scope) {
      let code='', group=[];
      function flush(){if(group.length){code+='o+='+group.join('+')+';';group=[];}}
      for(const n of nodes) {
        switch(n.kind) {
          case 'text': group.push(quote(n.text)); break;
          case 'var': group.push('c.escape(text('+expr(n.path,env)+'))'); break;
          case 'raw': group.push('text('+expr(n.path,env)+')'); break;
          case 'include': group.push('inc('+quote(n.name)+','+scope+',c,d+1)'); break;
          case 'if':
            flush();
            code+='if('+(n.not?'!':'')+'yes('+expr(n.path,env)+')){'+emit(n.then,env,scope)+'}';
            if(n.else) code+='else{'+emit(n.else,env,scope)+'}';
            break;
          case 'for': {
            flush();
            const id=serial++, list='a'+id, j='i'+id, len='n'+id, value='x'+id, loop='l'+id, inner='s'+id;
            const local=new Map(env);local.set(n.name,value);local.set('loop',loop);
            const needsScope=includes(n.body);
            const body=emit(n.body,local,needsScope?inner:scope);
            code+='{const '+list+'='+expr(n.path,env)+';if(Array.isArray('+list+')){const '+len+'='+list+'.length;for(let '+j+'=0;'+j+'<'+len+';'+j+'++){';
            code+='const '+value+'='+list+'['+j+'];';
            if(needsScope||body.includes(loop))code+='const '+loop+'={index:'+j+'+1,first:'+j+'===0,last:'+j+'==='+len+'-1,length:'+len+'};';
            if(needsScope)code+='const '+inner+'={vars:{['+quote(n.name)+']:'+value+',loop:'+loop+'},parent:'+scope+'};';
            code+=body+'}}}';
            break;
          }
        }
      }
      flush();return code;
    }
    const code=emit(nodes,new Map(),'s');
    let setup='';
    for(const [key,id] of roots)setup+='const '+id+'=root(s,'+quote(key)+');';
    funcs.push('['+quote(name)+',(s,c,d)=>{'+setup+'let o="";'+code+'return o;}]');
  }
  const fn=new Function('root','field','text','yes','inc','return ['+funcs.join(',')+'];');
  return new Map(fn(rootValue,ownField,textOf,truthy,renderInclude));
}
function ownField(v,k) {
  return v!==null && typeof v==='object' && Object.hasOwn(v,k) ? v[k] : undefined;
}
