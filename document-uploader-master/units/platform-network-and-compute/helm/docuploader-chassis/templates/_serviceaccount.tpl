{{/*
docuploader-chassis: ServiceAccount template with IRSA annotation.

Usage from a consumer chart:
  {{ include "docuploader-chassis.serviceAccount" . }}

Required values:
  .Values.workloadName  - K8s name of the workload
  .Values.iamRoleArn    - IAM role ARN to bind via IRSA
*/}}
{{- define "docuploader-chassis.serviceAccount" -}}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ .Values.workloadName | required "workloadName is required" }}
  namespace: {{ .Release.Namespace }}
  annotations:
    eks.amazonaws.com/role-arn: {{ .Values.iamRoleArn | required "iamRoleArn is required" }}
  labels:
    app.kubernetes.io/name: {{ .Values.workloadName }}
    app.kubernetes.io/component: docuploader
    app.kubernetes.io/managed-by: helm
{{- end -}}
