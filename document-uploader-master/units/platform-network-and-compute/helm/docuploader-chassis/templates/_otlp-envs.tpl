{{/*
Standard OTLP environment-variable block. Sets the OpenTelemetry resource
attributes required by every docuploader workload per
`tech-environment.md` § Observability Stack.
*/}}
{{- define "docuploader-chassis.otlpEnvs" -}}
- name: OTEL_EXPORTER_OTLP_ENDPOINT
  value: {{ .Values.otlp.endpoint | quote }}
- name: OTEL_EXPORTER_OTLP_PROTOCOL
  value: grpc
- name: OTEL_SERVICE_NAME
  value: {{ .Values.workloadName | quote }}
- name: OTEL_SERVICE_VERSION
  value: {{ .Values.image.tag | quote }}
- name: OTEL_RESOURCE_ATTRIBUTES
  value: "service.namespace={{ .Values.otlp.serviceNamespace }},deployment.environment={{ .Values.environment | default "sandbox" }}"
{{- end -}}
