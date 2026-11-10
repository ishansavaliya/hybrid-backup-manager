package license

import "time"

// Mode is what the agent is allowed to do.
type Mode string

const (
	ModeFull        Mode = "full"
	ModeRestoreOnly Mode = "restore_only"
	ModeSignedOut   Mode = "signed_out"
)

const (
	// BadgeDays is the window before expiry in which the badge is shown.
	BadgeDays = 10
	// ClockSkew is the tolerated backwards clock movement vs the high-water mark.
	ClockSkew = 5 * time.Minute
	// ServerSkewTolerance is how far the PC clock may run behind the server's
	// issuedAt at a successful sync and still count as correct. After a sync the
	// high-water mark is max(now, issuedAt - ServerSkewTolerance), so a clock up to
	// 24 h slow keeps full mode (at most 24 h of extra membership) while a clock
	// further behind is restore-only with reason "clock" until it is corrected.
	ServerSkewTolerance = 24 * time.Hour
)

// State is the evaluated license state. Reason is one of "", "expired",
// "blocked", "clock", "pc_limit", "signed_out".
type State struct {
	Mode      Mode
	Reason    string
	ExpiresAt *time.Time
	DaysLeft  int
	ShowBadge bool
}

// Evaluate decides the mode. Unknown status or mode values fail closed.
func Evaluate(p *Payload, now, highWater time.Time) State {
	if p == nil {
		return State{Mode: ModeSignedOut, Reason: "signed_out"}
	}
	exp := p.ExpiresAt
	restore := func(reason string) State {
		return State{Mode: ModeRestoreOnly, Reason: reason, ExpiresAt: &exp}
	}
	if now.Before(highWater.Add(-ClockSkew)) {
		return restore("clock")
	}
	if p.Status != "active" {
		return restore("blocked")
	}
	if now.After(exp) {
		return restore("expired")
	}
	days := int((exp.Sub(now) + 24*time.Hour - 1) / (24 * time.Hour))
	s := State{Mode: ModeFull, ExpiresAt: &exp, DaysLeft: days, ShowBadge: days <= BadgeDays}
	if p.Mode != "full" {
		s.Mode, s.Reason, s.ShowBadge = ModeRestoreOnly, "pc_limit", false
	}
	return s
}
