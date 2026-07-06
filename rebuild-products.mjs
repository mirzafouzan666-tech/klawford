/**
 * Klawford Product Rebuilder v4
 * Gives each product exactly: Size (6 UK sizes) x Colour (5 colours) = 30 variants.
 * Handles the "Title: Default Title" reset state that Shopify creates when all variants are deleted.
 * Run: node rebuild-products.mjs
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const STORE = '1a1s0b-as.myshopify.com';
const LOCATION_ID = 'gid://shopify/Location/108677857609';

const SIZES = [
  { label: 'Small Single 2FT6', priceAdd: 0 },
  { label: 'Single 3FT',        priceAdd: 0 },
  { label: 'Small Double 4FT',  priceAdd: 50 },
  { label: 'Double 4FT6',       priceAdd: 50 },
  { label: 'King 5FT',          priceAdd: 70 },
  { label: 'Super King 6FT',    priceAdd: 100 },
];
const COLOURS = ['Cream', 'Red', 'Grey', 'Black', 'Brown'];
const BASE_PRICE = '199.00';
const TARGET_SIZE_NAMES = new Set(SIZES.map(s => s.label.toLowerCase()));
const TARGET_COLOUR_NAMES = new Set(COLOURS.map(c => c.toLowerCase()));

function gql(query) {
  const tmp = join(tmpdir(), `kl_${Date.now()}.graphql`);
  writeFileSync(tmp, query, 'utf8');
  try {
    const out = execSync(
      `shopify store execute --store ${STORE} --allow-mutations --query-file "${tmp}"`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    const match = out.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch(e) {
    const raw = e.stdout || e.stderr || '';
    // Extract just the meaningful error message from the CLI box
    const lines = raw.split('\n').filter(l => l.trim() && !l.includes('─') && !l.includes('│  ') && !l.includes('╰') && !l.includes('╭'));
    console.log('  API error:', lines.slice(0, 3).join(' | ').trim().slice(0, 200));
    return null;
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getProduct(productId) {
  const d = gql(`{
    product(id: "${productId}") {
      id title
      options { id name position optionValues { id name } }
      variants(first: 250) {
        edges { node { id price compareAtPrice selectedOptions { name value } } }
      }
    }
  }`);
  return d?.product || null;
}

async function deleteVariantsById(productId, ids) {
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 10) {
    const batch = ids.slice(i, i + 10).map(id => `"${id}"`).join(', ');
    const r = gql(`mutation {
      productVariantsBulkDelete(productId: "${productId}", variantsIds: [${batch}]) {
        userErrors { field message }
      }
    }`);
    const errs = r?.productVariantsBulkDelete?.userErrors;
    if (errs?.length) console.log('  Delete warning:', errs[0].message);
    await sleep(400);
  }
}

async function ensureSizeOption(productId, currentOptions) {
  const sizeOpt = currentOptions.find(o => o.name.toLowerCase() === 'size');
  const titleOpt = currentOptions.find(o => o.name.toLowerCase() === 'title');

  if (sizeOpt) {
    // Add missing size values (don't delete anything yet)
    const existing = new Set(sizeOpt.optionValues.map(v => v.label?.toLowerCase() || v.name.toLowerCase()));
    const toAdd = SIZES.filter(s => !existing.has(s.label.toLowerCase())).map(s => `{ name: "${s.label}" }`);
    if (toAdd.length) {
      const r = gql(`mutation {
        productOptionUpdate(
          productId: "${productId}"
          option: { id: "${sizeOpt.id}", name: "Size" }
          optionValuesToAdd: [${toAdd.join(', ')}]
          variantStrategy: LEAVE_AS_IS
        ) { product { id } userErrors { field message } }
      }`);
      const errs = r?.productOptionUpdate?.userErrors;
      if (errs?.length) console.log('  Size add warning:', errs[0].message);
    }
    return true;
  }

  if (titleOpt) {
    // Rename "Title" → "Size" and add size values
    const toAdd = SIZES.map(s => `{ name: "${s.label}" }`).join(', ');
    const r = gql(`mutation {
      productOptionUpdate(
        productId: "${productId}"
        option: { id: "${titleOpt.id}", name: "Size" }
        optionValuesToAdd: [${toAdd}]
        variantStrategy: LEAVE_AS_IS
      ) { product { options { id name optionValues { id name } } } userErrors { field message } }
    }`);
    const errs = r?.productOptionUpdate?.userErrors;
    if (errs?.length) { console.log('  Size create error:', errs[0].message); return false; }
    console.log('  Size option ready');
    return true;
  }

  console.log('  No Size or Title option found - cannot proceed');
  return false;
}

async function ensureColourOption(productId, currentOptions) {
  const colourOpt = currentOptions.find(o => ['colour', 'color'].includes(o.name.toLowerCase()));

  if (colourOpt) {
    // Add missing colour values
    const existing = new Set(colourOpt.optionValues.map(v => v.name.toLowerCase()));
    const toAdd = COLOURS.filter(c => !existing.has(c.toLowerCase())).map(c => `{ name: "${c}" }`);
    if (toAdd.length) {
      gql(`mutation {
        productOptionUpdate(
          productId: "${productId}"
          option: { id: "${colourOpt.id}", name: "Colour" }
          optionValuesToAdd: [${toAdd.join(', ')}]
          variantStrategy: LEAVE_AS_IS
        ) { product { id } userErrors { field message } }
      }`);
    }
    return true;
  }

  // Create Colour option from scratch using productOptionsCreate
  const colourValues = COLOURS.map(c => `{ name: "${c}" }`).join(', ');
  const r = gql(`mutation {
    productOptionsCreate(
      productId: "${productId}"
      options: [{ name: "Colour", values: [${colourValues}] }]
      variantStrategy: LEAVE_AS_IS
    ) {
      product { options { id name optionValues { id name } } }
      userErrors { field message }
    }
  }`);
  const errs = r?.productOptionsCreate?.userErrors;
  if (errs?.length) { console.log('  Colour create error:', errs[0].message); return false; }
  if (!r) { console.log('  Colour create failed (API error)'); return false; }
  console.log('  Colour option created');
  return true;
}

async function createMissingVariants(productId, product) {
  const sizeOpt   = product.options.find(o => o.name.toLowerCase() === 'size');
  const colourOpt = product.options.find(o => ['colour','color'].includes(o.name.toLowerCase()));
  if (!sizeOpt || !colourOpt) { console.log('  Cannot create variants: missing options'); return 0; }

  // Find which size×colour combos already exist
  const existing = new Set();
  for (const e of product.variants.edges) {
    const size   = e.node.selectedOptions.find(o => o.name.toLowerCase() === 'size')?.value;
    const colour = e.node.selectedOptions.find(o => ['colour','color'].includes(o.name.toLowerCase()))?.value;
    if (size && colour) existing.add(`${size}|${colour}`);
  }

  // Build the base price from first real (non-Default-Title) variant
  const realVariant = product.variants.edges.find(e =>
    e.node.selectedOptions.every(o => o.value !== 'Default Title')
  );
  const base = parseFloat(realVariant?.node.price || BASE_PRICE);
  const cat  = realVariant?.node.compareAtPrice ? parseFloat(realVariant.node.compareAtPrice) : null;

  const inputs = [];
  for (const s of SIZES) {
    for (const c of COLOURS) {
      if (!existing.has(`${s.label}|${c}`)) {
        const price = (base + s.priceAdd).toFixed(2);
        inputs.push(`{
          optionValues: [
            { optionName: "Size", name: "${s.label}" }
            { optionName: "Colour", name: "${c}" }
          ]
          price: "${price}"
          ${cat ? `compareAtPrice: "${(cat + s.priceAdd).toFixed(2)}"` : ''}
          inventoryQuantities: { locationId: "${LOCATION_ID}", availableQuantity: 10 }
          inventoryItem: { tracked: true }
        }`);
      }
    }
  }

  if (!inputs.length) { console.log('  All 30 variants already exist'); return 30; }

  let total = 0;
  for (let i = 0; i < inputs.length; i += 5) {
    const batch = inputs.slice(i, i + 5).join(',\n');
    const r = gql(`mutation {
      productVariantsBulkCreate(productId: "${productId}", variants: [${batch}]) {
        productVariants { id }
        userErrors { field message }
      }
    }`);
    const errs = r?.productVariantsBulkCreate?.userErrors;
    if (errs?.length) console.log('  Variant error:', errs[0].message);
    else total += r?.productVariantsBulkCreate?.productVariants?.length || 0;
    await sleep(500);
  }
  console.log(`  Created ${total} new variants`);
  return total;
}

async function cleanupDummyAndOldValues(productId) {
  const product = await getProduct(productId);
  if (!product) return;

  const sizeOpt   = product.options.find(o => o.name.toLowerCase() === 'size');
  const colourOpt = product.options.find(o => ['colour','color'].includes(o.name.toLowerCase()));

  // Delete any variant that uses a non-target Size or non-target Colour value
  const dummyIds = product.variants.edges
    .map(e => e.node)
    .filter(v => {
      const size   = v.selectedOptions.find(o => o.name.toLowerCase() === 'size')?.value;
      const colour = v.selectedOptions.find(o => ['colour','color'].includes(o.name.toLowerCase()))?.value;
      return !TARGET_SIZE_NAMES.has(size?.toLowerCase()) || !TARGET_COLOUR_NAMES.has(colour?.toLowerCase());
    })
    .map(v => v.id);

  if (dummyIds.length) {
    console.log(`  Removing ${dummyIds.length} dummy/old variant(s)...`);
    await deleteVariantsById(productId, dummyIds);
    await sleep(600);
  }

  // Remove "Default Title" from Size option (now orphaned)
  if (sizeOpt) {
    const defaultTitleVal = sizeOpt.optionValues.find(v => v.name === 'Default Title');
    if (defaultTitleVal) {
      const r = gql(`mutation {
        productOptionUpdate(
          productId: "${productId}"
          option: { id: "${sizeOpt.id}", name: "Size" }
          optionValuesToDelete: ["${defaultTitleVal.id}"]
          variantStrategy: LEAVE_AS_IS
        ) { product { id } userErrors { field message } }
      }`);
      const errs = r?.productOptionUpdate?.userErrors;
      if (!errs?.length) console.log('  Removed "Default Title" from Size');
      else console.log('  Could not remove Default Title:', errs[0].message);
    }
  }

  // Remove old non-target Colour values (old fabric names)
  if (colourOpt) {
    const oldColours = colourOpt.optionValues.filter(v => !TARGET_COLOUR_NAMES.has(v.name.toLowerCase()));
    if (oldColours.length) {
      const toDelete = oldColours.map(v => `"${v.id}"`).join(', ');
      gql(`mutation {
        productOptionUpdate(
          productId: "${productId}"
          option: { id: "${colourOpt.id}", name: "Colour" }
          optionValuesToDelete: [${toDelete}]
          variantStrategy: LEAVE_AS_IS
        ) { product { id } userErrors { field message } }
      }`);
    }
  }

  // Remove old non-target Size values (price-suffixed sizes)
  if (sizeOpt) {
    const p2 = await getProduct(productId);
    const sizeOpt2 = p2?.options.find(o => o.name.toLowerCase() === 'size');
    if (sizeOpt2) {
      const oldSizes = sizeOpt2.optionValues.filter(v => !TARGET_SIZE_NAMES.has(v.name.toLowerCase()));
      if (oldSizes.length) {
        const toDelete = oldSizes.map(v => `"${v.id}"`).join(', ');
        gql(`mutation {
          productOptionUpdate(
            productId: "${productId}"
            option: { id: "${sizeOpt2.id}", name: "Size" }
            optionValuesToDelete: [${toDelete}]
            variantStrategy: LEAVE_AS_IS
          ) { product { id } userErrors { field message } }
        }`);
      }
    }
  }
}

async function processProduct(productId) {
  const product = await getProduct(productId);
  if (!product) { console.log('  Not found'); return; }

  console.log(`\n── ${product.title}`);
  console.log(`   Options: ${product.options.map(o => o.name).join(', ') || 'none'}`);
  console.log(`   Variants: ${product.variants.edges.length}`);

  // Step 1: Ensure Size option exists with all 6 values
  const ok1 = await ensureSizeOption(productId, product.options);
  if (!ok1) return;
  await sleep(600);

  // Step 2: Ensure Colour option exists with all 5 values
  const product2 = await getProduct(productId);
  const ok2 = await ensureColourOption(productId, product2.options);
  if (!ok2) return;
  await sleep(700);

  // Step 3: Create missing variants (skip any Size×Colour combos that already exist)
  const product3 = await getProduct(productId);
  const created = await createMissingVariants(productId, product3);
  await sleep(600);

  // Step 4: Clean up dummy/old variants and old option values
  await cleanupDummyAndOldValues(productId);
  console.log('  Done ✓');
}

async function main() {
  console.log('\n=== Klawford Product Rebuilder v4 ===\n');

  const DIVAN_IDS = [
    'gid://shopify/Product/10243460497737', // Panel Lines Divan
    'gid://shopify/Product/10242939027785', // Cube Divan
  ];

  const upholData = gql(`{
    collection(id: "gid://shopify/Collection/692571963721") {
      products(first: 50) { edges { node { id title } } }
    }
  }`);

  const allIds = [...DIVAN_IDS];
  for (const e of upholData?.collection?.products?.edges || []) {
    if (!allIds.includes(e.node.id)) {
      console.log(`  Upholstered: ${e.node.title}`);
      allIds.push(e.node.id);
    }
  }

  for (const id of allIds) {
    await processProduct(id);
    await sleep(800);
  }

  console.log('\n=== All done! ===\n');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
