/**
 * upload-panel-bed-images.mjs
 *
 * 1. Deletes ALL existing images from the Panel Line Divan Bed product
 * 2. Uploads every colour photo from your local folders
 * 3. Assigns the first image of each colour to the matching colour variant
 *    so clicking Black / Brown / Cream / Grey / Red shows the right bed photo
 *
 * Usage:
 *   node upload-panel-bed-images.mjs YOUR_ADMIN_API_TOKEN
 *
 * How to get your token (2 min):
 *   Shopify Admin → Settings → Apps and sales channels
 *   → Develop apps → Create an app → Configure Admin API scopes
 *   → tick write_products + read_products → Save → Install app
 *   → Reveal token once → copy it (starts with shpat_…)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';

const STORE       = '1a1s0b-as.myshopify.com';
const API_VERSION = '2024-01';
const TOKEN       = process.argv[2];

const BASE_PATH = 'C:/Users/EliteBook/Desktop/BEDS FOR KLAWFORD/PANEL LINE DIVAN BED/DIFFERENT COLOURS';

const COLOURS = {
  BLACK: 'Black',
  BROWN: 'Brown',
  CREAM: 'Cream',
  GREY:  'Grey',
  RED:   'Red',
};

// ─── helpers ────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const url = `https://${STORE}/admin/api/${API_VERSION}/${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── main ───────────────────────────────────────────────────────────────────

if (!TOKEN) {
  console.error('\n  Usage: node upload-panel-bed-images.mjs YOUR_ADMIN_API_TOKEN\n');
  process.exit(1);
}

// 1. Find the product
console.log('\n🔍  Finding Panel Line Divan Bed product…');
const { products } = await api('products.json?limit=250');
const product =
  products?.find(p =>
    p.title.toLowerCase().includes('panel') &&
    p.title.toLowerCase().includes('divan')
  ) ||
  products?.find(p => p.title.toLowerCase().includes('panel'));

if (!product) {
  console.error('\n  ❌  Could not find a product with "Panel Divan" in the title.');
  console.error('  Tip: open Shopify admin → Products and copy the exact product title,');
  console.error('  then update the search condition near the top of this script.\n');
  process.exit(1);
}

console.log(`  ✅  Found: "${product.title}" (ID ${product.id})`);
console.log(`  Variants: ${product.variants.map(v => v.title).join(' | ')}\n`);

// 2. Delete ALL existing images
console.log('🗑️   Removing all existing product images…');
const { images: existingImages } = await api(`products/${product.id}/images.json`);

if (existingImages?.length) {
  for (const img of existingImages) {
    await api(`products/${product.id}/images/${img.id}.json`, { method: 'DELETE' });
    process.stdout.write('  Deleted image ' + img.id + '\n');
    await sleep(200);
  }
  console.log(`  ✅  Removed ${existingImages.length} old image(s)\n`);
} else {
  console.log('  No existing images found.\n');
}

// 3. Upload new colour images and assign to variants
for (const [folder, colourLabel] of Object.entries(COLOURS)) {
  const dir = join(BASE_PATH, folder);

  if (!existsSync(dir)) {
    console.warn(`  ⚠️  Folder not found, skipping: ${dir}`);
    continue;
  }

  const files = readdirSync(dir)
    .filter(f => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(f).toLowerCase()))
    .sort();

  if (!files.length) {
    console.warn(`  ⚠️  No images in ${folder}, skipping.`);
    continue;
  }

  console.log(`📁  ${folder} — uploading ${files.length} image(s)`);

  let firstImageId = null;

  for (let i = 0; i < files.length; i++) {
    const filePath = join(dir, files[i]);
    const base64   = readFileSync(filePath).toString('base64');
    const filename = `panel-bed-${colourLabel.toLowerCase()}-${i + 1}.jpg`;

    process.stdout.write(`  [${i + 1}/${files.length}] ${filename} … `);

    const { image, errors } = await api(`products/${product.id}/images.json`, {
      method: 'POST',
      body: JSON.stringify({
        image: {
          attachment: base64,
          filename,
          alt: `Panel Line Divan Bed – ${colourLabel}`,
        },
      }),
    });

    if (errors) {
      console.log(`❌  ${JSON.stringify(errors)}`);
    } else if (image?.id) {
      console.log(`✅  ID ${image.id}`);
      if (!firstImageId) firstImageId = image.id;
    } else {
      console.log('⚠️  Unexpected response');
    }

    await sleep(400);
  }

  // Assign first image of this colour to the matching variant
  const variant = product.variants.find(v =>
    [v.option1, v.option2, v.option3]
      .filter(Boolean)
      .some(o => o.toLowerCase() === colourLabel.toLowerCase())
  );

  if (variant && firstImageId) {
    const { errors: vErr } = await api(`variants/${variant.id}.json`, {
      method: 'PUT',
      body: JSON.stringify({ variant: { id: variant.id, image_id: firstImageId } }),
    });
    if (vErr) {
      console.log(`  ❌  Variant link failed: ${JSON.stringify(vErr)}`);
    } else {
      console.log(`  🎨  "${colourLabel}" variant linked to first image\n`);
    }
  } else if (!variant) {
    console.log(`  ⚠️  No variant matched "${colourLabel}" — images uploaded but not linked.`);
    console.log(`     Make sure your product has a colour variant option value that exactly says: ${colourLabel}\n`);
  }
}

console.log('✅  All done! Refresh your Shopify product page.\n');
