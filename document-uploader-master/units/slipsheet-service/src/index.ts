import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "slipsheet-service" } });
const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const QUEUE_URL = req("SLIPSHEET_QUEUE_URL");
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

async function handle(msg: { documentId: string; filename: string; reason: string; mime: string }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Slipsheet", { x: 72, y: 720, size: 24, font });
  page.drawText(`Document: ${msg.filename}`, { x: 72, y: 680, size: 12, font });
  page.drawText(`MIME: ${msg.mime ?? "unknown"}`, { x: 72, y: 660, size: 12, font });
  page.drawText(`Reason: ${msg.reason ?? "unsupported"}`, { x: 72, y: 640, size: 12, font });
  const bytes = await pdf.save();
  const key = `${msg.documentId}/slipsheet.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: PIPELINE_BUCKET, Key: key, Body: Buffer.from(bytes), ContentType: "application/pdf" }));
  await sqs.send(new SendMessageCommand({
    QueueUrl: OUTPUT_ASSEMBLY_QUEUE_URL,
    MessageBody: JSON.stringify({ documentId: msg.documentId, intermediateKeys: [key], nativeTrigger: "SLIPSHEET", schemaVersion: 1 }),
  }));
  logger.info({ documentId: msg.documentId, key, nativeTrigger: "SLIPSHEET" }, "slipsheet generated");
}

run().catch((err) => { logger.fatal({ err }); process.exit(1); });
