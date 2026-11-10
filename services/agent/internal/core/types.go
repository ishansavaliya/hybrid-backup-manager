package core

import (
	"encoding/json"
	"errors"
	"time"
)

// Pipe error codes. Cloud API errors use their upper-cased server code instead.
const (
	CodeOperationFailed    = "OPERATION_FAILED"
	CodeMembershipInactive = "MEMBERSHIP_INACTIVE"
	CodeOffline            = "OFFLINE"
)

// ErrMembershipInactive refuses backup-creating work while not in full mode.
var ErrMembershipInactive = errors.New("Membership inactive: new backups are paused")

type Destination struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Repository string `json:"repository"`
	// PasswordFile is optional: empty means Bakvion manages the key
	// (generated, sealed with DPAPI on Windows, exported in the recovery kit).
	PasswordFile string `json:"passwordFile"`
	// password is the resolved managed key for one engine call; never stored or sent.
	password string
}

// Schedule kinds: "manual", "hourly", "daily", "weekly" (times in local time).
type Schedule struct {
	Kind string `json:"kind"`
	Time string `json:"time,omitempty"` // "HH:MM" for daily/weekly
	Days []int  `json:"days,omitempty"` // 0=Sunday … 6=Saturday for weekly
}

// Retention keeps the newest snapshot always, plus the given daily/weekly/monthly ones.
type Retention struct {
	Enabled bool `json:"enabled"`
	Daily   int  `json:"daily"`
	Weekly  int  `json:"weekly"`
	Monthly int  `json:"monthly"`
}
type Plan struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Sources      []string      `json:"sources"`
	Exclusions   []string      `json:"exclusions"`
	Destinations []Destination `json:"destinations"`
	Schedule     Schedule      `json:"schedule"`
	Retention    Retention     `json:"retention"`
}
type Execution struct {
	ID            string  `json:"id"`
	PlanID        string  `json:"planId"`
	DestinationID string  `json:"destinationId"`
	State         string  `json:"state"`
	SnapshotID    string  `json:"snapshotId"`
	StartedAt     string  `json:"startedAt"`
	FinishedAt    *string `json:"finishedAt"`
	Error         string  `json:"error"`
	// Notes carries non-fatal information (e.g. cleanup result) for history.
	Notes string `json:"notes"`
}
type Snapshot struct {
	ID       string    `json:"id"`
	Time     time.Time `json:"time"`
	Paths    []string  `json:"paths"`
	Hostname string    `json:"hostname"`
	Tags     []string  `json:"tags,omitempty"`
}
type Node struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Path string `json:"path"`
	Size int64  `json:"size"`
}
type Request struct {
	Version int             `json:"version"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params"`
}
type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
type Response struct {
	Version int       `json:"version"`
	Result  any       `json:"result,omitempty"`
	Error   *APIError `json:"error,omitempty"`
}
