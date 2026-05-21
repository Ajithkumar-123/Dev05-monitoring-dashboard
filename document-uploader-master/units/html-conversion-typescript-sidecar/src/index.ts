import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "html-conversion-typescript-sidecar" } });
const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const QUEUE_URL = req("CONVERT_HTML_QUEUE_URL");
const OUTPUT_ASSEMBLY_QUEUE_URL = req("OUTPUT_ASSEMBLY_QUEUE_URL");
const PIPELINE_BUCKET = req("PIPELINE_BUCKET");
const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3000";

function req(n: string): string { const v = process.env[n]; if (!v) throw new Error(n); return v; }

async function run() {
  logger.info({ queueUrl: QUEUE_URL, gotenberg: GOTENBERG_URL }, "starting");
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
  const obj = await s3.send(new GetObjectCommand({ Bucket: msg.s3Bucket, Key: msg.s3Key }));
  const html = Buffer.from(await obj.Body!.transformToByteArray());

  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");

  const resp = await fetch(`${GOTENBERG_URL}/forms/chromium/convert/html`, { method: "POST", body: form });
  if (!resp.ok) throw Object.assign(new Error(`gotenberg: ${resp.status}`), { name: "DocumentProcessingError" });
  const pdf = Buffer.from(await resp.arrayBuffer());

  const outKey = `${msg.documentId}/html.pdf`;
  await s3.send(new PutObjectCommand({ Bucket: PIPELINE_BUCKET, Key: outKey, Body: pdf, ContentType: "application/pdf" }));
  await sqs.send(new SendMessageCommand({
    QueueUrl: OUTPUT_ASSEMBLY_QUEUE_URL,
    MessageBody: JSON.stringify({ documentId: msg.documentId, intermediateKeys: [outKey], schemaVersion: 1 }),
  }));
  logger.info({ documentId: msg.documentId, outKey }, "html converted");
}

run().catch((err) => { logger.fatal({ err }); process.exit(1); });
