package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func device() DeviceInfo {
	return DeviceInfo{InstallID: strings.Repeat("a", 32), MachineName: "PC-1", WindowsVersion: "10.0.19045", AppVersion: "0.1.0"}
}

func TestSignInSuccessDecodesResult(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/device/sign-in" {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "" {
			t.Error("sign-in must not send a bearer token")
		}
		if err := json.NewDecoder(r.Body).Decode(&got); err != nil {
			t.Error(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"deviceToken":"tok","license":"lic.sig","mode":"full"}`)
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL + "/"}
	res, err := c.SignIn(context.Background(), SignInRequest{Method: "password", Username: "acme", Password: "pw-secret", Device: device()})
	if err != nil {
		t.Fatal(err)
	}
	if res.DeviceToken != "tok" || res.License != "lic.sig" || res.Mode != "full" {
		t.Fatalf("result: %+v", res)
	}
	if got["method"] != "password" || got["username"] != "acme" || got["password"] != "pw-secret" {
		t.Fatalf("body: %v", got)
	}
	if _, ok := got["code"]; ok {
		t.Fatal("password sign-in must not send a code field")
	}
	d, _ := got["device"].(map[string]any)
	if d["installId"] != strings.Repeat("a", 32) || d["machineName"] != "PC-1" || d["windowsVersion"] != "10.0.19045" || d["appVersion"] != "0.1.0" {
		t.Fatalf("device: %v", d)
	}
}

func TestSignInCodeBody(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = io.WriteString(w, `{"deviceToken":"tok","license":"lic.sig","mode":"full"}`)
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL}
	if _, err := c.SignIn(context.Background(), SignInRequest{Method: "code", Code: "012345", Device: device()}); err != nil {
		t.Fatal(err)
	}
	if got["method"] != "code" || got["code"] != "012345" {
		t.Fatalf("body: %v", got)
	}
	if _, ok := got["username"]; ok {
		t.Fatal("code sign-in must not send username")
	}
	if _, ok := got["password"]; ok {
		t.Fatal("code sign-in must not send password")
	}
}

func TestErrorBodyDecodesAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = io.WriteString(w, `{"error":{"code":"invalid_credentials","message":"Wrong username or password."}}`)
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL}
	_, err := c.SignIn(context.Background(), SignInRequest{Method: "password", Username: "a", Password: "secret-pw", Device: device()})
	var apiErr *APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("want *APIError, got %T %v", err, err)
	}
	if apiErr.Status != 401 || apiErr.Code != "invalid_credentials" || apiErr.Message != "Wrong username or password." {
		t.Fatalf("api error: %+v", apiErr)
	}
	if errors.Is(err, ErrOffline) {
		t.Fatal("4xx must not be offline")
	}
	if strings.Contains(err.Error(), "secret-pw") {
		t.Fatal("password leaked into error")
	}
}

func TestUndecodableClientErrorStillAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `<html>not found</html>`)
	}))
	defer srv.Close()
	err := (&Client{BaseURL: srv.URL}).SignOut(context.Background(), "t1")
	var apiErr *APIError
	if !errors.As(err, &apiErr) || apiErr.Status != 404 || apiErr.Code != "http_error" {
		t.Fatalf("got %T %v", err, err)
	}
}

func TestClosedServerIsOffline(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	url := srv.URL
	srv.Close()
	c := &Client{BaseURL: url}
	if _, err := c.SignIn(context.Background(), SignInRequest{Method: "code", Code: "123456", Device: device()}); !errors.Is(err, ErrOffline) {
		t.Fatalf("sign-in: %v", err)
	}
	if _, err := c.RefreshLicense(context.Background(), "t1", "0.1.0"); !errors.Is(err, ErrOffline) {
		t.Fatalf("refresh: %v", err)
	}
	if err := c.SignOut(context.Background(), "t1"); !errors.Is(err, ErrOffline) {
		t.Fatalf("sign-out: %v", err)
	}
}

func TestServerErrorIsOffline(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, `{"error":{"code":"server_error","message":"Something went wrong. Try again later."}}`)
	}))
	defer srv.Close()
	if _, err := (&Client{BaseURL: srv.URL}).RefreshLicense(context.Background(), "t1", "0.1.0"); !errors.Is(err, ErrOffline) {
		t.Fatalf("5xx: %v", err)
	}
}

func TestRefreshSendsBearerAndAppVersion(t *testing.T) {
	var auth string
	var body map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/device/license" || r.Method != http.MethodPost {
			t.Errorf("unexpected %s %s", r.Method, r.URL.Path)
		}
		auth = r.Header.Get("Authorization")
		_ = json.NewDecoder(r.Body).Decode(&body)
		_, _ = io.WriteString(w, `{"license":"new.sig","mode":"full"}`)
	}))
	defer srv.Close()
	lic, err := (&Client{BaseURL: srv.URL}).RefreshLicense(context.Background(), "t1", "0.2.0")
	if err != nil {
		t.Fatal(err)
	}
	if lic != "new.sig" {
		t.Fatalf("license %q", lic)
	}
	if auth != "Bearer t1" {
		t.Fatalf("authorization %q", auth)
	}
	if body["appVersion"] != "0.2.0" {
		t.Fatalf("body %v", body)
	}
}

func TestSignOutSendsBearer(t *testing.T) {
	var auth, path string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth, path = r.Header.Get("Authorization"), r.URL.Path
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	defer srv.Close()
	if err := (&Client{BaseURL: srv.URL}).SignOut(context.Background(), "t1"); err != nil {
		t.Fatal(err)
	}
	if auth != "Bearer t1" || path != "/api/v1/device/sign-out" {
		t.Fatalf("auth %q path %q", auth, path)
	}
}

func TestEmptySuccessBodyRejected(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, `{"mode":"full"}`)
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL}
	if _, err := c.SignIn(context.Background(), SignInRequest{Method: "code", Code: "123456", Device: device()}); err == nil {
		t.Fatal("sign-in without token accepted")
	}
	if _, err := c.RefreshLicense(context.Background(), "t1", ""); err == nil {
		t.Fatal("refresh without license accepted")
	}
}
