// scripts/check-release.mjs
// GitHub Actions 用：检测 npm 上 @deepseek-ai/dsh 是否有新版本，
// 若有（或 FORCE=true）则更新 package.json 的 dsh 依赖版本并递增应用版本号。
// 通过 GITHUB_OUTPUT 输出 update / dsh_version，供 workflow 决定是否构建发布。
// 本地手动运行：node scripts/check-release.mjs

import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const current = (pkg.dependencies['@deepseek-ai/dsh'] || '').replace(/^[\^~]/, '');
console.log(`current dsh: ${current}`);

let latest = current;
try {
  const res = await fetch('https://registry.npmjs.org/@deepseek-ai/dsh', {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  latest = data['dist-tags'].latest;
} catch (e) {
  console.error('query npm registry failed:', e.message);
}
console.log(`latest dsh: ${latest}`);

const force = process.env.FORCE === 'true';
const hasUpdate = force || (latest !== current);
console.log(`force: ${force}, update: ${hasUpdate}`);

if (hasUpdate && latest !== current) {
  pkg.dependencies['@deepseek-ai/dsh'] = latest;
}
if (hasUpdate) {
  const parts = pkg.version.split('.');
  parts[2] = String(Number(parts[2]) + 1);
  pkg.version = parts.join('.');
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`bumped app version to ${pkg.version}`);
}

const ghOutput = process.env.GITHUB_OUTPUT;
if (ghOutput) {
  appendFileSync(ghOutput, `update=${hasUpdate ? 'true' : 'false'}\n`);
  appendFileSync(ghOutput, `dsh_version=${latest}\n`);
}
