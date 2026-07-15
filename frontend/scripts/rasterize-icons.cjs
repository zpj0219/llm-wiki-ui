const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(out, 'logo.svg'));
const maskableSvg = fs.readFileSync(path.join(out, 'logo-maskable.svg'));

async function go() {
  await sharp(svg).resize(512, 512).png().toFile(path.join(out, 'icon-512.png'));
  await sharp(svg).resize(192, 192).png().toFile(path.join(out, 'icon-192.png'));
  await sharp(svg).resize(180, 180).png().toFile(path.join(out, 'apple-touch-icon.png'));
  await sharp(svg).resize(32, 32).png().toFile(path.join(out, 'favicon-32.png'));
  await sharp(svg).resize(16, 16).png().toFile(path.join(out, 'favicon-16.png'));
  await sharp(svg).resize(32, 32).png().toFile(path.join(out, 'favicon.png'));
  await sharp(maskableSvg).resize(512, 512).png().toFile(path.join(out, 'icon-512-maskable.png'));
  console.log('rasterized ok');
}

go().catch((e) => {
  console.error(e);
  process.exit(1);
});
