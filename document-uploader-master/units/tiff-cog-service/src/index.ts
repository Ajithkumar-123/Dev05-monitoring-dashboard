import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import gdal from "gdal-async";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "tiff-cog-service" } });
const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const QUEUE_URL = req("TIFF_COG_QUEUE_URL");
const CONVERT_IMAGE_QUEUE_URL = req("CONVERT_IMAGE_QUEUE_URL");
const PIPELINE_BUCKET = req("PIPELINE_BUCKET");

function req(n: string): string { const v = process.env[n]; if (!v) throw new Error(n); return v; }

async function run() {
  logger.info({ queueUrl: QUEUE_URL }, "starting");
  let running = true;
  process.on("SIGINT", () => (running = false));
  process.on("SIGTERM", () => (running = false));
  while (running) {
    const res = await sqs.send(new ReceiveMessageCommand({ QueueUrl: QUEUE_URL, MaxNumberOfMessages: 1, WaitTimeSeconds: 20 }));
    for (const m of res.Messages ?? []) {
      try {
        await handle(JSON.parse(m.Body ?? "{}"));
        await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: m.ReceiptHandle }));
      } catch (err) {
        logger.warn({ err }, "handle failed; redrive");
      }
    }
  }
}

async function handle(msg: { documentId: string; s3Bucket: string; s3Key: string }) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "tiffcog-"));
  try {
    const inPath = path.join(work, "input.tif");
    const outPath = path.join(work, "output.cog.tif");
    const obj = await s3.send(new GetObjectCommand({ Bucket: msg.s3Bucket, Key: msg.s3Key }));
    await fs.writeFile(inPath, Buffer.from(await obj.Body!.transformToByteArray()));

    const src = await gdal.openAsync(inPath);
    const drv = gdal.drivers.get("COG");
    if (!drv) throw new Error("COG driver unavailable in gdal-async build");
    const dst = await drv.createCopyAsync(outPath, src, { TILING_SCHEME: "GoogleMapsCompatible", BLOCKSIZE: "256", COMPRESS: "LZW" });
    dst.close();
    src.close();

    const outKey = `${msg.documentId}/cog.tif`;
    await s3.send(new PutObjectCommand({
      Bucket: PIPELINE_BUCKET, Key: outKey,
      Body: await fs.readFile(outPath), ContentType: "image/tiff",
    }));
    await sqs.send(new SendMessageCommand({
      QueueUrl: CONVERT_IMAGE_QUEUE_URL,
      MessageBody: JSON.stringify({ ...msg, s3Bucket: PIPELINE_BUCKET, s3Key: outKey, route: "convert/tiff-image", schemaVersion: 1 }),
    }));
    logger.info({ documentId: msg.documentId, outKey }, "COG converted");
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

run().catch((err) => { logger.fatal({ err }); process.exit(1); });
