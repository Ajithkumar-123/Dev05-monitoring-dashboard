import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import sharp from "sharp";
import PDFDocument from "pdfkit";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "image-tiff-conversion-service" } });
const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const QUEUE_URL = req("CONVERT_IMAGE_QUEUE_URL");
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

/**
 * Single-page image → 1-page PDF. Sharp normalises orientation/colour; pdfkit
 * wraps the bytes in a PDF container.
 */
async function handle(msg: { documentId: string; s3Bucket: string; s3Key: string }) {
  const obj = await s3.send(new GetObjectCommand({ Bucket: msg.s3Bucket, Key: msg.s3Key }));
  const bytes = Buffer.from(await obj.Body!.transformToByteArray());
  const normalized = await sharp(bytes).rotate().jpeg({ quality: 90 }).toBuffer();
  const metadata = await sharp(normalized).metadata();

  const pdf = new PDFDocument({ size: [metadata.width ?? 612, metadata.height ?? 792], margin: 0 });
  const chunks: Buffer[] = [];
  pdf.on("data", (c) => chunks.push(c));
  const done = new Promise<void>((resolve) => pdf.on("end", () => resolve()));
  pdf.image(normalized, 0, 0, { width: metadata.width, height: metadata.height });
  pdf.end();
  await done;
  const outBytes = Buffer.concat(chunks);

  const outKey = `${msg.documentId}/image.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: PIPELINE_BUCKET, Key: outKey, Body: outBytes, ContentType: "application/pdf" }));
  await sqs.send(new SendMessageCommand({
    QueueUrl: OUTPUT_ASSEMBLY_QUEUE_URL,
    MessageBody: JSON.stringify({ documentId: msg.documentId, intermediateKeys: [outKey], schemaVersion: 1 }),
  }));
  logger.info({ documentId: msg.documentId, outKey }, "image converted");
}

run().catch((err) => { logger.fatal({ err }); process.exit(1); });
