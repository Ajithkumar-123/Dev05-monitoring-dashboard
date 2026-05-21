import { DeleteMessageCommand, ReceiveMessageCommand, SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { StartDocumentAnalysisCommand, TextractClient } from "@aws-sdk/client-textract";
import { newDynamoDocumentClient, tasktokens } from "@docuploader/data-access";
import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info", base: { service: "ocr-service" } });
const region = process.env.AWS_REGION ?? "eu-west-1";
const sqs = new SQSClient({ region });
const textract = new TextractClient({ region });
const tokens = new tasktokens.Client(newDynamoDocumentClient(region));

const QUEUE_URL = req("OCR_DIRECT_QUEUE_URL");
const PDF_PROCESSING_QUEUE_URL = req("PDF_PROCESSING_QUEUE_URL");
const TEXTRACT_SNS_TOPIC_ARN = req("TEXTRACT_SNS_TOPIC_ARN");
const TEXTRACT_ROLE_ARN = req("TEXTRACT_ROLE_ARN");

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
  const out = await textract.send(new StartDocumentAnalysisCommand({
    DocumentLocation: { S3Object: { Bucket: msg.s3Bucket, Name: msg.s3Key } },
    FeatureTypes: ["FORMS", "TABLES"],
    NotificationChannel: { SNSTopicArn: TEXTRACT_SNS_TOPIC_ARN, RoleArn: TEXTRACT_ROLE_ARN },
  }));
  const jobId = out.JobId ?? "";
  await tokens.put({
    taskToken: jobId,
    documentId: msg.documentId,
    executionId: "",
    jobId,
    createdAt: new Date().toISOString(),
    expiresAt: 0,
  });
  await sqs.send(new SendMessageCommand({
    QueueUrl: PDF_PROCESSING_QUEUE_URL,
    MessageBody: JSON.stringify({ ...msg, jobId, route: "ocr-direct", schemaVersion: 1 }),
  }));
  logger.info({ documentId: msg.documentId, jobId }, "textract started");
}

run().catch((err) => { logger.fatal({ err }); process.exit(1); });
