/* Twice As Nice Boutique — multi-user gift card app (static + Supabase) */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://pxnskbpjwxshnlbufmgi.supabase.co';
const LS_KEY = 'tann_gc_pubkey';
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

let supabase = null;
let currentCard = null; // currently looked-up gift_cards row

const $ = (id) => document.getElementById(id);

function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = true;
  $(id).hidden = false;
  window.scrollTo(0, 0);
}

function showError(elId, message) {
  const el = $(elId);
  el.textContent = message;
  el.hidden = false;
}

function clearError(elId) {
  const el = $(elId);
  el.textContent = '';
  el.hidden = true;
}

/* Plain-language error mapping */
function friendly(err) {
  if (!err) return 'Something went wrong.';
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';
  if (msg.includes('invalid api key') || msg.includes('api key')) {
    return 'Your publishable key looks wrong. Open Settings and check it.';
  }
  if (msg.includes('jwt') || msg.includes('token') || code === 'PGRST301') {
    return 'Your session expired. Please sign in again.';
  }
  if (msg.includes('invalid login credentials')) {
    return 'Wrong email or password. Try again, or create an account.';
  }
  if (msg.includes('user already registered') || msg.includes('already exists')) {
    return 'That email already has an account. Sign in instead.';
  }
  if (msg.includes('email not confirmed')) {
    return 'That email address is not confirmed yet. Ask the owner to turn off "Confirm email" in Supabase Auth settings, then try again.';
  }
  if (msg.includes('password')) {
    return 'Password problem: ' + (err.message || 'check your password and try again.');
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Could not reach the database. Check your internet connection and try again.';
  }
  if (code === '23505' || msg.includes('duplicate')) {
    return 'That card code already exists. Please try again.';
  }
  if (code === 'PGRST116') {
    return 'No card found with that code.';
  }
  return err.message || 'Something went wrong.';
}

const money = (n) => '$' + Number(n).toFixed(2);

/* LCARS flavor: stardate for display only */
function stardate(dateLike) {
  const d = new Date(dateLike);
  const start = new Date(d.getFullYear(), 0, 0);
  const doy = Math.floor((d - start) / 864e5);
  return ((d.getFullYear() % 100) * 1000 + (doy / 365.25) * 1000).toFixed(1);
}

/* ---------- setup / boot ---------- */

function getStoredKey() {
  try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; }
}

function initClient(key) {
  supabase = createClient(SUPABASE_URL, key);
}

async function boot() {
  const key = getStoredKey();
  if (!key) {
    showScreen('screen-setup');
    return;
  }
  initClient(key);
  const { data } = await supabase.auth.getSession();
  if (data && data.session) {
    enterApp(data.session.user);
  } else {
    showScreen('screen-auth');
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      currentCard = null;
      showScreen('screen-auth');
    } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
      enterApp(session.user);
    }
  });
}

function enterApp(user) {
  $('whoami').textContent = user.email || 'staff';
  showScreen('screen-app');
  switchView('view-issue');
}

/* ---------- auth ---------- */

function wireAuth() {
  $('tab-signin').addEventListener('click', () => {
    $('tab-signin').classList.add('active');
    $('tab-signup').classList.remove('active');
    $('form-signin').hidden = false;
    $('form-signup').hidden = true;
    clearError('auth-error');
  });
  $('tab-signup').addEventListener('click', () => {
    $('tab-signup').classList.add('active');
    $('tab-signin').classList.remove('active');
    $('form-signup').hidden = false;
    $('form-signin').hidden = true;
    clearError('auth-error');
  });

  $('form-signin').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('auth-error');
    const email = $('signin-email').value.trim();
    const password = $('signin-password').value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { showError('auth-error', friendly(error)); return; }
    if (data.session) enterApp(data.session.user);
  });

  $('form-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('auth-error');
    const email = $('signup-email').value.trim();
    const password = $('signup-password').value;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { showError('auth-error', friendly(error)); return; }
    if (data.session) {
      enterApp(data.session.user);
    } else {
      showError('auth-error',
        'Account created, but you are not signed in yet. Ask the owner to turn off "Confirm email" ' +
        'in Supabase Auth settings, then sign in.');
    }
  });

  $('btn-signout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}

/* ---------- settings ---------- */

function wireSettings() {
  $('btn-settings').addEventListener('click', () => {
    $('settings-key').value = getStoredKey();
    clearError('settings-error');
    $('modal-settings').hidden = false;
  });
  $('settings-close').addEventListener('click', () => {
    $('modal-settings').hidden = true;
  });
  $('settings-save').addEventListener('click', () => {
    const key = $('settings-key').value.trim();
    if (!key) { showError('settings-error', 'Paste the publishable key first.'); return; }
    try { localStorage.setItem(LS_KEY, key); } catch {
      showError('settings-error', 'Could not save the key in this browser.'); return;
    }
    window.location.reload();
  });
  $('settings-reset').addEventListener('click', () => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    window.location.reload();
  });

  $('setup-save').addEventListener('click', async () => {
    const key = $('setup-key').value.trim();
    clearError('setup-error');
    if (!key) { showError('setup-error', 'Paste the publishable key first.'); return; }
    try { localStorage.setItem(LS_KEY, key); } catch {
      showError('setup-error', 'Could not save the key in this browser.'); return;
    }
    initClient(key);
    // quick sanity check that the key works
    const { error } = await supabase.from('gift_cards').select('id').limit(1);
    if (error && /api key|jwt/i.test(error.message || '')) {
      try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
      supabase = null;
      showError('setup-error', 'That key was rejected. Double-check it and try again.');
      return;
    }
    boot();
  });
}

/* ---------- navigation ---------- */

function switchView(viewId) {
  for (const v of document.querySelectorAll('.view')) v.hidden = true;
  $(viewId).hidden = false;
  for (const t of document.querySelectorAll('.main-tabs .tab')) {
    t.classList.toggle('active', t.dataset.view === viewId);
  }
  clearError('app-error');
  if (viewId === 'view-history') loadHistory();
}

function wireNav() {
  for (const t of document.querySelectorAll('.main-tabs .tab')) {
    t.addEventListener('click', () => switchView(t.dataset.view));
  }
}

/* ---------- card codes ---------- */

function randomCode() {
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  let s = '';
  for (const n of buf) s += CODE_ALPHABET[n % CODE_ALPHABET.length];
  return 'TAN-' + s;
}

/* ---------- issue ---------- */

async function issueCard(amount, recipient, giver, message) {
  const staff = (await supabase.auth.getUser()).data.user?.email || 'staff';

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { data, error } = await supabase
      .from('gift_cards')
      .insert({
        code,
        amount,
        balance: amount,
        recipient: recipient || null,
        giver: giver || null,
        message: message || null,
        status: 'active',
        issued_by: staff,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') continue; // code collision, try again
      throw error;
    }
    const { error: txError } = await supabase
      .from('gift_card_transactions')
      .insert({
        card_id: data.id,
        kind: 'issue',
        amount,
        balance_after: amount,
        staff,
      });
    if (txError) throw txError;
    return data;
  }
  throw new Error('Could not generate a unique card code. Please try again.');
}

function wireIssue() {
  $('form-issue').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('app-error');
    $('issue-result').hidden = true;
    const amount = Number(Number($('issue-amount').value).toFixed(2));
    if (!amount || amount <= 0) {
      showError('app-error', 'Enter an amount greater than $0.');
      return;
    }
    try {
      const card = await issueCard(
        amount,
        $('issue-recipient').value.trim(),
        $('issue-giver').value.trim(),
        $('issue-message').value.trim()
      );
      $('issue-code').textContent = card.code;
      $('issue-result').hidden = false;
      $('issue-print').onclick = () => printVoucher(card);
      $('form-issue').reset();
    } catch (err) {
      showError('app-error', friendly(err));
    }
  });
}

/* ---------- lookup & redeem ---------- */

async function fetchCard(code) {
  const { data, error } = await supabase
    .from('gift_cards')
    .select('id, code, amount, balance, recipient, giver, message, status, issued_by, issued_at, redeemed_at')
    .eq('code', code)
    .maybeSingle();
  if (error) throw error;
  return data; // null when not found
}

function renderCard(card) {
  currentCard = card;
  $('card-code').textContent = card.code;
  $('card-balance').textContent = money(card.balance);
  $('card-amount').textContent = money(card.amount);
  $('card-status').textContent = card.status;
  $('card-recipient').textContent = card.recipient || '—';
  $('card-giver').textContent = card.giver || '—';
  $('card-message').textContent = card.message || '—';
  $('redeem-block').style.display = card.status === 'active' && Number(card.balance) > 0 ? '' : 'none';
  $('lookup-print').onclick = () => printVoucher(card);
  $('lookup-result').hidden = false;
}

function wireLookup() {
  $('form-lookup').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('app-error');
    $('lookup-result').hidden = true;
    currentCard = null;
    const code = $('lookup-code').value.trim().toUpperCase();
    if (!code) { showError('app-error', 'Enter a card code first.'); return; }
    try {
      const card = await fetchCard(code);
      if (!card) { showError('app-error', 'No card found with that code.'); return; }
      renderCard(card);
    } catch (err) {
      showError('app-error', friendly(err));
    }
  });

  $('form-redeem').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('app-error');
    if (!currentCard) { showError('app-error', 'Look up a card first.'); return; }
    const redeemAmount = Number(Number($('redeem-amount').value).toFixed(2));
    const balance = Number(currentCard.balance);
    if (!redeemAmount || redeemAmount <= 0) {
      showError('app-error', 'Enter a redeem amount greater than $0.');
      return;
    }
    if (redeemAmount > balance) {
      showError('app-error', 'That is more than the remaining balance of ' + money(balance) + '.');
      return;
    }
    try {
      const staff = (await supabase.auth.getUser()).data.user?.email || 'staff';
      const newBalance = Number((balance - redeemAmount).toFixed(2));
      const patch = { balance: newBalance };
      if (newBalance === 0) {
        patch.status = 'redeemed';
        patch.redeemed_at = new Date().toISOString();
      }
      const { data, error } = await supabase
        .from('gift_cards')
        .update(patch)
        .eq('id', currentCard.id)
        .select('id, code, amount, balance, recipient, giver, message, status, issued_by, issued_at, redeemed_at')
        .single();
      if (error) throw error;
      const { error: txError } = await supabase
        .from('gift_card_transactions')
        .insert({
          card_id: currentCard.id,
          kind: 'redeem',
          amount: redeemAmount,
          balance_after: newBalance,
          staff,
        });
      if (txError) throw txError;
      $('form-redeem').reset();
      renderCard(data);
    } catch (err) {
      showError('app-error', friendly(err));
    }
  });
}

/* ---------- history ---------- */

async function loadHistory() {
  const list = $('history-list');
  const filter = $('history-filter').value.trim().toUpperCase();
  list.innerHTML = '<p class="empty lcars-working">WORKING&hellip;</p>';
  clearError('app-error');
  try {
    let query = supabase
      .from('gift_card_transactions')
      .select('id, card_id, kind, amount, balance_after, staff, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    const { data: txns, error } = await query;
    if (error) throw error;
    if (!txns || txns.length === 0) {
      list.innerHTML = '<p class="empty">No transactions yet.</p>';
      return;
    }
    // map card ids -> codes (robust without relying on FK embedding)
    const ids = [...new Set(txns.map((t) => t.card_id))];
    const { data: cards, error: cardError } = await supabase
      .from('gift_cards')
      .select('id, code')
      .in('id', ids);
    if (cardError) throw cardError;
    const codeById = Object.fromEntries((cards || []).map((c) => [c.id, c.code]));
    const rows = txns
      .map((t) => ({ ...t, code: codeById[t.card_id] || '—' }))
      .filter((t) => !filter || t.code.toUpperCase().includes(filter));
    if (rows.length === 0) {
      list.innerHTML = '<p class="empty">No transactions match that filter.</p>';
      return;
    }
    list.innerHTML = rows.map((t) => `
      <div class="history-row">
        <div>
          <span class="code">${escapeHtml(t.code)}</span>
          <span class="kind">${escapeHtml(t.kind)}</span>
          <div class="meta">${escapeHtml(t.staff || '')} · ${new Date(t.created_at).toLocaleString()} · SD ${stardate(t.created_at)}</div>
        </div>
        <div class="amount">${money(t.amount)}</div>
      </div>`).join('');
  } catch (err) {
    list.innerHTML = '';
    showError('app-error', friendly(err));
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function wireHistory() {
  let timer = null;
  $('history-filter').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(loadHistory, 300);
  });
}

/* ---------- voucher printing ---------- */

function printVoucher(card) {
  const area = $('print-area');
  area.innerHTML = `
    <div class="voucher">
      <div>
        <h1>Twice As Nice Boutique</h1>
        <p class="tagline">Gift Card Voucher</p>
        <p class="tofrom"><strong>To:</strong> ${escapeHtml(card.recipient || '')}<br>
        <strong>From:</strong> ${escapeHtml(card.giver || '')}</p>
        ${card.message ? `<p class="message">${escapeHtml(card.message)}</p>` : ''}
      </div>
      <div>
        <p class="amount">${money(card.amount)}</p>
        <p class="code">${escapeHtml(card.code)}</p>
      </div>
    </div>`;
  window.print();
}

/* ---------- go ---------- */

wireAuth();
wireSettings();
wireNav();
wireIssue();
wireLookup();
wireHistory();
boot();
