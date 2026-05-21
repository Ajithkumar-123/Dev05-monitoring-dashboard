package workspaces

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
)

func TestWorkspace_AttributevalueRoundtrip(t *testing.T) {
	now := time.Date(2026, 5, 11, 12, 0, 0, 0, time.UTC)
	original := &Workspace{
		WorkspaceID: "ws-001",
		TenantID:    "tenant-a",
		Status:      StatusActive,
		RetentionPolicy: RetentionPolicy{
			InputRetentionDays: 7,
		},
		EncryptionConfig: EncryptionConfig{
			KmsAliasName: "alias/docuploader-tenant-ws-001",
		},
		PipelineConfig: PipelineConfig{
			AllowedExtensions:         []string{"pdf", "docx"},
			ForcedSlipsheetExtensions: []string{"csv", "ods"},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	item, err := attributevalue.MarshalMap(original)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var round Workspace
	if err := attributevalue.UnmarshalMap(item, &round); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if round.WorkspaceID != original.WorkspaceID {
		t.Errorf("WorkspaceID drift: got %q want %q", round.WorkspaceID, original.WorkspaceID)
	}
	if round.TenantID != original.TenantID {
		t.Errorf("TenantID drift")
	}
	if round.Status != original.Status {
		t.Errorf("Status drift: got %q want %q", round.Status, original.Status)
	}
	if round.RetentionPolicy.InputRetentionDays != original.RetentionPolicy.InputRetentionDays {
		t.Errorf("RetentionPolicy.InputRetentionDays drift")
	}
	if round.EncryptionConfig.KmsAliasName != original.EncryptionConfig.KmsAliasName {
		t.Errorf("EncryptionConfig.KmsAliasName drift")
	}
	if !equalSlices(round.PipelineConfig.ForcedSlipsheetExtensions, original.PipelineConfig.ForcedSlipsheetExtensions) {
		t.Errorf("ForcedSlipsheetExtensions drift: got %v want %v",
			round.PipelineConfig.ForcedSlipsheetExtensions, original.PipelineConfig.ForcedSlipsheetExtensions)
	}
	if !round.CreatedAt.Equal(original.CreatedAt) {
		t.Errorf("CreatedAt drift: got %v want %v", round.CreatedAt, original.CreatedAt)
	}
}

func TestTableNameIsBinding(t *testing.T) {
	// Naming convention: `docuploader` is the only acceptable token in
	// resource identifiers per tech-environment.md. A drift to "unified"
	// or a mixed form is a binding violation.
	if TableName != "docuploader-api-workspaces" {
		t.Fatalf("TableName drift: got %q; binding rule requires docuploader-api-workspaces", TableName)
	}
}

func equalSlices(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
