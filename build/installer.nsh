!include "Sections.nsh"

; Base64-encoded PowerShell avoids fragile NSIS quoting while removing Arion-owned
; Credential Manager entries during the optional uninstall cleanup.
!define DELETE_ARION_CREDENTIALS_ENCODED "dAByAHkAIAB7AAoAIAAgACQAdABhAHIAZwBlAHQAcwAgAD0AIABjAG0AZABrAGUAeQAgAC8AbABpAHMAdAAgAHwAIABGAG8AcgBFAGEAYwBoAC0ATwBiAGoAZQBjAHQAIAB7AAoAIAAgACAAIABpAGYAIAAoACQAXwAgAC0AbQBhAHQAYwBoACAAJwBUAGEAcgBnAGUAdAA6AFwAcwArACgALgArACkAJAAnACkAIAB7ACAAJABtAGEAdABjAGgAZQBzAFsAMQBdAC4AVAByAGkAbQAoACkAIAB9AAoAIAAgAH0ACgAKACAAIAAkAHQAYQByAGcAZQB0AHMAIAB8ACAAVwBoAGUAcgBlAC0ATwBiAGoAZQBjAHQAIAB7AAoAIAAgACAAIAAkAF8AIAAtAGwAaQBrAGUAIAAnAEwAZQBnAGEAYwB5AEcAZQBuAGUAcgBpAGMAOgB0AGEAcgBnAGUAdAA9AEEAcgBpAG8AbgBMAEwATQBDAHIAZQBkAGUAbgB0AGkAYQBsAHMALwAqACcAIAAtAG8AcgAKACAAIAAgACAAJABfACAALQBsAGkAawBlACAAJwBMAGUAZwBhAGMAeQBHAGUAbgBlAHIAaQBjADoAdABhAHIAZwBlAHQAPQBBAHIAaQBvAG4AUABvAHMAdABnAHIAZQBTAFEATABDAHIAZQBkAGUAbgB0AGkAYQBsAHMALwAqACcAIAAtAG8AcgAKACAAIAAgACAAJABfACAALQBsAGkAawBlACAAJwBMAGUAZwBhAGMAeQBHAGUAbgBlAHIAaQBjADoAdABhAHIAZwBlAHQAPQBBAHIAaQBvAG4ASQBuAHQAZQBnAHIAYQB0AGkAbwBuAEMAcgBlAGQAZQBuAHQAaQBhAGwAcwAvACoAJwAKACAAIAB9ACAAfAAgAEYAbwByAEUAYQBjAGgALQBPAGIAagBlAGMAdAAgAHsACgAgACAAIAAgAGMAbQBkAGsAZQB5ACAALwBkAGUAbABlAHQAZQA6ACQAXwAgAHwAIABPAHUAdAAtAE4AdQBsAGwACgAgACAAfQAKAAoAIAAgAGUAeABpAHQAIAAwAAoAfQAgAGMAYQB0AGMAaAAgAHsACgAgACAAVwByAGkAdABlAC0ARQByAHIAbwByACAAJABfAAoAIAAgAGUAeABpAHQAIAAxAAoAfQA="

!macro customUnInstallSection
  Section /o "un.Delete Arion data and credentials" UNINSTALL_DELETE_USER_DATA_SECTION
    Push $0
    DetailPrint "Deleting Arion user data and local update cache..."

    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}

    RMDir /r "$APPDATA\${APP_FILENAME}"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    !endif
    !ifdef APP_PACKAGE_NAME
      RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
      RMDir /r "$LOCALAPPDATA\${APP_PACKAGE_NAME}-updater"
    !endif
    RMDir /r "$LOCALAPPDATA\${APP_FILENAME}-updater"
    !ifdef APP_PRODUCT_FILENAME
      RMDir /r "$LOCALAPPDATA\${APP_PRODUCT_FILENAME}-updater"
    !endif

    DetailPrint "Deleting saved credentials from Windows Credential Manager..."
    ClearErrors
    ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${DELETE_ARION_CREDENTIALS_ENCODED}' $0

    ${ifNot} $0 == 0
      DetailPrint "Credential cleanup exited with code $0. Some saved credentials may remain."
      ${ifNot} ${Silent}
        MessageBox MB_OK|MB_ICONEXCLAMATION "Arion removed the local app data, but some saved credentials may still remain in Windows Credential Manager."
      ${endif}
    ${endif}

    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
    Pop $0
  SectionEnd
!macroend
