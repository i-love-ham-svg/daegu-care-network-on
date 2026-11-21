const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = require('./runtime.cjs');

const root = path.join(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/social-manifest.json'), 'utf8'));

// Capture the app's registered listeners before it loads. All state stays in the
// runtime fixture: no browser storage, account, network, or payment is touched.
const fixtureSetup = `
  const onSocialThumbnails = ${JSON.stringify(manifest)};
  globalThis.__documentListeners = [];
  document.addEventListener = (type, listener, options) => {
    __documentListeners.push({type, listener, capture: options === true || !!options?.capture});
  };
  globalThis.__mediaQueries = new Map();
  window.matchMedia = query => {
    if (!__mediaQueries.has(query)) {
      const listeners = [];
      __mediaQueries.set(query, {
        media: query, matches: query === '(max-width:950px)',
        addEventListener(type, listener) { if (type === 'change') listeners.push(listener); },
        setMatches(matches) {
          if (this.matches === matches) return;
          this.matches = matches;
          for (const listener of listeners) listener({matches, media: query});
        }
      });
    }
    return __mediaQueries.get(query);
  };
`;

function attributes(markup) {
  return Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
}

function fixture() {
  const r = runtime(fixtureSetup);
  const nodes = new Map();

  function element(name, attrs = {}, parent = null) {
    const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    let markup = '';
    const node = {
      name, attrs: {...attrs}, parent, children: [], hidden: false, style: {},
      isConnected: true,
      get dataset() {
        return Object.fromEntries(Object.entries(this.attrs).filter(([key]) => key.startsWith('data-'))
          .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
      },
      get innerHTML() { return markup; },
      set innerHTML(value) {
        markup = value;
        if (name === 'nav') {
          this.children = [...value.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match, index) => {
            const link = element('nav-link-' + index, attributes(match[1]), this);
            link.textContent = match[2].replace(/<[^>]*>/g, '');
            return link;
          });
        }
      },
      classList: {
        toggle(key, value = !classes.has(key)) {
          if (value) classes.add(key); else classes.delete(key);
          return value;
        },
        contains(key) { return classes.has(key); },
        add(key) { classes.add(key); },
        remove(key) { classes.delete(key); }
      },
      setAttribute(key, value) { this.attrs[key] = String(value); },
      getAttribute(key) { return this.attrs[key] ?? null; },
      hasAttribute(key) { return Object.hasOwn(this.attrs, key); },
      focus() { r.context.document.activeElement = this; },
      contains(target) {
        for (let ancestor = target; ancestor; ancestor = ancestor.parent) if (ancestor === this) return true;
        return false;
      },
      closest(selectors) {
        const matches = (candidate, selector) => {
          if (selector === '.nav') return candidate === nav;
          if (selector === '.skip') return candidate.attrs.class === 'skip';
          if (selector === 'a[data-on-route]') return candidate.name.startsWith('nav-link-') && candidate.hasAttribute('data-on-route');
          if (selector === 'a[href^="#/"]') return candidate.name.startsWith('nav-link-') && candidate.attrs.href?.startsWith('#/');
          const attribute = selector.match(/^\[([\w-]+)(?:=([^\]]+))?\]$/);
          return !!attribute && candidate.hasAttribute(attribute[1]) && (attribute[2] === undefined || candidate.attrs[attribute[1]] === attribute[2]);
        };
        for (let ancestor = this; ancestor; ancestor = ancestor.parent) {
          if (selectors.split(',').some(selector => matches(ancestor, selector.trim()))) return ancestor;
        }
        return null;
      },
      querySelector(selector) { return selector === 'a[href]' ? this.children.find(child => child.hasAttribute('href')) : null; },
      querySelectorAll() { return []; },
      addEventListener() {}
    };
    return node;
  }

  const navTag = shell.match(/<nav\b[^>]*class="nav"[^>]*>/)?.[0];
  const menuTag = shell.match(/<button\b[^>]*data-action="menu"[^>]*>/)?.[0];
  assert.ok(navTag && menuTag, 'Shell contains the primary navigation and its menu trigger');
  const body = element('body');
  const nav = element('nav', attributes(navTag), body);
  const menu = element('menu', attributes(menuTag), body);
  const modal = element('modal');
  modal.hidden = true;
  nodes.set('.nav', nav);
  nodes.set('[data-action=menu]', menu);
  nodes.set('#modal', modal);
  const find = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element(selector));
    return nodes.get(selector);
  };
  r.context.document.querySelector = find;
  r.context.document.querySelectorAll = () => [];
  r.context.document.body = body;
  r.context.document.activeElement = body;
  r.run("activeRoute='home';navigation()");
  assert.equal(nav.children.length, 6, 'Fixture links come from the app navigation() output');

  function dispatch(type, target, values = {}) {
    const event = {type, target, button: 0, defaultPrevented: false, ...values,
      preventDefault() { this.defaultPrevented = true; }};
    const listeners = r.context.__documentListeners.filter(entry => entry.type === type);
    for (const capture of [true, false]) {
      for (const entry of listeners.filter(entry => entry.capture === capture)) entry.listener(event);
    }
  }

  return {
    r, nav, menu, body,
    get active() { return r.context.document.activeElement; },
    open() { menu.focus(); dispatch('click', menu); },
    click(target) { dispatch('click', target); },
    escape() { dispatch('keydown', r.context.document.activeElement, {key: 'Escape'}); },
    resize(compact) { r.context.__mediaQueries.get('(max-width:950px)').setMatches(compact); },
    icon(name) { return r.run(`icon(${JSON.stringify(name)})`); }
  };
}

const results = [];
function check(name, test) {
  test();
  results.push({name, status: 'pass'});
}

check('Opening the compact menu focuses its first rendered link', () => {
  const f = fixture();
  f.open();
  assert.ok(f.nav.classList.contains('open'));
  assert.equal(f.active, f.nav.children[0], 'Keyboard users enter the revealed menu, before the next Tab');
});

check('Trigger toggles close/menu icon and expanded/accessible label together', () => {
  const f = fixture();
  f.open();
  assert.equal(f.menu.getAttribute('aria-expanded'), 'true');
  assert.equal(f.menu.getAttribute('aria-label'), '메뉴 닫기');
  assert.equal(f.menu.innerHTML, f.icon('close'));
  f.click(f.menu);
  assert.ok(!f.nav.classList.contains('open'));
  assert.equal(f.menu.getAttribute('aria-expanded'), 'false');
  assert.equal(f.menu.getAttribute('aria-label'), '메뉴 열기');
  assert.equal(f.menu.innerHTML, f.icon('menu'));
});

check('Actual Escape handler closes the menu and restores trigger focus', () => {
  const f = fixture();
  f.open();
  f.nav.children[3].focus();
  f.escape();
  assert.ok(!f.nav.classList.contains('open'));
  assert.equal(f.menu.getAttribute('aria-expanded'), 'false');
  assert.equal(f.active, f.menu);
});

check('Actual capture handler preserves inside clicks and closes outside clicks', () => {
  const f = fixture();
  f.open();
  f.click(f.nav); // Non-link space inside the disclosure, without SPA navigation.
  assert.ok(f.nav.classList.contains('open'), 'Inside clicks must not be treated as outside clicks');
  f.click(f.body);
  assert.ok(!f.nav.classList.contains('open'));
  assert.equal(f.menu.getAttribute('aria-expanded'), 'false');
});

check('Compact to desktop to compact clears stale disclosure state', () => {
  const f = fixture();
  f.open();
  f.resize(false);
  assert.ok(!f.nav.classList.contains('open'));
  assert.equal(f.menu.getAttribute('aria-expanded'), 'false');
  f.resize(true);
  assert.ok(!f.nav.classList.contains('open'), 'Folding back must not reopen the old menu');
  assert.equal(f.menu.getAttribute('aria-expanded'), 'false');
});

check('Desktop nav focus returns to the trigger when compact nav becomes hidden', () => {
  const f = fixture();
  f.resize(false);
  f.nav.children[4].focus();
  f.resize(true);
  assert.equal(f.active, f.menu, 'Focus must not remain in navigation hidden by the compact breakpoint');
  assert.ok(!f.nav.classList.contains('open'));
});

check('Shell aria-controls resolves to the primary navigation id', () => {
  const f = fixture();
  const controlledId = f.menu.getAttribute('aria-controls');
  assert.ok(controlledId, 'Disclosure trigger exposes its controlled navigation');
  assert.equal(f.nav.getAttribute('id'), controlledId);
});

check('All six public destinations remain present, with participation terminology', () => {
  const f = fixture();
  assert.deepEqual(f.nav.children.map(link => link.getAttribute('data-on-route')),
    ['about', 'members', 'news', 'policy', 'events', 'resources']);
  assert.equal(f.nav.children[1].textContent, '참여기관');
  assert.match(f.r.run('membersPage()'), /<h1>참여기관<\/h1>/);
});

console.log(JSON.stringify({
  status: 'pass', checks: results.length,
  method: 'Actual app functions and registered click/keydown/media-change handlers in scripts/runtime.cjs, with memory-only DOM/media stubs; no browser geometry assertion.',
  results
}, null, 2));
