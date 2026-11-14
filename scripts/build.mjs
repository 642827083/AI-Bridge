import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync } from 'fflate';
import { Resvg } from '@resvg/resvg-js';
import { resources } from './bundle.mjs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const manifest = JSON.parse(readFileSync('src/mnaddon.json', 'utf8'));
if ([manifest.version, lock.version, lock.packages[''].version].some(version => version !== pkg.version)) throw new Error('三处版本不一致');
const release = process.argv.includes('--release');
if (release && pkg.version === '0.0.0') throw new Error('请等待用户测试成功并指定正式版本号');
const output = release ? `Ai Bridge-v${pkg.version}.mnaddon` : 'Ai Bridge Test.mnaddon';
if (release && existsSync(output)) throw new Error('正式包已存在，禁止覆盖');
const resource = await resources();
mkdirSync('src/web-dist', { recursive: true });
const artwork = readFileSync('assets/icon.png').toString('base64');
// 保留用户原图，只在构建时按图形边界居中缩放为工具栏图标。
const iconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="120 160 948 948"><image width="1254" height="1254" href="data:image/png;base64,' + artwork + '"/></svg>';
const icon = new Resvg(iconSVG).render().asPng();
writeFileSync('src/icon.png', icon);
writeFileSync('src/web-dist/Resources.js', 'var AIBResources = ' + JSON.stringify({ deepseek: resource.deepseek, doubao: resource.doubao, gpt: resource.gpt, gemini: resource.gemini, settingsHTML: resource.settingsHTML }) + ';\n');
writeFileSync('src/web-dist/MediaReader.html', resource.mediaHTML);
mkdirSync('src/web-dist/pet-motion', { recursive: true });
writeFileSync('src/web-dist/pet-motion/index.html', resource.petMotionHTML);
writeFileSync('src/web-dist/pet-motion/player.js', resource.petMotionPlayer);
writeFileSync('src/web-dist/fflate-LICENSE.txt', readFileSync('node_modules/fflate/LICENSE'));
mkdirSync('src/web-dist/pet-builtin', { recursive: true });
writeFileSync('src/web-dist/pet-builtin/DSniang1.png', readFileSync('assets/pet/DSniang1-256.png'));
for (const file of ['SOURCE.md', 'UPSTREAM-PROVENANCE.md']) writeFileSync('src/web-dist/pet-builtin/' + file, readFileSync('assets/pet/' + file));
const files = {};
function collect(directory, prefix = '') {
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const name = prefix + item.name, path = directory + '/' + item.name;
    if (item.isDirectory()) collect(path, name + '/'); else files[name] = new Uint8Array(readFileSync(path));
  }
}
collect('src');
for (const name of ['main.js', 'mnaddon.json', 'icon.png', 'web-dist/Resources.js', manifest.panel, 'web-dist/pet-motion/index.html', 'web-dist/pet-motion/player.js', 'web-dist/pet-builtin/DSniang1.png', 'web-dist/pet-builtin/SOURCE.md', 'web-dist/pet-builtin/UPSTREAM-PROVENANCE.md']) if (!files[name]) throw new Error('安装包缺少：' + name);
for (const match of readFileSync('src/main.js', 'utf8').matchAll(/JSB\.require\('([^']+)'\)/g)) if (!files[match[1] + '.js']) throw new Error('入口引用缺失：' + match[1]);
const archive = zipSync(files, { level: 9 }); writeFileSync(output, archive);
const unpacked = unzipSync(new Uint8Array(readFileSync(output)));
if (Object.keys(unpacked).length !== Object.keys(files).length) throw new Error('安装包文件数量不符');
for (const [name, bytes] of Object.entries(files)) if (!unpacked[name] || !Buffer.from(bytes).equals(Buffer.from(unpacked[name]))) throw new Error('安装包与源码不一致：' + name);
console.log(JSON.stringify({ output, version: pkg.version, files: Object.keys(unpacked), bytes: archive.length,
  sha256: createHash('sha256').update(archive).digest('hex') }, null, 2));
