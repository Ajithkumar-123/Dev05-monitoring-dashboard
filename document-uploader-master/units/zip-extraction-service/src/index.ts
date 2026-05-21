import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import unzipper from "unzipper";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "zip-extraction-service" } });
const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const QUEUE_URL = req("ARCHIVE_QUEUE_URL");
const CLASSIFICATION_QUEUE_URL = req("CLASSIFICATION_QUEUE_URL");
const STAGING_BUCKET = req("STAGING_BUCKET");

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

/**
 * Streaming ZIP extraction: peak RAM is bounded by the per-entry chunk size,
 * not by archive size or nesting depth.
 */
async function handle(msg: { documentId: string; tenantId: string; workspaceId: string; batchId: string; s3Bucket: string; s3Key: string }) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: msg.s3Bucket, Key: msg.s3Key }));
  const stream = obj.Body as Readable;
  let count = 0;
  await new Promise<void>((resolve, reject) => {
    stream
      .pipe(unzipper.Parse())
      .on("entry", async (entry: unzipper.Entry) => {
        if (entry.type === "Directory") { entry.autodrain(); return; }
        const childId = randomUUID();
        const childKey = `${msg.tenantId}/${msg.batchId}/${childId}`;
        await s3.send(new PutObjectCommand({
          Bucket: STAGING_BUCKET, Key: childKey, Body: entry, ContentType: "application/octet-stream",
        }));
        await sqs.send(new SendMessageCommand({
          QueueUrl: CLASSIFICATION_QUEUE_URL,
          MessageBody: JSON.stringify({
            documentId: childId, tenantId: msg.tenantId, workspaceId: msg.workspaceId,
            batchId: msg.batchId, s3Bucket: STAGING_BUCKET, s3Key: childKey,
            parentDocumentId: msg.documentId, schemaVersion: 1,
          }),
        }));
        count++;
      })
      .on("error", reject)
      .on("finish", resolve);
  });
  logger.info({ documentId: msg.documentId, childCount: count }, "zip fan-out complete");
}

run().catch((err) => { logger.fatal({ err }); process.exit(1); });
