import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { optimizeToolbarPNG } from '../scripts/toolbar-png.mjs';

const decoded = png => new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><image width="60" height="60" href="data:image/png;base64,' + Buffer.from(png).toString('base64') + '"/></svg>').render().pixels;
for (const name of ['rotate-cw', 'menu', 'x']) {
  test(name + ' 图标压缩后每个像素及透明度一致，尺寸不变，文件更小', () => {
    const svg = readFileSync('assets/toolbar/' + name + '.svg', 'utf8').replace('currentColor', '#555555');
    const original = new Resvg(svg, { fitTo: { mode: 'width', value: 60 } }).render().asPng(), optimized = optimizeToolbarPNG(original);
    assert.ok(optimized.length < original.length);
    assert.equal(optimized.readUInt32BE(16), 60); assert.equal(optimized.readUInt32BE(20), 60);
    assert.deepEqual(decoded(optimized), decoded(original));
  });
}
