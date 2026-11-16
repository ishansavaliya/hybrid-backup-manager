package core

import (
	"testing"

	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud"
)

func TestSubmitLeadWorksSignedOutAndAddsInstallID(t *testing.T) {
	e := newAccountEnv(t)
	r := e.call(t, "submitLead", map[string]any{
		"name": "Asha", "business": "Mehta Traders", "phone": "9876543210",
		"city": "Ahmedabad", "pcs": 2, "source": "website", "installId": "spoofed",
	})
	if r.Error != nil {
		t.Fatalf("submitLead: %+v", r.Error)
	}
	if len(e.fake.leads) != 1 {
		t.Fatalf("leads sent = %d", len(e.fake.leads))
	}
	got := e.fake.leads[0]
	want := e.status(t).InstallID
	if got.Source != "app" || got.InstallID != want || got.Business != "Mehta Traders" || got.PCs != 2 {
		t.Fatalf("unexpected lead %+v (install %s)", got, want)
	}
}

func TestSubmitLeadOfflineMapsToOffline(t *testing.T) {
	e := newAccountEnv(t)
	e.fake.leadErr = cloud.ErrOffline
	expectCode(t, e.call(t, "submitLead", map[string]any{"name": "A", "business": "B", "phone": "9876543210"}), "OFFLINE")
}

func TestSubmitLeadServerErrorCodePassesThrough(t *testing.T) {
	e := newAccountEnv(t)
	e.fake.leadErr = &cloud.APIError{Status: 429, Code: "rate_limited", Message: "Too many requests. Please try again later."}
	expectCode(t, e.call(t, "submitLead", map[string]any{"name": "A", "business": "B", "phone": "9876543210"}), "RATE_LIMITED")
}
