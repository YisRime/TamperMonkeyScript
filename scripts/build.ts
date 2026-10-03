import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPECS: Record<string, { out: string, entry?: string, header?: string }> = {
  R6Player: { out: 'R6Player.js', entry: 'Entry.ts', header: 'Header.ts' },
  AutoQuiz: { out: 'AutoQuiz.js', entry: 'Entry.ts', header: 'Header.ts' }
};
const PROJECTS = Object.keys(SPECS);
export interface Built { code: string; body: string; inputs: string[]; dest: string }
const posix = (p: string) => p.split('\\').join('/');
const rows = (code: string) => code.split('\n').length;
const say = (subject: string, msg: string) => console.log('✓ ' + subject + '  ' + msg);
const bad = (subject: string, msg: string, detail: string[] = []) => {
  console.error('✗ ' + subject + '  ' + msg);
  detail.forEach(l => console.error('    ' + l));
};

export class Project {
  readonly name: string;
  readonly SRC: string;
  readonly OUT = ROOT;
  private tscOnce: { started: boolean, ok: boolean, out: string } | null = null;
  constructor (name: string) {
    this.name = name;
    this.SRC = path.join(ROOT, name);
  }
  get ARTIFACT () { return SPECS[this.name].out }
  get ENTRY () { return SPECS[this.name].entry || 'index.ts' }
  get HEADER () { return SPECS[this.name].header || 'header.ts' }
  read (name: string) { return fs.readFileSync(path.join(this.SRC, name), 'utf8') }
  modules (rel = ''): string[] {
    return fs.readdirSync(path.join(this.SRC, rel), { withFileTypes: true }).flatMap(e => {
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { return this.modules(p) }
      return p.endsWith('.ts') && !p.endsWith('.d.ts') && !this.SKIP.has(p) ? [p] : [];
    }).sort();
  }
  get SKIP () { return new Set([this.HEADER, this.ENTRY]) }
  version () { return /^\/\/ @version +(\S+)/m.exec(this.header())![1] }
  header () {
    const text = this.read(this.HEADER).replace(/\s+$/, '');
    if (!/^\/\/ ==UserScript==/.test(text)) { throw new Error(this.name + '/' + this.HEADER + ' 不是油猴头注释块') }
    return text;
  }
  sourceView () { return [this.header(), ...this.modules().map(f => this.read(f).replace(/\s+$/, ''))].join('\n') }
  unlinked (inputs: string[]) { return this.modules().filter(f => !inputs.includes(f)) }
  typecheck () {
    if (this.tscOnce) { return this.tscOnce }
    const bin = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
    const r = spawnSync(process.execPath, [bin, '--noEmit', '-p', path.join(ROOT, 'tsconfig.json')], { encoding: 'utf8', cwd: ROOT });
    const out = ((r.stdout || '') + (r.stderr || '')).replace(/\r/g, '').trim();
    this.tscOnce = { started: !r.error, ok: !r.error && r.status === 0, out: r.error ? 'tsc 启动失败：' + r.error.message : out };
    return this.tscOnce;
  }
  typeErrors (t: { out: string }) { return t.out.split('\n').filter(l => /error TS/.test(l)) }
  private async bundleOnce (opts: { entrySource?: string, overrides?: { [name: string]: string } } = {}) {
    const overrides = opts.overrides || {};
    const pinned: { [name: string]: string } = { ...overrides };
    if (opts.entrySource) { pinned[this.ENTRY] = opts.entrySource }
    const banner = this.header();
    const result = await esbuild.build({
      ...(opts.entrySource
        ? { stdin: { contents: opts.entrySource, resolveDir: this.SRC, sourcefile: this.ENTRY, loader: 'ts' as const } }
        : { entryPoints: [path.join(this.SRC, this.ENTRY)] }),
      bundle: true, format: 'iife' as const, target: 'es2022', platform: 'browser' as const,
      charset: 'utf8' as const, logLevel: 'warning' as const, minify: false,
      absWorkingDir: this.SRC, banner: { js: banner }, metafile: true, write: false,
      plugins: Object.keys(overrides).length ? [{
        name: 'in-memory-sources',
        setup: (b: { onResolve: any, onLoad: any }) => {
          b.onResolve({ filter: /.*/ }, (a: any) => {
            const key = posix(path.relative(this.SRC, path.resolve(a.resolveDir, a.path))) + '.ts';
            return pinned[key] ? { path: key, namespace: 'pinned' } : undefined
          });
          b.onLoad({ filter: /.*/, namespace: 'pinned' }, (a: any) => ({ contents: pinned[a.path], loader: 'ts', resolveDir: path.join(this.SRC, path.dirname(a.path)) }));
        }
      }] : []
    });
    const inputs = Object.keys(result.metafile!.inputs).filter(f => f.endsWith('.ts'));
    return { code: result.outputFiles![0].text, banner, inputs };
  }
  async bundle (opts: { entrySource?: string, overrides?: { [name: string]: string } } = {}) {
    const r = await this.bundleOnce(opts);
    return { code: r.code, body: r.code.slice(r.banner.length + 1), inputs: r.inputs };
  }
  async build (): Promise<Built> {
    const types = this.typecheck();
    if (!types.ok) {
      const errs = this.typeErrors(types);
      const detail = errs.length ? errs : ['tsc 没吐一行 error，输出不可信：' + types.out.slice(0, 160)];
      throw new Error(this.ARTIFACT + '  类型检查没过（' + errs.length + ' 条）\n    '
        + detail.slice(0, 12).join('\n    ') + (detail.length > 12 ? '\n    …共 ' + detail.length + ' 条' : ''));
    }
    const r = await this.bundleOnce();
    const missing = this.unlinked(r.inputs);
    if (missing.length) { throw new Error(this.ARTIFACT + '  这些模块没进依赖图，产物里不会有：' + missing.join(' ')) }
    return { code: r.code, body: r.code.slice(r.banner.length + 1), inputs: r.inputs, dest: path.join(this.OUT, this.ARTIFACT) };
  }
  write (built: Built) { fs.writeFileSync(built.dest, built.code) }
  async check (): Promise<number> {
    const built = await this.build();
    const cur = fs.existsSync(built.dest) ? fs.readFileSync(built.dest, 'utf8') : null;
    if (cur === built.code) { say(this.ARTIFACT, '与源码一致'); return 0 }
    const fresh = built.code.split('\n');
    const disk = cur === null ? null : cur.split('\n');
    let i = 0; while (disk && i < Math.min(disk.length, fresh.length) && disk[i] === fresh[i]) i++;
    bad(this.ARTIFACT, '落后：第 ' + (i + 1) + ' 行起不一致（源码 ' + fresh.length + ' 行 / 磁盘 ' + (disk ? disk.length : '缺失') + ' 行）',
      ['源码  ' + (fresh[i] || '').trim().slice(0, 90), '磁盘  ' + ((disk && disk[i]) || '<无>').trim().slice(0, 90)]);
    return 1;
  }
}
const CACHE: Record<string, Project> = {};
export function project (name?: string): Project {
  const want = name || '';
  const key = PROJECTS.find(k => path.resolve(ROOT, want) === path.join(ROOT, k));
  if (!key) { throw new Error('未知项目 ' + (want || '(空)') + '：可选 ' + PROJECTS.join(' | ')) }
  if (!CACHE[key]) { CACHE[key] = new Project(key) }
  return CACHE[key];
}
export function logBuild (p: Project, built: Built) {
  say(p.ARTIFACT, (Buffer.byteLength(built.code) / 1024).toFixed(1) + ' KB · ' + rows(built.code) + ' 行 · '
    + built.inputs.length + ' 模块 + 头注释 · tsc 0 错');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const argv = process.argv.slice(2);
    const checkOnly = argv.includes('--check');
    const names = argv.filter(a => !a.startsWith('--'));
    if (!names.length) {
      bad('用法', 'node scripts/build.ts <' + PROJECTS.join(' | ') + ' | all> [--check]');
      process.exit(2);
    }
    let stale = 0;
    for (const n of names.includes('all') ? PROJECTS : names) {
      const p = project(n);
      if (checkOnly) { stale += await p.check(); continue }
      const built = await p.build();
      p.write(built);
      logBuild(p, built);
    }
    process.exit(stale ? 1 : 0);
  })().catch(e => { bad('build', e.message || String(e)); process.exit(1) });
}
