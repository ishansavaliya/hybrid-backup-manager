//go:build !windows

package main

import (
	"context"
	"errors"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/core"
)

func serve(context.Context, *core.Agent, string) error {
	return errors.New("named pipe server is Windows-only; use the offline CLI request/work commands")
}
func service(*core.Agent, string) error { return errors.New("Windows SCM service is Windows-only") }
