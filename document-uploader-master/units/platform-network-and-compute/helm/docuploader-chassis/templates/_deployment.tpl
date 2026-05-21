{{/*
docuploader-chassis: Deployment template wired for IRSA, OTLP, and Guaranteed-QoS.

Usage from a consumer chart:
  {{ include "docuploader-chassis.deployment" . }}

Consumer charts SHOULD set:
  .Values.resources.requests.cpu / .memory
  .Values.resources.limits.cpu / .memory     (equal to requests for Guaranteed QoS)
*/}}
{{- define "docuploader-chassis.deployment" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.workloadName }}
  namespace: {{ .Release.Namespace }}
  labels:
    app.kubernetes.io/name: {{ .Values.workloadName }}
    app.kubernetes.io/component: docuploader
spec:
  replicas: {{ .Values.replicaCount | default 1 }}
  selector:
    matchLabels:
      app.kubernetes.io/name: {{ .Values.workloadName }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .Values.workloadName }}
    spec:
      serviceAccountName: {{ .Values.workloadName }}
      containers:
        - name: {{ .Values.workloadName }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          env:
            {{- include "docuploader-chassis.otlpEnvs" . | nindent 12 }}
            {{- with .Values.extraEnv }}
            {{- toYaml . | nindent 12 }}
            {{- end }}
          {{- with .Values.resources }}
          resources:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.probes.liveness }}
          livenessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.probes.readiness }}
          readinessProbe:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.extraVolumeMounts }}
          volumeMounts:
            {{- toYaml . | nindent 12 }}
          {{- end }}
      {{- with .Values.extraVolumes }}
      volumes:
        {{- toYaml . | nindent 8 }}
      {{- end }}
{{- end -}}
