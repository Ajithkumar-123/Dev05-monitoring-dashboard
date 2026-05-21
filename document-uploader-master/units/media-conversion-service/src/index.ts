import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "media-conversion-service" } });
const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const QUEUE_URL = req("MEDIA_QUEUE_URL");
const OUTPUT_ASSEMBLY_QUEUE_URL = req("OUTPUT_ASSEMBLY_QUEUE_URL");
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

function ffmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(Object.assign(new Error(`ffmpeg exit ${code}`), { name: "DocumentProcessingError" }))));
  });
}

async function handle(msg: { documentId: string; s3Bucket: string; s3Key: string }) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "media-"));
  try {
    const inPath = path.join(work, "input.bin");
    const outPath = path.join(work, "output.mp4");
    const obj = await s3.send(new GetObjectCommand({ Bucket: msg.s3Bucket, Key: msg.s3Key }));
    await fs.writeFile(inPath, Buffer.from(await obj.Body!.transformToByteArray()));
    await ffmpeg(["-y", "-i", inPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", outPath]);

    const outKey = `${msg.documentId}/media.mp4`;
    await s3.send(new PutObjectCommand({
      Bucket: PIPELINE_BUCKET, Key: outKey, Body: await fs.readFile(outPath), ContentType: "video/mp4",
    }));
    await sqs.send(new SendMessageCommand({
      QueueUrl: OUTPUT_ASSEMBLY_QUEUE_URL,
      MessageBody: JSON.stringify({ documentId: msg.documentId, intermediateKeys: [outKey], schemaVersion: 1 }),
    }));
    logger.info({ documentId: msg.documentId, outKey }, "media converted");
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

run().catch((err) => { logger.fatal({ err }); process.exit(1); });
