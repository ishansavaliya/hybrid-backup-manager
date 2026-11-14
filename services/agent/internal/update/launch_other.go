//go:build !windows

package update

import "errors"

func launch(string) error {
	return errors.New("update: installing updates is supported on Windows only")
}
