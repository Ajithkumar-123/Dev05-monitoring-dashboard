import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { PDFDocument } from "pdf-lib";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "output-assembly-service" } });
const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const s3 = new S3Client({ region });
const QUEUE_URL = req("OUTPUT_ASSEMBLY_QUEUE_URL");
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

async function handle(msg: { documentId: string; intermediateKeys: string[]; pipelineBucket?: string }) {
  const bucket = msg.pipelineBucket ?? PIPELINE_BUCKET;
  const merged = await PDFDocument.create();
  for (const key of msg.intermediateKeys) {
    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = Buffer.from(await obj.Body!.transformToByteArray());
    const src = await PDFDocument.load(bytes);
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
  }
  const outKey = `${msg.documentId}/searchable.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: bucket, Key: outKey, Body: Buffer.from(await merged.save()),
    ContentType: "application/pdf",
  }));
  logger.info({ documentId: msg.documentId, outKey, pageCount: merged.getPageCount() }, "output assembled");
}

run().catch((err) => { logger.fatal({ err }); process.exit(1); });
