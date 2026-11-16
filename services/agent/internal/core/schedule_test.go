package core

import (
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestNextDue(t *testing.T) {
	loc := time.FixedZone("IST", 330*60)
	at := func(s string) time.Time {
		v, err := time.ParseInLocation("2006-01-02 15:04", s, loc)
		if err != nil {
			t.Fatal(err)
		}
		return v
	}
	cases := []struct {
		name  string
		s     Schedule
		after string
		want  string
		has   bool
	}{
		{"manual", Schedule{Kind: "manual"}, "2026-11-10 10:00", "", false},
		{"empty is manual", Schedule{}, "2026-11-10 10:00", "", false},
		{"hourly", Schedule{Kind: "hourly"}, "2026-11-10 10:20", "2026-11-10 11:00", true},
		{"hourly on the hour", Schedule{Kind: "hourly"}, "2026-11-10 11:00", "2026-11-10 12:00", true},
		{"daily later today", Schedule{Kind: "daily", Time: "13:00"}, "2026-11-10 10:00", "2026-11-10 13:00", true},
		{"daily tomorrow", Schedule{Kind: "daily", Time: "13:00"}, "2026-11-10 13:00", "2026-11-11 13:00", true},
		// 2026-11-10 is a Tuesday (2). Mon=1, Fri=5.
		{"weekly next chosen day", Schedule{Kind: "weekly", Time: "09:30", Days: []int{1, 5}}, "2026-11-10 10:00", "2026-11-13 09:30", true},
		{"weekly same day later", Schedule{Kind: "weekly", Time: "18:00", Days: []int{2}}, "2026-11-10 10:00", "2026-11-10 18:00", true},
		{"weekly wraps a week", Schedule{Kind: "weekly", Time: "08:00", Days: []int{2}}, "2026-11-10 10:00", "2026-11-17 08:00", true},
	}
	for _, c := range cases {
		got, has := NextDue(c.s, at(c.after))
		if has != c.has || (has && !got.Equal(at(c.want))) {
			t.Errorf("%s: got %v %v, want %s %v", c.name, got, has, c.want, c.has)
		}
	}
}

func TestValidateScheduleAndRetention(t *testing.T) {
	bad := []Schedule{{Kind: "daily"}, {Kind: "daily", Time: "25:00"}, {Kind: "weekly", Time: "10:00"}, {Kind: "weekly", Time: "10:00", Days: []int{7}}, {Kind: "yearly"}}
	for _, s := range bad {
		if ValidateSchedule(s) == nil {
			t.Errorf("schedule %+v accepted", s)
		}
	}
	if ValidateSchedule(Schedule{Kind: "weekly", Time: "23:59", Days: []int{0, 6}}) != nil {
		t.Error("valid weekly rejected")
	}
	if ValidateRetention(Retention{Enabled: true}) == nil {
		t.Error("enabled cleanup keeping nothing accepted")
	}
	if ValidateRetention(Retention{Enabled: false}) != nil || ValidateRetention(Retention{Enabled: true, Daily: 7}) != nil {
		t.Error("valid retention rejected")
	}
	if ValidateRetention(Retention{Daily: 400}) == nil {
		t.Error("out of range retention accepted")
	}
}

func TestSchedulerQueuesDueRunsAndCatchesUpOnce(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	p := e.plan(t)
	p.Schedule = Schedule{Kind: "hourly"}
	if r := e.call(t, "savePlan", p); r.Error != nil {
		t.Fatalf("savePlan: %+v", r.Error)
	}
	q, err := e.a.SchedulerTick()
	if err != nil || len(q) != 0 {
		t.Fatalf("queued before due: %v %v", q, err)
	}
	// PC "off" for five hours: one catch-up run, not five.
	e.clock.Set(e.clock.Now().Add(5 * time.Hour))
	q, err = e.a.SchedulerTick()
	if err != nil || len(q) != 1 {
		t.Fatalf("catch-up queued %v, %v", q, err)
	}
	q, _ = e.a.SchedulerTick()
	if len(q) != 0 {
		t.Fatalf("second tick queued again: %v", q)
	}
	next, err := e.a.NextRuns()
	if err != nil || next[p.ID].IsZero() {
		t.Fatalf("next run missing: %v %v", next, err)
	}
}

func TestSchedulerSkipsWhileMembershipInactive(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	p := e.plan(t)
	p.Schedule = Schedule{Kind: "hourly"}
	if r := e.call(t, "savePlan", p); r.Error != nil {
		t.Fatalf("savePlan: %+v", r.Error)
	}
	e.clock.Set(e.clock.Now().Add(400 * 24 * time.Hour)) // past the license expiry
	q, err := e.a.SchedulerTick()
	if err != nil || len(q) != 0 {
		t.Fatalf("queued while expired: %v %v", q, err)
	}
}

func TestManagedKeyIsSealedAndKitNeeded(t *testing.T) {
	e := newAccountEnv(t)
	e.signIn(t)
	p := e.plan(t)
	p.Destinations[0].PasswordFile = ""
	if r := e.call(t, "savePlan", p); r.Error != nil {
		t.Fatalf("savePlan with managed key: %+v", r.Error)
	}
	if _, err := e.a.withKey(p.Destinations[0], false); err != ErrKeyMissing {
		t.Fatalf("key before setup: %v", err)
	}
	d, err := e.a.withKey(p.Destinations[0], true)
	if err != nil || len(d.password) < 40 {
		t.Fatalf("create key: %v (%d)", err, len(d.password))
	}
	var sealed []byte
	if err = e.store.DB.QueryRow(`SELECT sealed FROM destination_keys`).Scan(&sealed); err != nil {
		t.Fatal(err)
	}
	if string(sealed) == d.password || len(sealed) == 0 {
		t.Fatal("key stored unsealed")
	}
	again, err := e.a.withKey(p.Destinations[0], false)
	if err != nil || again.password != d.password {
		t.Fatalf("key not stable: %v", err)
	}
	kit, err := e.a.KitStatus()
	if err != nil || !kit.Needed {
		t.Fatalf("kit should be needed: %+v %v", kit, err)
	}
	path, err := e.a.ExportRecoveryKit(e.root)
	if err != nil || filepath.Dir(path) != e.root {
		t.Fatalf("export: %s %v", path, err)
	}
	text, err := e.a.RecoveryKit()
	if err != nil || !containsAll(text, d.password, p.Name, p.Destinations[0].Repository) {
		t.Fatalf("kit text incomplete: %v", err)
	}
	if kit, _ = e.a.KitStatus(); kit.Needed {
		t.Fatal("kit still needed after export")
	}
}

func containsAll(s string, parts ...string) bool {
	for _, p := range parts {
		if !strings.Contains(s, p) {
			return false
		}
	}
	return true
}
