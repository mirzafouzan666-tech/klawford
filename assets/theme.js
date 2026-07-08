/* ============================================================
   KLAWFORD THEME — theme.js
   ============================================================ */

(function () {
  'use strict';

  /* ---- Utilities ------------------------------------------ */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  /* ---- Mobile Menu ---------------------------------------- */
  const mobileMenu     = $('#mobile-menu');
  const mobileOverlay  = $('#mobile-overlay');
  const mobileOpenBtn  = $('#mobile-menu-open');
  const mobileCloseBtn = $('#mobile-menu-close');

  function openMobileMenu() {
    mobileMenu?.classList.add('is-open');
    mobileOverlay?.classList.add('is-visible');
    document.body.style.overflow = 'hidden';
  }
  function closeMobileMenu() {
    mobileMenu?.classList.remove('is-open');
    mobileOverlay?.classList.remove('is-visible');
    document.body.style.overflow = '';
  }

  mobileOpenBtn?.addEventListener('click', openMobileMenu);
  mobileCloseBtn?.addEventListener('click', closeMobileMenu);
  mobileOverlay?.addEventListener('click', closeMobileMenu);

  /* ---- Search Overlay ------------------------------------- */
  const searchOverlay  = $('#search-overlay');
  const searchInput    = $('#search-input');
  const searchOpenBtn  = $('#search-open');
  const searchClose    = $('#search-close');
  const searchBg       = $('#search-bg');

  function openSearch() {
    searchOverlay?.classList.add('is-open');
    searchOverlay?.setAttribute('aria-hidden', 'false');
    setTimeout(() => searchInput?.focus(), 280);
  }
  function closeSearch() {
    searchOverlay?.classList.remove('is-open');
    searchOverlay?.setAttribute('aria-hidden', 'true');
  }

  searchOpenBtn?.addEventListener('click', openSearch);
  searchClose?.addEventListener('click', closeSearch);
  searchBg?.addEventListener('click', closeSearch);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeSearch(); closeCart(); } });

  /* ---- Cart Drawer ---------------------------------------- */
  const cartDrawer     = $('#cart-drawer');
  const cartOverlay    = $('#cart-overlay');
  const cartOpenBtns   = $$('[data-cart-open]');
  const cartClose      = $('#cart-close');

  function openCart() {
    cartDrawer?.classList.add('is-open');
    cartDrawer?.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    fetchCart();
  }
  function closeCart() {
    cartDrawer?.classList.remove('is-open');
    cartDrawer?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  cartOpenBtns.forEach(btn => btn.addEventListener('click', openCart));
  cartClose?.addEventListener('click', closeCart);
  cartOverlay?.addEventListener('click', closeCart);

  /* Cart AJAX ------------------------------------------------ */
  async function fetchCart() {
    try {
      const res  = await fetch('/cart.js');
      const data = await res.json();
      updateCartUI(data);
    } catch (err) {
      console.warn('Cart fetch failed', err);
    }
  }

  function updateCartUI(cart) {
    // Update count badges
    $$('.header-cart-count').forEach(el => {
      el.textContent = cart.item_count;
      el.style.display = cart.item_count > 0 ? 'flex' : 'none';
    });
    const countDrawer = $('#cart-count-drawer');
    if (countDrawer) countDrawer.textContent = cart.item_count;

    // Update subtotal
    const subtotal = $('#cart-subtotal');
    if (subtotal) subtotal.textContent = formatMoney(cart.total_price);

    // Rebuild items in drawer
    const body = $('#cart-drawer-body');
    if (!body) return;
    if (cart.item_count === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <p>Your cart is empty</p>
          <a href="/collections/all" class="btn btn--primary btn--sm">Continue Shopping</a>
        </div>`;
      return;
    }
    body.innerHTML = cart.items.map(item => `
      <div class="cart-item" data-key="${item.key}">
        <a href="${item.url}" class="cart-item__img">
          <img src="${item.featured_image?.url ? item.featured_image.url.replace(/(\.\w+)$/, '_120x120$1') : ''}" alt="${escapeHtml(item.title)}" width="80" height="80" loading="lazy">
        </a>
        <div class="cart-item__details">
          <a href="${item.url}" class="cart-item__name">${escapeHtml(item.product_title)}</a>
          ${item.variant_title && item.variant_title !== 'Default Title' ? `<p class="cart-item__variant">${escapeHtml(item.variant_title)}</p>` : ''}
          <div class="cart-item__row">
            <div class="cart-qty">
              <button class="cart-qty__btn" data-action="decrease" data-key="${item.key}">&#8722;</button>
              <span class="cart-qty__val">${item.quantity}</span>
              <button class="cart-qty__btn" data-action="increase" data-key="${item.key}">&#43;</button>
            </div>
            <span class="cart-item__price">${formatMoney(item.final_line_price)}</span>
          </div>
        </div>
        <button class="cart-item__remove" data-key="${item.key}" aria-label="Remove">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 2L2 10M2 2l8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>`).join('');

    bindCartEvents();
  }

  function bindCartEvents() {
    $$('.cart-qty__btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key    = btn.dataset.key;
        const action = btn.dataset.action;
        const item   = btn.closest('.cart-item');
        const valEl  = item?.querySelector('.cart-qty__val');
        let qty = parseInt(valEl?.textContent || '1', 10);
        qty = action === 'increase' ? qty + 1 : Math.max(0, qty - 1);
        await updateCartItem(key, qty);
      });
    });
    $$('.cart-item__remove').forEach(btn => {
      btn.addEventListener('click', async () => {
        await updateCartItem(btn.dataset.key, 0);
      });
    });
  }

  async function updateCartItem(key, quantity) {
    try {
      const res  = await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key, quantity }),
      });
      const data = await res.json();
      updateCartUI(data);
    } catch (err) {
      console.warn('Cart update failed', err);
    }
  }

  async function addToCart(variantId, quantity = 1) {
    try {
      const res  = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: variantId, quantity }),
      });
      if (!res.ok) throw new Error('Add to cart failed');
      openCart();
    } catch (err) {
      console.warn('Add to cart failed', err);
    }
  }

  // Expose globally so section scripts can call it
  window.KlawfordTheme = { addToCart, openCart, closeCart, fetchCart };

  /* ---- Add-to-cart buttons on product page ---------------- */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    e.preventDefault();
    // Read variant ID from data attr, or fall back to the form's hidden #id input
    const form = btn.closest('form');
    const variantId = btn.dataset.variantId
      || btn.dataset.addToCart
      || form?.querySelector('[name="id"]')?.value;
    const qty = parseInt(btn.dataset.qty || '1', 10);
    if (variantId) {
      btn.disabled = true;
      // Preserve the SVG icon — only swap the label text node
      const label = btn.querySelector('.atc-label');
      if (label) label.textContent = 'Adding…';
      else btn.lastChild.textContent = ' Adding…';
      addToCart(variantId, qty).finally(() => {
        btn.disabled = false;
        if (label) label.textContent = 'Add to Basket';
        else btn.lastChild.textContent = ' Add to Basket';
        // refresh cart count badge
        fetchCart();
      });
    }
  });

  /* ---- Product page: variant selector --------------------- */
  $$('.option-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('.product-option__values');
      group?.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateSelectedVariant();
    });
  });

  function updateSelectedVariant() {
    const selections = {};
    $$('.product-option').forEach(opt => {
      const name   = opt.dataset.option;
      const active = opt.querySelector('.option-btn.active');
      if (name && active) selections[name] = active.dataset.value;
    });
    const addBtn = $('[data-add-to-cart]');
    if (!addBtn) return;
    const form = addBtn.closest('form');
    const variantInput = form?.querySelector('[name="id"]');
    const variants = JSON.parse(form?.dataset.variants || '[]');
    const match = variants.find(v =>
      v.options.every((o, i) => {
        const key = `option${i + 1}`;
        return Object.values(selections)[i] === o || v[key] === Object.values(selections)[i];
      })
    );
    if (match) {
      if (variantInput) variantInput.value = match.id;
      addBtn.dataset.variantId = match.id;
      const priceEl = $('.product-info__price');
      if (priceEl && match.price) priceEl.textContent = formatMoney(match.price);
    }
  }

  /* ---- Product gallery thumbnails ------------------------- */
  $$('.product-gallery__thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const main = $('.product-gallery__main img');
      const src  = thumb.dataset.src;
      if (main && src) { main.src = src; }
      $$('.product-gallery__thumb').forEach(t => t.classList.remove('active'));
      thumb.classList.add('active');
    });
  });

  /* ---- FAQ Accordion -------------------------------------- */
  $$('.faq-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.faq-item');
      const isOpen = item.classList.contains('is-open');
      $$('.faq-item.is-open').forEach(open => open.classList.remove('is-open'));
      if (!isOpen) item.classList.add('is-open');
    });
  });

  /* ---- Promo countdown ------------------------------------ */
  function startCountdown() {
    const els = $$('.promo-countdown__time');
    if (!els.length) return;
    const byUnit = {};
    els.forEach(el => { byUnit[el.dataset.unit] = el; });
    let target = parseInt(els[0].dataset.end || '0', 10) * 1000;
    if (!target) {
      // Default: midnight today
      const now = new Date();
      target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0).getTime();
    }
    function tick() {
      const diff = target - Date.now();
      const h = diff <= 0 ? 0 : Math.floor(diff / 3600000);
      const m = diff <= 0 ? 0 : Math.floor((diff % 3600000) / 60000);
      const s = diff <= 0 ? 0 : Math.floor((diff % 60000) / 1000);
      if (byUnit.h) byUnit.h.textContent = `${h} h`;
      if (byUnit.m) byUnit.m.textContent = `${m} m`;
      if (byUnit.s) byUnit.s.textContent = `${s} s`;
      if (diff > 0) requestAnimationFrame(() => setTimeout(tick, 1000));
    }
    tick();
  }
  startCountdown();

  /* ---- Promo code copy --------------------------------------- */
  const promoCopyBtn = document.getElementById('promo-code-copy');
  if (promoCopyBtn) {
    promoCopyBtn.addEventListener('click', () => {
      const code = promoCopyBtn.dataset.code || '';
      if (navigator.clipboard) navigator.clipboard.writeText(code);
    });
  }

  /* ---- Review carousel arrows ------------------------------ */
  $$('[data-review-carousel]').forEach(carousel => {
    const track = carousel.querySelector('[data-review-track]');
    const prev  = carousel.querySelector('[data-review-prev]');
    const next  = carousel.querySelector('[data-review-next]');
    if (!track) return;
    const scrollAmount = () => (track.querySelector('.review-card')?.offsetWidth || 260) + 16;
    if (prev) prev.addEventListener('click', () => track.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }));
    if (next) next.addEventListener('click', () => track.scrollBy({ left: scrollAmount(), behavior: 'smooth' }));
  });

  /* ---- Gallery drag-scroll -------------------------------- */
  $$('.loved-gallery__track').forEach(track => {
    let isDown = false, startX = 0, scrollLeft = 0;
    track.addEventListener('mousedown', e => {
      isDown = true; track.classList.add('is-dragging');
      startX    = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
    });
    track.addEventListener('mouseleave', () => { isDown = false; track.classList.remove('is-dragging'); });
    track.addEventListener('mouseup',    () => { isDown = false; track.classList.remove('is-dragging'); });
    track.addEventListener('mousemove',  e => {
      if (!isDown) return;
      e.preventDefault();
      const x   = e.pageX - track.offsetLeft;
      const walk = (x - startX) * 1.2;
      track.scrollLeft = scrollLeft - walk;
    });
  });

  /* Gallery prev/next buttons */
  $$('.gallery-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const track = btn.closest('.loved-gallery')?.querySelector('.loved-gallery__track');
      const dir   = btn.dataset.dir === 'prev' ? -1 : 1;
      if (track) track.scrollBy({ left: dir * 260, behavior: 'smooth' });
    });
  });

  /* ---- Sticky header shadow ------------------------------ */
  const header = $('.site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      header.classList.toggle('is-scrolled', window.scrollY > 10);
    }, { passive: true });
  }

  /* ---- Cart page qty inputs ------------------------------ */
  $$('.cart-row__qty input').forEach(input => {
    input.addEventListener('change', async () => {
      const key = input.dataset.key;
      const qty = parseInt(input.value, 10);
      if (!key || isNaN(qty)) return;
      await fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key, quantity: qty }),
      });
      location.reload();
    });
  });

  /* ---- Helpers ------------------------------------------- */
  function formatMoney(cents) {
    return '£' + (cents / 100).toFixed(2);
  }
  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
