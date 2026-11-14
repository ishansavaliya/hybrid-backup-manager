//go:build !windows

package main

import (
	"context"
	"errors"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/core"
	"os"
	"runtime"
)

func serve(context.Context, *core.Agent, string) error {
	return errors.New("named pipe server is Windows-only; use the offline CLI request/work commands")
}
func service(*core.Agent, string) error { return errors.New("Windows SCM service is Windows-only") }
func installService() error             { return errors.New("installing the service is Windows-only") }
func uninstallService() error           { return errors.New("removing the service is Windows-only") }

// machineInfo returns the host name and OS name, each at most 64 bytes.
func machineInfo() (string, string) {
	host, _ := os.Hostname()
	if len(host) > 64 {
		host = host[:64]
	}
	return host, runtime.GOOS
}
