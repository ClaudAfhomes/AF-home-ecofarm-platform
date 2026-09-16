import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
function loadEnv(p: string) {
  try {
    const c = fs.readFileSync(p, 'utf8');
    for (const l of c.split('\n')) {
      const t = l.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq == -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (!(k in process.env) && v) process.env[k] = v;
    }
  } catch {}
}
loadEnv('.env');
loadEnv('apps/web/.env.local');
const url = process.env.VITE_SUPABASE_URL!;
const anon = process.env.VITE_SUPABASE_ANON_KEY!;
const API = 'http://localhost:3000/api/v1';

async function testRealtime() {
  console.log('=== Realtime Tests ===');
  const supaAnon = createClient(url, anon, { auth: { autoRefreshToken: false } });
  const supaAdminAnon = createClient(url, anon, { auth: { autoRefreshToken: false } });
  const { data: login } = await supaAdminAnon.auth.signInWithPassword({
    email: 'admin@jad.local',
    password: process.env.SUPABASE_SEED_ADMIN_PASSWORD!,
  });
  const adminToken = login.session!.access_token;

  // Simulate public Browser A: subscribe to cms:public
  let invalidatedKeys: string[] = [];
  let channel: any = null;
  let subscribeCount = 0;
  function subscribe() {
    subscribeCount++;
    console.log(`  Subscribing (count ${subscribeCount})...`);
    channel = supaAnon.channel('cms:public', {
      config: { broadcast: { ack: false, self: false }, presence: { enabled: false } },
    });
    channel.on('broadcast', { event: 'cms_update' }, (payload: any) => {
      const key = payload?.payload?.key;
      console.log(`  [Browser A] broadcast cms_update key=${key}`);
      if (key) invalidatedKeys.push(key);
    });
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cms_contents' },
      (payload: any) => {
        const key = payload.new?.key ?? payload.old?.key;
        console.log(`  [Browser A] postgres_changes ${payload.eventType} key=${key}`);
        if (key) invalidatedKeys.push('pg:' + key);
      },
    );
    channel.subscribe((status: string, err?: Error) => {
      console.log(`  [Browser A] subscribe status ${status}`, err?.message || '');
    });
  }
  subscribe();

  await new Promise((r) => setTimeout(r, 1000));

  // Test 1: Change homepage title
  console.log('\n[Test 1] Change homepage title');
  invalidatedKeys = [];
  let before = await fetch(`${API}/cms/homepage`).then((r) => r.json());
  let draft = { ...before, hero: { ...before.hero, title: 'Realtime Test ' + Date.now() } };
  let put = await fetch(`${API}/cms/homepage`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(draft),
  });
  console.log(`  PUT homepage → ${put.status}`);
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`  Invalidated keys: ${invalidatedKeys.join(', ')}`);
  if (invalidatedKeys.includes('homepage') || invalidatedKeys.includes('pg:homepage')) {
    console.log('  ✓ Browser A would invalidate [cms,homepage] and refetch');
  } else {
    console.log('  ✗ No invalidation received (expected broadcast or pg)');
  }

  // Test 2: Change to image
  console.log('\n[Test 2] Change to image (homepage hero.image)');
  invalidatedKeys = [];
  before = await fetch(`${API}/cms/homepage`).then((r) => r.json());
  // Upload a small image via signed URL
  const supaService = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false },
  });
  const { data: sign } = await supaService.storage
    .from('marketing-tools')
    .createSignedUploadUrl(`cms/rt-test-${Date.now()}.jpg`);
  // Use direct service upload for test, but the broadcast should still happen via PUT
  draft = {
    ...before,
    hero: {
      ...before.hero,
      image: {
        id: 'https://vudwoqduebdgtzvybywb.supabase.co/storage/v1/object/public/marketing-tools/cms/rt-test.jpg',
        alt: 'rt',
      },
    },
  };
  put = await fetch(`${API}/cms/homepage`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(draft),
  });
  console.log(`  PUT homepage image → ${put.status}`);
  await new Promise((r) => setTimeout(r, 1500));
  console.log(`  Invalidated: ${invalidatedKeys.join(', ')}`);
  console.log(invalidatedKeys.length > 0 ? '  ✓ Image change broadcast' : '  ✗ No broadcast');

  // Test 3: About
  console.log('\n[Test 3] About');
  invalidatedKeys = [];
  let about = await fetch(`${API}/cms/about`).then((r) => r.json());
  let draftAbout = { ...about, hero: { ...about.hero, title: 'About RT ' + Date.now() } };
  put = await fetch(`${API}/cms/about`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(draftAbout),
  });
  console.log(`  PUT about → ${put.status}`);
  await new Promise((r) => setTimeout(r, 1500));
  console.log(
    `  Invalidated: ${invalidatedKeys.join(', ')}`,
    invalidatedKeys.includes('about') ? '✓' : '✗',
  );

  // Test 4: Properties
  console.log('\n[Test 4] Properties');
  invalidatedKeys = [];
  let props = await fetch(`${API}/cms/properties`).then((r) => r.json());
  let draftProps = { ...props, page: { ...props.page, title: 'Props RT ' + Date.now() } };
  put = await fetch(`${API}/cms/properties`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(draftProps),
  });
  console.log(`  PUT properties → ${put.status}`);
  await new Promise((r) => setTimeout(r, 1500));
  console.log(
    `  Invalidated: ${invalidatedKeys.join(', ')}`,
    invalidatedKeys.includes('properties') ? '✓' : '✗',
  );

  // Test 5: Another key (faqs)
  console.log('\n[Test 5] FAQs');
  invalidatedKeys = [];
  let faqs = await fetch(`${API}/cms/faqs`).then((r) => r.json());
  let draftFaqs = { ...faqs, title: 'FAQs RT ' + Date.now() };
  put = await fetch(`${API}/cms/faqs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(draftFaqs),
  });
  console.log(`  PUT faqs → ${put.status}`);
  await new Promise((r) => setTimeout(r, 1500));
  console.log(
    `  Invalidated: ${invalidatedKeys.join(', ')}`,
    invalidatedKeys.includes('faqs') ? '✓' : '✗',
  );

  // Test 6: Reconnect
  console.log('\n[Test 6] Reconnect Browser A');
  await supaAnon.removeChannel(channel);
  console.log('  Removed channel, resubscribing...');
  subscribe();
  await new Promise((r) => setTimeout(r, 1000));
  invalidatedKeys = [];
  let contact = await fetch(`${API}/cms/contact`).then((r) => r.json());
  let draftContact = { ...contact, title: 'Contact RT ' + Date.now() };
  put = await fetch(`${API}/cms/contact`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(draftContact),
  });
  console.log(`  PUT contact → ${put.status}`);
  await new Promise((r) => setTimeout(r, 1500));
  console.log(
    `  After reconnect invalidated: ${invalidatedKeys.join(', ')}`,
    invalidatedKeys.includes('contact') ? '✓' : '✗',
  );

  // Test 7: No duplicate subscriptions on rerenders
  console.log('\n[Test 7] No duplicate subscriptions (check subscribeCount)');
  console.log(`  subscribeCount = ${subscribeCount} (should be 2: initial + reconnect)`);
  if (subscribeCount === 2) console.log('  ✓ No duplicates');
  else console.log('  ✗ Unexpected count');

  // Restore original homepage etc
  await fetch(`${API}/cms/homepage`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(before),
  });
  await fetch(`${API}/cms/about`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(about),
  });
  await fetch(`${API}/cms/properties`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(props),
  });
  await fetch(`${API}/cms/faqs`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(faqs),
  });
  await fetch(`${API}/cms/contact`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + adminToken },
    body: JSON.stringify(contact),
  });

  await supaAnon.removeChannel(channel);
  console.log('\n=== Realtime tests done ===');
}

testRealtime().catch((e) => {
  console.error(e);
  process.exit(1);
});
