; Bakvion installer hooks (Tauri NSIS). The background service is installed,
; updated and removed by BakvionService.exe itself; see install_windows.go.
; Backups, keys and settings in C:\ProgramData\Bakvion are never deleted.

!macro NSIS_HOOK_PREINSTALL
  ; Stop the running service (an update) so its files can be replaced.
  nsExec::Exec 'sc.exe stop BakvionService'
  Pop $0
  Sleep 4000
  nsExec::Exec 'taskkill.exe /F /IM BakvionService.exe'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  nsExec::ExecToLog '"$INSTDIR\BakvionService.exe" install'
  Pop $0
  StrCmp $0 "0" +2
    MessageBox MB_ICONEXCLAMATION|MB_OK "Bakvion was installed, but its background service could not start (code $0). Restart the PC; if this message appears again, contact your Bakvion provider." /SD IDOK
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::ExecToLog '"$INSTDIR\BakvionService.exe" uninstall'
  Pop $0
!macroend
