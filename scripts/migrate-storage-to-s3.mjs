/**
 * One-time migration script: Supabase Storage → AWS S3
 *
 * Downloads every file from Supabase Storage, uploads it to S3 with a
 * matching folder structure, then updates all URL references in the
 * database so no images break.
 *
 * Run:  node --env-file=.env.local scripts/migrate-storage-to-s3.mjs
 */

import { createClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

// ─── Config ────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME;
const S3_REGION = process.env.AWS_S3_REGION || "us-east-1";
const AWS_KEY = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET = process.env.AWS_SECRET_ACCESS_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !S3_BUCKET || !AWS_KEY || !AWS_SECRET) {
  console.error("Missing env vars. Make sure .env.local is loaded.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const s3 = new S3Client({
  region: S3_REGION,
  credentials: { accessKeyId: AWS_KEY, secretAccessKey: AWS_SECRET },
});

const SUPABASE_STORAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/`;

function getS3PublicUrl(key) {
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encodeURI(key)}`;
}

// ─── Hardcoded file list (from storage.objects query) ───────────────
// This avoids dealing with Supabase JS client's schema limitations.
const FILES = [
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1784981291419-81MuxoxCnzL__AC_UF350_350_QL80_.jpg", mime: "image/jpeg" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1784981632528-37368.jpg", mime: "image/jpeg" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1784981827097-1729959470847z8c190n6.png", mime: "image/png" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1784981996364-AI_Coding_Tools_Report.pdf", mime: "application/pdf" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1784982008953-ITACHI.mp4", mime: "video/mp4" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1784982027512-voice-1784982027428.ogg", mime: "audio/ogg" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1785149272148-37368.jpg", mime: "image/jpeg" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1785153176664-17299590868225mmkskns.png", mime: "image/png" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1785153221466-1729959470847z8c190n6.png", mime: "image/png" },
  { bucket: "chat-media", name: "account-3430edae-763b-4aac-9b82-1c2364936d79/1785392966754-1729959470847z8c190n6.png", mime: "image/png" },
  { bucket: "public-assets", name: "favicon_url/1786428326436-n41joncsg7l.png", mime: "image/png" },
  { bucket: "public-assets", name: "favicon_url/1786429136010-3oni29ed23h.png", mime: "image/png" },
  { bucket: "public-assets", name: "full_logo_url/1786428350473-jl5mqk6uyie.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "full_logo_url/1786429154491-g5rflshgimd.png", mime: "image/png" },
  { bucket: "public-assets", name: "landing-sections/0.03269669904131611.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.057946727830456846.png", mime: "image/png" },
  { bucket: "public-assets", name: "landing-sections/0.07853198419725116.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.14293040231703247.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.15054502397074576.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.17988519811159753.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.2697778102682953.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.2775783484255323.png", mime: "image/png" },
  { bucket: "public-assets", name: "landing-sections/0.3049871152833369.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.31301832221700854.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.34034230863657444.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.42050728446465435.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.4447899230470006.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.4762013822552046.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.478368964185767.webp", mime: "image/webp" },
  { bucket: "public-assets", name: "landing-sections/0.5030861991879763.png", mime: "image/png" },
  { bucket: "public-assets", name: "landing-sections/0.5047397961950877.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.5486094243520065.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.5515516367490317.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.5761410416610566.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.5864832741418295.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.6339856707446601.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.6463990310872921.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.6560091912528258.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.6826493178887609.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.6840753265270323.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.6843913001918743.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.7006376135194761.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.7012695037660169.webp", mime: "image/webp" },
  { bucket: "public-assets", name: "landing-sections/0.7217896114619867.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.7327766960919538.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.7348950900457553.png", mime: "image/png" },
  { bucket: "public-assets", name: "landing-sections/0.7829484077470483.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.8060085165350175.png", mime: "image/png" },
  { bucket: "public-assets", name: "landing-sections/0.8505194636977615.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.8794008869546039.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.8939347567207169.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "landing-sections/0.9124921821511134.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "logo_dark_url/1786429145087-aex8kd8y1ba.png", mime: "image/png" },
  { bucket: "public-assets", name: "logo_dark_url/1786453401925-4d8xzuqj8je.png", mime: "image/png" },
  { bucket: "public-assets", name: "logo_url/1786428315781-v2h2sietbmj.png", mime: "image/png" },
  { bucket: "public-assets", name: "logo_url/1786430237879-48uepo7exqj.jpg", mime: "image/jpeg" },
  { bucket: "public-assets", name: "logo_url/1786443447261-fjv1fz2ityg.png", mime: "image/png" },
  { bucket: "public-assets", name: "logo_url/1786443526591-dtezyvx9tse.png", mime: "image/png" },
  { bucket: "public-assets", name: "meta_partner_badge_url/1786428359837-8uo2f5dpd3v.webp", mime: "image/webp" },
];

// ─── Step 1: Download from Supabase & Upload to S3 ──────────────────
console.log("\n═══ PHASE 3: Migrate Supabase Storage → AWS S3 ═══\n");
console.log(`  Files to migrate: ${FILES.length}\n`);

const urlMap = new Map(); // oldUrl → newUrl
let success = 0;
let failed = 0;

for (const file of FILES) {
  const s3Key = `${file.bucket}/${file.name}`;
  const oldUrl = `${SUPABASE_STORAGE_PREFIX}${file.bucket}/${file.name}`;
  const newUrl = getS3PublicUrl(s3Key);

  process.stdout.write(`  [${success + failed + 1}/${FILES.length}] ${file.bucket}/${file.name} ... `);

  try {
    // Download from Supabase
    const { data: blob, error: dlErr } = await supabase.storage
      .from(file.bucket)
      .download(file.name);

    if (dlErr) throw new Error(`Download: ${dlErr.message}`);

    const buffer = Buffer.from(await blob.arrayBuffer());

    // Upload to S3
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: buffer,
        ContentType: file.mime,
      })
    );

    urlMap.set(oldUrl, newUrl);
    success++;
    console.log(`✓ (${(buffer.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    failed++;
    console.log(`✗ ${err.message}`);
  }
}

console.log(`\n  Uploaded: ${success}  |  Failed: ${failed}\n`);

// ─── Step 2: Update URL references in the database ──────────────────
console.log("═══ Updating database URL references ═══\n");

const OLD_PREFIX = SUPABASE_STORAGE_PREFIX;
let dbUpdates = 0;

// 2a. site_settings — all URL columns
const urlColumns = ["logo_url", "logo_dark_url", "favicon_url", "full_logo_url", "meta_partner_badge_url", "og_image_url"];
const { data: settings } = await supabase.from("site_settings").select("id, " + urlColumns.join(", ")).limit(1).single();

if (settings) {
  const patch = {};
  let changed = false;
  for (const col of urlColumns) {
    const val = settings[col];
    if (val && val.includes("supabase.co/storage")) {
      const path = val.replace(OLD_PREFIX, "");
      patch[col] = getS3PublicUrl(path);
      changed = true;
      console.log(`  site_settings.${col}: ✓`);
    }
  }
  if (changed) {
    const { error } = await supabase.from("site_settings").update(patch).eq("id", settings.id);
    if (error) console.log(`  ✗ site_settings update failed: ${error.message}`);
    else dbUpdates++;
  }
}

// 2b. landing_sections — image_url, images[], images_secondary[]
const { data: sections } = await supabase.from("landing_sections").select("id, image_url, images, images_secondary");

if (sections) {
  for (const sec of sections) {
    const patch = {};
    let changed = false;

    if (sec.image_url && sec.image_url.includes("supabase.co/storage")) {
      patch.image_url = getS3PublicUrl(sec.image_url.replace(OLD_PREFIX, ""));
      changed = true;
    }

    if (sec.images && Array.isArray(sec.images)) {
      const updated = sec.images.map((u) =>
        typeof u === "string" && u.includes("supabase.co/storage")
          ? getS3PublicUrl(u.replace(OLD_PREFIX, ""))
          : u
      );
      if (JSON.stringify(updated) !== JSON.stringify(sec.images)) {
        patch.images = updated;
        changed = true;
      }
    }

    if (sec.images_secondary && Array.isArray(sec.images_secondary)) {
      const updated = sec.images_secondary.map((u) =>
        typeof u === "string" && u.includes("supabase.co/storage")
          ? getS3PublicUrl(u.replace(OLD_PREFIX, ""))
          : u
      );
      if (JSON.stringify(updated) !== JSON.stringify(sec.images_secondary)) {
        patch.images_secondary = updated;
        changed = true;
      }
    }

    if (changed) {
      const { error } = await supabase.from("landing_sections").update(patch).eq("id", sec.id);
      if (error) console.log(`  ✗ landing_sections[${sec.id}]: ${error.message}`);
      else { console.log(`  landing_sections[${sec.id}]: ✓`); dbUpdates++; }
    }
  }
}

// 2c. landing_images — url
const { data: images } = await supabase.from("landing_images").select("id, url");
if (images) {
  for (const img of images) {
    if (img.url && img.url.includes("supabase.co/storage")) {
      const newUrl = getS3PublicUrl(img.url.replace(OLD_PREFIX, ""));
      const { error } = await supabase.from("landing_images").update({ url: newUrl }).eq("id", img.id);
      if (error) console.log(`  ✗ landing_images[${img.id}]: ${error.message}`);
      else { console.log(`  landing_images[${img.id}]: ✓`); dbUpdates++; }
    }
  }
}

// 2d. messages.media_url
const { data: msgs } = await supabase.from("messages").select("id, media_url").like("media_url", "%supabase.co/storage%");
if (msgs && msgs.length > 0) {
  for (const msg of msgs) {
    const newUrl = getS3PublicUrl(msg.media_url.replace(OLD_PREFIX, ""));
    const { error } = await supabase.from("messages").update({ media_url: newUrl }).eq("id", msg.id);
    if (error) console.log(`  ✗ messages[${msg.id}]: ${error.message}`);
    else { console.log(`  messages[${msg.id}]: ✓`); dbUpdates++; }
  }
} else {
  console.log("  messages: no Supabase URLs");
}

// 2e. profiles.avatar_url
const { data: avatars } = await supabase.from("profiles").select("user_id, avatar_url").like("avatar_url", "%supabase.co/storage%");
if (avatars && avatars.length > 0) {
  for (const p of avatars) {
    const newUrl = getS3PublicUrl(p.avatar_url.replace(OLD_PREFIX, ""));
    const { error } = await supabase.from("profiles").update({ avatar_url: newUrl }).eq("user_id", p.user_id);
    if (error) console.log(`  ✗ profiles[${p.user_id}]: ${error.message}`);
    else { console.log(`  profiles[${p.user_id}]: ✓`); dbUpdates++; }
  }
} else {
  console.log("  profiles: no Supabase URLs");
}

// ─── Summary ────────────────────────────────────────────────────────
console.log(`\n═══ Migration Complete ═══`);
console.log(`  Files migrated:  ${success}/${FILES.length}`);
console.log(`  DB rows updated: ${dbUpdates}`);
console.log(`  Failed uploads:  ${failed}`);
if (failed === 0) {
  console.log(`\n  ✅ All files migrated and all URLs updated!`);
} else {
  console.log(`\n  ⚠️  Some files failed — check errors above.`);
}
console.log("");
