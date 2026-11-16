//go:build !bakvion_dev

package core

// devBypass is always false in release builds; BAKVION_DEV_UNLICENSED is ignored.
const devBypass = false
