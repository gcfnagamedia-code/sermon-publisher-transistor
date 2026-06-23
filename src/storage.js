// Archives the final mp3 to Cloudflare R2 (S3-compatible object storage).

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { config } from "./config.js";

function makeClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.r2.accessKeyId,
      secretAccessKey: config.r2.secretAccessKey,
    },
  });
}

/**
 * Upload an mp3 to the configured R2 bucket.
 * @returns {Promise<{key:string, bucket:string}>}
 */
export async function archiveMp3(mp3Path, deps = {}) {
  const client = deps.client ?? makeClient();
  const key = basename(mp3Path);
  const body = await readFile(mp3Path);

  await client.send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: body,
      ContentType: "audio/mpeg",
    })
  );

  return { key, bucket: config.r2.bucket };
}
