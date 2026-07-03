/**
 * Klawford Product Option Updater
 * Ensures all products in Divan Beds & Upholstered Beds have correct Size + Colour options.
 *
 * Usage:
 *   set SHOPIFY_TOKEN=shpat_xxxxxxxxxxxx
 *   node update-products.mjs
 *
 * Or pass token inline:
 *   node update-products.mjs shpat_xxxxxxxxxxxx
 */

const SHOP = '1a1s0b-as.myshopify.com';
const TOKEN = process.argv[2] || process.env.SHOPIFY_TOKEN;

const COLLECTION_HANDLES = ['divan-beds', 'upholstered-beds'];

const SIZES = [
  'Small Single 2FT6',
  'Single 3FT',
  'Small Double 4FT',
  'Double 4FT6',
  'King 5FT',
  'Super King 6FT',
];

const COLOURS = ['Cream', 'Red', 'Grey', 'Black', 'Brown'];

if (!TOKEN) {
  console.error('ERROR: Provide your Admin API token as the first argument or set SHOPIFY_TOKEN env var.');
  process.exit(1);
}

const BASE = `https://${SHOP}/admin/api/2024-10`;

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function getCollectionId(handle) {
  const data = await api('GET', `/custom_collections.json?handle=${handle}&fields=id,title`);
  let col = data.custom_collections?.[0];
  if (!col) {
    const data2 = await api('GET', `/smart_collections.json?handle=${handle}&fields=id,title`);
    col = data2.smart_collections?.[0];
  }
  if (!col) throw new Error(`Collection not found: ${handle}`);
  console.log(`  Collection found: "${col.title}" (${col.id})`);
  return col.id;
}

async function getCollectionProducts(collectionId) {
  const products = [];
  let url = `/collects.json?collection_id=${collectionId}&limit=250`;
  while (url) {
    const data = await api('GET', url);
    for (const c of data.collects) {
      const p = await api('GET', `/products/${c.product_id}.json`);
      products.push(p.product);
    }
    url = null; // Shopify paginates via Link header — simplified for < 250 products
  }
  return products;
}

function normalise(str) {
  return str.trim().toLowerCase();
}

async function updateProduct(product) {
  const name = product.title;
  let options = product.options.map(o => ({ ...o, values: [...o.values] }));
  let variants = product.variants.map(v => ({ ...v }));
  let changed = false;

  // Current option names
  const optionNames = options.map(o => normalise(o.name));

  // ── 1. SIZE option ──────────────────────────────────────────────────
  const sizeIdx = optionNames.findIndex(n => n === 'size' || n === 'bed size' || n === 'bedding size');
  if (sizeIdx === -1) {
    // No size option at all — add it
    if (options.length >= 3) {
      console.log(`  SKIP: "${name}" already has 3 options (Shopify max). Cannot add Size.`);
    } else {
      console.log(`  ADD Size option to: "${name}"`);
      options.push({ name: 'Size', values: SIZES, position: options.length + 1 });
      changed = true;
    }
  } else {
    // Rename if needed
    if (options[sizeIdx].name !== 'Size') {
      console.log(`  RENAME option "${options[sizeIdx].name}" → "Size" on: "${name}"`);
      options[sizeIdx].name = 'Size';
      changed = true;
    }
    // Add any missing size values
    const existing = options[sizeIdx].values.map(normalise);
    for (const s of SIZES) {
      if (!existing.includes(normalise(s))) {
        console.log(`  ADD size value "${s}" to: "${name}"`);
        options[sizeIdx].values.push(s);
        changed = true;
      }
    }
  }

  // ── 2. COLOUR option ────────────────────────────────────────────────
  const colourIdx = optionNames.findIndex(n => n === 'colour' || n === 'color');
  if (colourIdx === -1) {
    if (options.length >= 3) {
      console.log(`  SKIP: "${name}" already has 3 options (Shopify max). Cannot add Colour.`);
    } else {
      console.log(`  ADD Colour option to: "${name}"`);
      options.push({ name: 'Colour', values: COLOURS, position: options.length + 1 });
      changed = true;
    }
  } else {
    // Normalise name to "Colour"
    if (options[colourIdx].name !== 'Colour') {
      console.log(`  RENAME option "${options[colourIdx].name}" → "Colour" on: "${name}"`);
      options[colourIdx].name = 'Colour';
      changed = true;
    }
    // Add any missing colour values
    const existing = options[colourIdx].values.map(normalise);
    for (const c of COLOURS) {
      if (!existing.includes(normalise(c))) {
        console.log(`  ADD colour "${c}" to: "${name}"`);
        options[colourIdx].values.push(c);
        changed = true;
      }
    }
  }

  if (!changed) {
    console.log(`  OK (no changes): "${name}"`);
    return;
  }

  // Build update payload — Shopify requires full options + variants list
  const payload = {
    product: {
      id: product.id,
      options: options.map(o => ({ name: o.name, values: o.values })),
    },
  };

  try {
    const updated = await api('PUT', `/products/${product.id}.json`, payload);
    console.log(`  UPDATED: "${name}" → options: ${updated.product.options.map(o => o.name).join(', ')}`);
  } catch (err) {
    console.error(`  ERROR updating "${name}": ${err.message}`);
  }

  // Throttle to avoid hitting rate limits (2 req/s leaky bucket)
  await new Promise(r => setTimeout(r, 600));
}

async function main() {
  console.log(`\n=== Klawford Product Option Updater ===`);
  console.log(`Store: ${SHOP}\n`);

  for (const handle of COLLECTION_HANDLES) {
    console.log(`\n── Collection: ${handle} ──────────────────`);
    let collectionId;
    try {
      collectionId = await getCollectionId(handle);
    } catch (e) {
      console.error(`  ${e.message}`);
      continue;
    }

    const products = await getCollectionProducts(collectionId);
    console.log(`  ${products.length} product(s) found\n`);

    for (const product of products) {
      await updateProduct(product);
    }
  }

  console.log('\n=== Done ===\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
