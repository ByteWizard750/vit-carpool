#!/usr/bin/env ts-node
/**
 * VIT Carpool - S3 Upload Migration Script
 * Idempotently synchronizes legacy local uploads to the production AWS S3 bucket.
 * 
 * Usage:
 *   pnpm ts-node scripts/migrate-uploads-to-s3.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

async function migrateUploads() {
  const bucketName = process.env.S3_BUCKET_NAME;
  const region = process.env.S3_REGION || 'ap-south-1';

  if (!bucketName) {
    console.error('[-] Error: S3_BUCKET_NAME environment variable is required.');
    process.exit(1);
  }

  const s3 = new S3Client({
    region,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined, // Falls back to EC2 IAM Instance Profile
  });

  const baseDir = process.env.UPLOADS_DIR
    ? path.resolve(process.env.UPLOADS_DIR)
    : path.resolve(process.cwd(), 'uploads');

  console.log('============================================================');
  console.log(' Starting S3 Uploads Migration');
  console.log(` Target Bucket: ${bucketName} (${region})`);
  console.log(` Local Source:  ${baseDir}`);
  console.log('============================================================');

  let uploadedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const category of ['avatars', 'vehicles']) {
    const dir = path.join(baseDir, category);
    if (!fs.existsSync(dir)) continue;

    const files = await fs.promises.readdir(dir);
    for (const filename of files) {
      if (filename.startsWith('.')) continue; // ignore hidden files like .gitkeep

      const filePath = path.join(dir, filename);
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) continue;

      const key = `${category}/${filename}`;

      // Check if already in S3
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
        console.log(`  [SKIP] Already in S3: ${key}`);
        skippedCount++;
        continue;
      } catch (err: any) {
        // Not in S3, proceed with upload
      }

      try {
        const fileBuffer = await fs.promises.readFile(filePath);
        const ext = path.extname(filename).toLowerCase();
        let contentType = 'image/jpeg';
        if (ext === '.png') contentType = 'image/png';
        else if (ext === '.webp') contentType = 'image/webp';

        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            Body: fileBuffer,
            ContentType: contentType,
          }),
        );

        console.log(`  [UPLOADED] ${key} (${fileBuffer.length} bytes)`);
        uploadedCount++;
      } catch (uploadErr: any) {
        console.error(`  [-] FAILED ${key}: ${uploadErr.message}`);
        errorCount++;
      }
    }
  }

  console.log('============================================================');
  console.log(` Migration Complete!`);
  console.log(` Uploaded: ${uploadedCount}`);
  console.log(` Skipped:  ${skippedCount}`);
  console.log(` Errors:   ${errorCount}`);
  console.log('============================================================');
}

migrateUploads().catch((err) => {
  console.error('Fatal migration failure:', err);
  process.exit(1);
});

