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
	ID           string `json:"id"`
	Name         string `json:"name"`
	Repository   string `json:"repository"`
	PasswordFile string `json:"passwordFile"`
}
type Plan struct {
	ID           string        `json:"id"`
	Name         string        `json:"name"`
	Sources      []string      `json:"sources"`
	Exclusions   []string      `json:"exclusions"`
	Destinations []Destination `json:"destinations"`
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
