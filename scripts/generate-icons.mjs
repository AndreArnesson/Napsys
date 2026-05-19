/**
 * Run once: node scripts/generate-icons.mjs
 * Generates PNG icons for PWA from public/icon.svg using @resvg/resvg-js (auto-installed)
 * If that fails, falls back to instructions for manual generation.
 */
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const publicDir = join(root, 'public');
const iconsDir = join(publicDir, 'icons');

if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = join(publicDir, 'icon.svg');

async function generate() {
  let Resvg;
  try {
    ({ Resvg } = await import('@resvg/resvg-js'));
  } catch {
    console.log('Installing @resvg/resvg-js...');
    execSync('npm install --no-save @resvg/resvg-js', { cwd: root, stdio: 'inherit' });
    ({ Resvg } = await import('@resvg/resvg-js'));
  }

  const svg = readFileSync(svgPath);

  for (const size of sizes) {
    const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
    const png = resvg.render().asPng();
    const out = join(iconsDir, `icon-${size}x${size}.png`);
    writeFileSync(out, png);
    console.log(`✓ ${out}`);
  }

  // Apple touch icon (180x180)
  const resvg180 = new Resvg(svg, { fitTo: { mode: 'width', value: 180 } });
  const png180 = resvg180.render().asPng();
  writeFileSync(join(publicDir, 'apple-touch-icon.png'), png180);
  console.log('✓ public/apple-touch-icon.png');

  console.log('\nDone! All icons generated.');
}

generate().catch(err => {
  console.error('Icon generation failed:', err.message);
  console.log('\nManual alternative: visit https://realfavicongenerator.net and upload public/icon.svg');
});
