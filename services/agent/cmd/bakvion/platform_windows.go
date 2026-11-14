//go:build windows

package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/Microsoft/go-winio"
	"github.com/ishansavaliya/hybrid-backup-manager/services/agent/internal/core"
	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/svc"
	"io"
	"log/slog"
	"net"
	"os"
	"sync"
	"time"
)

const pipeName = `\\.\pipe\Bakvion.v1`

func serve(ctx context.Context, a *core.Agent, owner string) (returnErr error) {
	sid, err := windows.StringToSid(owner)
	if err != nil {
		return errors.New("valid --owner-sid required; refusing unrestricted IPC")
	}
	listener, err := winio.ListenPipe(pipeName, &winio.PipeConfig{SecurityDescriptor: "D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;" + sid.String() + ")", InputBufferSize: 65536, OutputBufferSize: 65536})
	if err != nil {
		return err
	}
	defer listener.Close()
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	worker := make(chan error, 1)
	go func() { worker <- a.Work(ctx, true); cancel() }()
	go a.LicenseLoop(ctx)
	go a.SchedulerLoop(ctx)
	go a.ReportLoop(ctx)
	go a.UpdateLoop(ctx)
	go func() { <-ctx.Done(); listener.Close() }()
	var active sync.WaitGroup
	defer func() {
		cancel()
		listener.Close()
		active.Wait()
		workerErr := <-worker
		if returnErr == nil && workerErr != nil && !errors.Is(workerErr, context.Canceled) {
			returnErr = workerErr
		}
	}()
	slots := make(chan struct{}, 8)
	for {
		conn, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil {

				return nil
			}
			return err
		}
		select {
		case slots <- struct{}{}:
		case <-ctx.Done():
			conn.Close()
			return nil
		}
		active.Add(1)
		go func(c net.Conn) {
			defer active.Done()
			defer func() { <-slots }()
			defer c.Close()
			done := make(chan struct{})
			defer close(done)
			go func() {
				select {
				case <-ctx.Done():
					c.Close()
				case <-done:
				}
			}()
			c.SetReadDeadline(time.Now().Add(15 * time.Second))
			var req core.Request
			dec := json.NewDecoder(io.LimitReader(c, 1024*1024))
			dec.DisallowUnknownFields()
			if err := dec.Decode(&req); err != nil {
				return
			}
			c.SetDeadline(time.Now().Add(24 * time.Hour))
			if err := json.NewEncoder(c).Encode(a.Handle(ctx, req)); err != nil {
				slog.Warn("ipc_response_failed", "code", "PIPE_WRITE_FAILED")
			}
		}(conn)
	}
}

type handler struct {
	agent *core.Agent
	owner string
}

func (h handler) Execute(_ []string, requests <-chan svc.ChangeRequest, status chan<- svc.Status) (bool, uint32) {
	status <- svc.Status{State: svc.StartPending}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- serve(ctx, h.agent, h.owner) }()
	status <- svc.Status{State: svc.Running, Accepts: svc.AcceptStop | svc.AcceptShutdown}
	for {
		select {
		case err := <-done:
			if err != nil {
				return true, 1
			}
			return false, 0
		case request := <-requests:
			switch request.Cmd {
			case svc.Interrogate:
				status <- request.CurrentStatus
			case svc.Stop, svc.Shutdown:
				status <- svc.Status{State: svc.StopPending, WaitHint: 30000}
				cancel()
				select {
				case <-done:
					return false, 0
				case <-time.After(25 * time.Second):
					return true, 2
				}
			}
		}
	}
}
func service(a *core.Agent, owner string) error {
	if _, err := windows.StringToSid(owner); err != nil {
		return errors.New("valid --owner-sid required")
	}
	return svc.Run("BakvionService", handler{a, owner})
}

// machineInfo returns the host name and "Windows major.minor.build", each at most 64 bytes.
func machineInfo() (string, string) {
	host, _ := os.Hostname()
	v := windows.RtlGetVersion()
	win := fmt.Sprintf("Windows %d.%d.%d", v.MajorVersion, v.MinorVersion, v.BuildNumber)
	if len(host) > 64 {
		host = host[:64]
	}
	return host, win
}
