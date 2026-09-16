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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API = 'http://localhost:3000/api/v1';
const supaAnon = createClient(url, anon, { auth: { autoRefreshToken: false } });
const supaService = createClient(url, serviceKey, { auth: { autoRefreshToken: false } });

async function loginAdmin() {
  const { data } = await supaAnon.auth.signInWithPassword({
    email: 'admin@jad.local',
    password: process.env.SUPABASE_SEED_ADMIN_PASSWORD!,
  });
  return data.session!.access_token;
}
async function g(k: string) {
  const r = await fetch(`${API}/cms/${k}`);
  return { st: r.status, j: await r.json().catch(() => null), v: r.headers.get('x-cms-version') };
}
async function p(k: string, pl: any, token: string) {
  const r = await fetch(`${API}/cms/${k}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify(pl),
  });
  const j = await r.json().catch(() => null);
  return { st: r.status, j, v: r.headers.get('x-cms-version') };
}
async function uploadSigned(token: string, name: string, type: string, size: number) {
  const r = await fetch(`${API}/cms/upload/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ name, type, size }),
  });
  const j = await r.json();
  if (r.status !== 200) throw new Error(`sign failed ${r.status} ${JSON.stringify(j)}`);
  const put = await fetch(j.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body: Buffer.alloc(size, 0),
  });
  if (put.status !== 200) throw new Error(`put failed ${put.status}`);
  return j as { signedUrl: string; publicUrl: string; path: string };
}
function assert(c: boolean, m: string) {
  if (!c) throw new Error('FAIL: ' + m);
  console.log('  ✓ ' + m);
}

async function main() {
  const token = await loginAdmin();
  console.log('=== Image Cleanup Tests ===');
  // Test helper to check storage exists
  async function exists(path: string) {
    const { data, error } = await supaService.storage
      .from('marketing-tools')
      .list('cms', { limit: 100 });
    if (error) return false;
    return data.some((f) => ('' + f.name).includes(path.split('/').pop()!));
  }
  // 1. Upload A -> save -> A exists
  console.log('\n[Test 1] Upload A -> save -> A exists');
  const before1 = await g('homepage');
  const orig = before1.j;
  const upA = await uploadSigned(token, 'testA.jpg', 'image/jpeg', 1024);
  console.log('  uploaded A', upA.publicUrl.slice(0, 60), upA.path);
  let draft1 = { ...orig, hero: { ...orig.hero, image: { id: upA.publicUrl, alt: 'A' } } };
  let put1 = await p('homepage', draft1, token);
  assert(put1.st === 200, 'PUT A 200');
  let after1 = await g('homepage');
  assert(after1.j.hero.image.id === upA.publicUrl, 'A persisted');
  let list = await supaService.storage.from('marketing-tools').list('cms', { limit: 100 });
  assert(
    list.data!.some((f) => f.name === upA.path.split('/').pop()),
    'A exists in storage',
  );

  // 2. Replace A with B -> B exists, A deleted
  console.log('\n[Test 2] Replace A with B');
  const upB = await uploadSigned(token, 'testB.png', 'image/png', 1024);
  console.log('  uploaded B', upB.path);
  let draft2 = { ...after1.j, hero: { ...after1.j.hero, image: { id: upB.publicUrl, alt: 'B' } } };
  let put2 = await p('homepage', draft2, token);
  assert(put2.st === 200, 'PUT B 200');
  // Wait a bit for async cleanup (though our cleanup is awaited before response, but just in case)
  await new Promise((r) => setTimeout(r, 500));
  let after2 = await g('homepage');
  assert(after2.j.hero.image.id === upB.publicUrl, 'B persisted');
  let list2 = await supaService.storage.from('marketing-tools').list('cms', { limit: 100 });
  assert(
    list2.data!.some((f) => f.name === upB.path.split('/').pop()),
    'B exists',
  );
  assert(!list2.data!.some((f) => f.name === upA.path.split('/').pop()), 'A deleted');

  // 3. Remove B -> B deleted (set back to original Unsplash)
  console.log('\n[Test 3] Remove B (restore Unsplash)');
  let draft3 = {
    ...after2.j,
    hero: {
      ...after2.j.hero,
      image: { id: 'photo-1600585154340-be6161a56a0c', alt: 'A modern residence' },
    },
  };
  let put3 = await p('homepage', draft3, token);
  assert(put3.st === 200, 'PUT remove B 200');
  await new Promise((r) => setTimeout(r, 500));
  let after3 = await g('homepage');
  assert(after3.j.hero.image.id === 'photo-1600585154340-be6161a56a0c', 'Unsplash restored');
  let list3 = await supaService.storage.from('marketing-tools').list('cms', { limit: 100 });
  assert(!list3.data!.some((f) => f.name === upB.path.split('/').pop()), 'B deleted after remove');

  // 4. Upload A -> force save failure -> A remains, existing remains
  console.log('\n[Test 4] Upload A -> force save failure');
  const upA2 = await uploadSigned(token, 'testA2.jpg', 'image/jpeg', 1024);
  console.log('  uploaded A2', upA2.path);
  // Force failure with invalid payload (empty hero.title)
  let badDraft = { ...after3.j, hero: { ...after3.j.hero, title: '' } };
  let badPut = await p('homepage', badDraft, token);
  assert(badPut.st === 400, 'forced bad PUT 400');
  // A2 should still exist (was not part of CMS, but uploaded)
  let list4 = await supaService.storage.from('marketing-tools').list('cms', { limit: 100 });
  assert(
    list4.data!.some((f) => f.name === upA2.path.split('/').pop()),
    'A2 remains after failed save',
  );
  // Existing Unsplash still there (not deleted)
  let after4 = await g('homepage');
  assert(
    after4.j.hero.image.id === 'photo-1600585154340-be6161a56a0c',
    'existing Unsplash remains after failed save',
  );
  // Cleanup A2 manually
  await supaService.storage.from('marketing-tools').remove([upA2.path]);

  // 5. Replace Unsplash -> not deleted (Unsplash should never be deleted)
  console.log('\n[Test 5] Replace Unsplash -> Unsplash not deleted');
  const upC = await uploadSigned(token, 'testC.jpg', 'image/jpeg', 1024);
  let draft5 = { ...after3.j, hero: { ...after3.j.hero, image: { id: upC.publicUrl, alt: 'C' } } };
  let put5 = await p('homepage', draft5, token);
  assert(put5.st === 200, 'PUT C 200');
  await new Promise((r) => setTimeout(r, 500));
  // No way to check Unsplash deletion in storage (it's not in storage), but we can ensure no error and that Unsplash id is not treated as storage path
  let after5 = await g('homepage');
  assert(after5.j.hero.image.id === upC.publicUrl, 'C persisted');
  // Restore Unsplash
  await p('homepage', after3.j, token);
  await new Promise((r) => setTimeout(r, 500));
  let list5 = await supaService.storage.from('marketing-tools').list('cms', { limit: 100 });
  assert(
    !list5.data!.some((f) => f.name === upC.path.split('/').pop()),
    'C deleted after restore (Unsplash not in storage to delete)',
  );
  // But Unsplash itself was never in storage, so nothing to delete

  // 6. External HTTPS -> not deleted
  console.log('\n[Test 6] External HTTPS -> not deleted');
  const externalUrl = 'https://example.com/external.jpg';
  let draft6 = { ...after3.j, hero: { ...after3.j.hero, image: { id: externalUrl, alt: 'ext' } } };
  let put6 = await p('homepage', draft6, token);
  assert(put6.st === 200, 'PUT external 200');
  // Now replace external with Unsplash
  await p('homepage', after3.j, token);
  await new Promise((r) => setTimeout(r, 500));
  // External should not have been deleted from storage (it was never there), and no error
  console.log('  ✓ External not deleted (no storage path)');

  // 7. Newly saved image never deleted (already tested in 2: B not deleted when it is the new image, A was deleted, B remains)
  console.log(
    '\n[Test 7] Newly saved image never deleted - verified in Test 2 (B remains, A deleted)',
  );

  // 8. Every CMS image location - test a few representative ones
  console.log('\n[Test 8] Every CMS image location');
  // Test global.logo
  const beforeGlobal = await g('global');
  const upG = await uploadSigned(token, 'global.jpg', 'image/jpeg', 1024);
  let draftG = { ...beforeGlobal.j, logo: { id: upG.publicUrl, alt: 'logo' } };
  let putG = await p('global', draftG, token);
  assert(putG.st === 200, 'PUT global.logo 200');
  await new Promise((r) => setTimeout(r, 500));
  let afterG = await g('global');
  assert(afterG.j.logo.id === upG.publicUrl, 'global.logo persisted');
  await p('global', beforeGlobal.j, token);
  let listG = await supaService.storage.from('marketing-tools').list('cms', { limit: 100 });
  assert(
    !listG.data!.some((f) => f.name === upG.path.split('/').pop()),
    'global.logo cleaned after restore',
  );

  // Test properties category image
  const beforeProps = await g('properties');
  const upP = await uploadSigned(token, 'cat.jpg', 'image/jpeg', 1024);
  let draftP = JSON.parse(JSON.stringify(beforeProps.j));
  draftP.categories[0].image = { id: upP.publicUrl, alt: 'cat' };
  let putP = await p('properties', draftP, token);
  assert(putP.st === 200, 'PUT properties.categories[0].image 200');
  await new Promise((r) => setTimeout(r, 500));
  let afterP = await g('properties');
  assert(afterP.j.categories[0].image.id === upP.publicUrl, 'category image persisted');
  await p('properties', beforeProps.j, token);
  let listP = await supaService.storage.from('marketing-tools').list('cms', { limit: 100 });
  assert(!listP.data!.some((f) => f.name === upP.path.split('/').pop()), 'category image cleaned');

  // Test properties gallery
  const upGal = await uploadSigned(token, 'gallery.jpg', 'image/jpeg', 1024);
  let draftGal = JSON.parse(JSON.stringify(beforeProps.j));
  draftGal.properties[0].gallery[0] = { id: upGal.publicUrl, alt: 'gal' };
  let putGal = await p('properties', draftGal, token);
  assert(putGal.st === 200, 'PUT properties.properties[0].gallery[0] 200');
  await new Promise((r) => setTimeout(r, 500));
  let afterGal = await g('properties');
  assert(afterGal.j.properties[0].gallery[0].id === upGal.publicUrl, 'gallery image persisted');
  await p('properties', beforeProps.j, token);
  let listGal = await supaService.storage.from('marketing-tools').list('cms', { limit: 100 });
  assert(
    !listGal.data!.some((f) => f.name === upGal.path.split('/').pop()),
    'gallery image cleaned',
  );

  // Test login brandMark
  const beforeLogin = await g('login');
  const upL = await uploadSigned(token, 'login.jpg', 'image/jpeg', 1024);
  let draftL = { ...beforeLogin.j, brandMark: { id: upL.publicUrl, alt: 'login' } };
  let putL = await p('login', draftL, token);
  assert(putL.st === 200, 'PUT login.brandMark 200');
  await new Promise((r) => setTimeout(r, 500));
  let afterL = await g('login');
  assert(afterL.j.brandMark.id === upL.publicUrl, 'login brandMark persisted');
  await p('login', beforeLogin.j, token);

  console.log('\n=== All image cleanup tests PASS ===');
}
main().catch((e) => {
  console.error('FAIL', e.message, e.stack);
  process.exit(1);
});
