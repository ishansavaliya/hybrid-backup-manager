package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/cloud"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/core"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/license"
	"io"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"
)

// version is set at build time: -ldflags "-X main.version=...".
var version = "0.1.0"

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	flags := flag.NewFlagSet("bakvion", flag.ContinueOnError)
	state := flags.String("state", core.DefaultState(), "private SQLite state path")
	binary := flags.String("restic", envOr("BAKVION_RESTIC", "restic"), "absolute restic executable path recommended")
	owner := flags.String("owner-sid", "", "authorized Windows user SID (service only)")
	repo := flags.String("repo", "", "offline recovery repository")
	password := flags.String("password-file", "", "private repository password file")
	snapshot := flags.String("snapshot", "", "full snapshot ID")
	target := flags.String("target", "", "new absolute restore directory")
	server := flags.String("server", envOr("BAKVION_SERVER_URL", cloud.DefaultBaseURL), "account server base URL")
	selection := flags.String("selection", "", "optional exact snapshot path")
	if err := flags.Parse(os.Args[1:]); err != nil {
		return err
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	args := flags.Args()
	if len(args) != 1 {
		return errors.New("usage: bakvion [flags] request|work|serve|service|recover|snapshots; flags precede command")
	}
	// Windows: read open files (Tally, Outlook) from a shadow copy.
	engine := core.Engine{Binary: *binary, FSSnapshot: runtime.GOOS == "windows"}
	if args[0] == "recover" || args[0] == "snapshots" {
		d := core.Destination{Repository: *repo, PasswordFile: *password}
		if args[0] == "snapshots" {
			s, err := engine.Snapshots(ctx, d)
			if err != nil {
				return err
			}
			return json.NewEncoder(os.Stdout).Encode(s)
		}
		count, err := engine.Restore(ctx, d, *snapshot, *target, *selection)
		if err != nil {
			return err
		}
		return json.NewEncoder(os.Stdout).Encode(map[string]any{"verifiedFiles": count, "target": *target})
	}
	store, err := core.OpenStore(*state)
	if err != nil {
		return err
	}
	defer store.DB.Close()
	a := &core.Agent{Store: store, Engine: engine, Cloud: &cloud.Client{BaseURL: *server}, Clock: time.Now, AppVersion: version, MachineInfo: machineInfo}
	if key, keyErr := license.DefaultPublicKey(); keyErr != nil {
		// Without a verifiable key the agent stays signed out; restore keeps working.
		switch args[0] {
		case "request", "serve", "service":
			fmt.Fprintln(os.Stderr, "warning: license public key unavailable; membership features are disabled:", keyErr)
		}
	} else {
		a.LicenseKey = key
	}
	switch args[0] {
	case "request":
		var req core.Request
		dec := json.NewDecoder(io.LimitReader(os.Stdin, 1024*1024))
		dec.DisallowUnknownFields()
		if err = dec.Decode(&req); err != nil {
			return err
		}
		res := a.Handle(ctx, req)
		if err = json.NewEncoder(os.Stdout).Encode(res); err != nil {
			return err
		}
		if res.Error != nil {
			return errors.New(res.Error.Code)
		}
		return nil
	case "work":
		return a.Work(ctx, false)
	case "serve":
		return serve(ctx, a, *owner)
	case "service":
		return service(a, *owner)
	default:
		return errors.New("unknown command")
	}
}
func envOr(key, fallback string) string {
	if s := os.Getenv(key); s != "" {
		return s
	}
	return fallback
}
