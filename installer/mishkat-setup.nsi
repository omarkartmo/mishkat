; ==============================================================================
; MISHKAT Central School Library Management System
; Unified Commercial Windows Installer (NSIS 3.x)
; Supports: Server Role or Student Role (Zero Customer Dependencies)
; Zero Customer Dependencies: Bundles Portable Node Runtime & Embedded DB
; Strict Data Preservation: Never deletes LibraryData during Upgrade or Repair
; ==============================================================================

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

; --- General Attributes ---
Unicode true
Name "MISHKAT - نظام المشكاة للمكتبات المدرسية"
OutFile "..\MISHKAT-Setup.exe"
InstallDir "$PROGRAMFILES64\MISHKAT"
InstallDirRegKey HKLM "Software\MISHKAT" "Install_Dir"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show
BrandingText "MISHKAT Commercial Distribution v1.1.6"

; --- Interface Settings ---
!define MUI_ABORTWARNING
!define MUI_ICON "..\src-tauri\icons\icon.ico"
!define MUI_UNICON "..\src-tauri\icons\icon.ico"

; --- Variables ---
Var Dialog
Var RadioServer
Var RadioStudent
Var CheckRemoteSupport
Var SelectedRole ; "SERVER", "STUDENT"
Var RemoteSupportEnabled ; "1" or "0"
Var IsUpgrade ; "1" or "0"

; --- Pages ---
!insertmacro MUI_PAGE_WELCOME
Page custom PageRoleSelection PageRoleSelectionLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "Arabic"
!insertmacro MUI_LANGUAGE "English"

; ==============================================================================
; Custom Role Selection Page
; ==============================================================================
Function PageRoleSelection
  !insertmacro MUI_HEADER_TEXT "اختر نوع هذا الجهاز (Role Selection)" "حدد وظيفة هذا الحاسوب في بيئة المؤسسة المدرسية"

  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "اختر الدور المناسب لتثبيت المكونات الضرورية تلقائيًا بدون أي إعدادات معقدة:"
  Pop $0

  ; Radio Buttons for Role Selection
  ${NSD_CreateRadioButton} 10u 28u 90% 14u "MISHKAT Server (خادم المكتبة المركزي وقاعدة البيانات)"
  Pop $RadioServer

  ${NSD_CreateRadioButton} 10u 46u 90% 14u "MISHKAT Student (تطبيق الطالب للقراءة والمطالعة الآمنة)"
  Pop $RadioStudent

  ; Default to Server or Student
  ${If} $SelectedRole == "STUDENT"
    ${NSD_Check} $RadioStudent
  ${Else}
    ${NSD_Check} $RadioServer
  ${EndIf}

  ; Optional Remote Support Checkbox (Tailscale)
  ${NSD_CreateCheckBox} 15u 68u 85% 14u "تفعيل الدعم الفني عن بُعد للمؤسسة عبر Tailscale (Remote Support - اختياري)"
  Pop $CheckRemoteSupport

  ${If} $RemoteSupportEnabled == "1"
    ${NSD_Check} $CheckRemoteSupport
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function PageRoleSelectionLeave
  ${NSD_GetState} $RadioServer $0
  ${NSD_GetState} $RadioStudent $1
  ${NSD_GetState} $CheckRemoteSupport $3

  ${If} $0 == ${BST_CHECKED}
    StrCpy $SelectedRole "SERVER"
  ${Else}
    StrCpy $SelectedRole "STUDENT"
  ${EndIf}

  ${If} $3 == ${BST_CHECKED}
    StrCpy $RemoteSupportEnabled "1"
  ${Else}
    StrCpy $RemoteSupportEnabled "0"
  ${EndIf}
FunctionEnd

; ==============================================================================
; Initialization & Upgrade Detection
; ==============================================================================
Function .onInit
  StrCpy $SelectedRole "SERVER"
  StrCpy $RemoteSupportEnabled "0"
  StrCpy $IsUpgrade "0"
  ClearErrors
  ReadRegStr $0 HKLM "Software\MISHKAT" "Install_Dir"
  ${Unless} ${Errors}
    ${If} ${FileExists} "$0\dist\server.cjs"
      StrCpy $IsUpgrade "1"
    ${EndIf}
  ${EndUnless}
FunctionEnd

; ==============================================================================
; Installation Execution
; ==============================================================================
Section "MISHKAT Core Installation" SecCore
  SetOutPath "$INSTDIR"

  ; Log install activity
  DetailPrint "تثبيت نظام MISHKAT التجاري..."

  ; 1. Preserve or Create LibraryData directory
  ; INVARIANT: LibraryData is NEVER overwritten or truncated on upgrade/repair
  ${Unless} ${FileExists} "$INSTDIR\LibraryData"
    CreateDirectory "$INSTDIR\LibraryData"
    CreateDirectory "$INSTDIR\LibraryData\books"
    CreateDirectory "$INSTDIR\LibraryData\books\digital"
    CreateDirectory "$INSTDIR\LibraryData\books\incoming"
    CreateDirectory "$INSTDIR\LibraryData\books\covers"
    CreateDirectory "$INSTDIR\LibraryData\backups"
    CreateDirectory "$INSTDIR\LibraryData\logs"
    CreateDirectory "$INSTDIR\LibraryData\pgdata"
    CreateDirectory "$INSTDIR\LibraryData\temp"
    CreateDirectory "$INSTDIR\LibraryData\secrets"
  ${EndUnless}

  ; 2. Install Server Components if Role is SERVER
  ${If} $SelectedRole == "SERVER"
    DetailPrint "تثبيت خادم MISHKAT الإنتاجي والخدمات الملحقة..."

    ; Stop existing Windows Service if running before updating binaries
    nsExec::Exec 'net stop MishkatLibraryService'

    ; Copy server production files
    SetOutPath "$INSTDIR\dist"
    File /r /x "installer" "..\dist\*.*"

    SetOutPath "$INSTDIR\server\db\migrations"
    File /r "..\server\db\migrations\*.*"

    SetOutPath "$INSTDIR\public"
    File /r "..\public\*.*"

    ; Copy bundled Node.js portable runtime (Zero external dependencies)
    SetOutPath "$INSTDIR\bin"
    File /nonfatal "..\bin\node.exe"
    File /nonfatal "..\bin\nssm.exe"

    ; Copy root package and configuration
    SetOutPath "$INSTDIR"
    File "..\package.json"
    File "..\src-tauri\icons\icon.ico"

    ; Copy required production server runtime dependencies
    SetOutPath "$INSTDIR\node_modules"
    File /r "..\bin\node_modules\*.*"

    ; Ensure .env exists with unique cryptographically strong JWT_SECRET
    ${Unless} ${FileExists} "$INSTDIR\.env"
      StrCpy $1 ""
      StrCpy $2 0
      ${DoWhile} $2 < 8
        System::Call 'advapi32::CryptGenRandom(i 0, i 4, *i .r3)'
        IntFmt $4 "%08x" $3
        StrCpy $1 "$1$4"
        IntOp $2 $2 + 1
      ${Loop}
      FileOpen $0 "$INSTDIR\.env" w
      FileWrite $0 "PORT=3000$\r$\n"
      FileWrite $0 "NODE_ENV=production$\r$\n"
      FileWrite $0 "JWT_SECRET=$1$\r$\n"
      FileClose $0
    ${Else}
      ; If .env exists from a prior faulty install but lacks JWT_SECRET, append it
      FileOpen $0 "$INSTDIR\.env" r
      StrCpy $5 "0"
      ${Do}
        FileRead $0 $6
        ${If} $6 == ""
          ${ExitDo}
        ${EndIf}
        ${If} $6 != ""
          ; Quick check if line starts with JWT_SECRET
          StrCpy $7 $6 10
          ${If} $7 == "JWT_SECRET"
            StrCpy $5 "1"
          ${EndIf}
        ${EndIf}
      ${Loop}
      FileClose $0
      ${If} $5 == "0"
        StrCpy $1 ""
        StrCpy $2 0
        ${DoWhile} $2 < 8
          System::Call 'advapi32::CryptGenRandom(i 0, i 4, *i .r3)'
          IntFmt $4 "%08x" $3
          StrCpy $1 "$1$4"
          IntOp $2 $2 + 1
        ${Loop}
        FileOpen $0 "$INSTDIR\.env" a
        FileSeek $0 0 END
        FileWrite $0 "$\r$\nJWT_SECRET=$1$\r$\n"
        FileClose $0
      ${EndIf}
    ${EndUnless}

    ; Configure Windows Service via NSSM
    DetailPrint "تهيئة خدمة ويندوز الذاتية (MishkatLibraryService)..."
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" install MishkatLibraryService "$INSTDIR\bin\node.exe" "\"$INSTDIR\dist\server.cjs\""'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService Application "$INSTDIR\bin\node.exe"'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService AppDirectory "$INSTDIR"'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService AppParameters "\"$INSTDIR\dist\server.cjs\""'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService DisplayName "Mishkat School Library Central Server"'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService Start SERVICE_AUTO_START'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService AppRestartDelay 5000'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService AppStdout "$INSTDIR\LibraryData\logs\service-stdout.log"'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService AppStderr "$INSTDIR\LibraryData\logs\service-stderr.log"'

    ; Open Windows Firewall Port 3000 for LAN clients
    DetailPrint "تهيئة جدار حماية ويندوز للسماح باتصال أجهزة الطلاب..."
    nsExec::Exec 'netsh advfirewall firewall add rule name="MISHKAT Server (Port 3000)" dir=in action=allow protocol=TCP localport=3000'

    ; Start the Central Service
    DetailPrint "بدء تشغيل خدمة المكتبة المركزية..."
    nsExec::Exec 'net start MishkatLibraryService'

    ; Server Shortcuts with Mishkat Icon
    CreateDirectory "$SMPROGRAMS\MISHKAT"
    CreateShortCut "$SMPROGRAMS\MISHKAT\إدارة نظام المشكاة المركزي.lnk" "http://localhost:3000" "" "$INSTDIR\icon.ico" 0
    CreateShortCut "$DESKTOP\MISHKAT Server Administration.lnk" "http://localhost:3000" "" "$INSTDIR\icon.ico" 0

    ${If} $RemoteSupportEnabled == "1"
      WriteRegStr HKLM "Software\MISHKAT" "TailscaleRemoteSupport" "1"
      DetailPrint "تم تفعيل خيار الدعم الفني عن بُعد عبر Tailscale."
    ${EndIf}
  ${EndIf}

  ; 3. Install Student Components if Role is STUDENT
  ${If} $SelectedRole == "STUDENT"
    DetailPrint "تثبيت تطبيق الطالب المكتبي (MISHKAT Student)..."

    SetOutPath "$INSTDIR"
    File /nonfatal "..\src-tauri\target\release\mishkat-student.exe"
    File "..\src-tauri\icons\icon.ico"

    ; Student Shortcuts with Mishkat Icon
    CreateDirectory "$SMPROGRAMS\MISHKAT"
    ${If} ${FileExists} "$INSTDIR\mishkat-student.exe"
      CreateShortCut "$SMPROGRAMS\MISHKAT\MISHKAT Student.lnk" "$INSTDIR\mishkat-student.exe" "" "$INSTDIR\icon.ico" 0
      CreateShortCut "$DESKTOP\MISHKAT Student.lnk" "$INSTDIR\mishkat-student.exe" "" "$INSTDIR\icon.ico" 0
    ${Else}
      ; Fallback shortcut to web kiosk if desktop binary built separately
      CreateShortCut "$DESKTOP\MISHKAT Student.lnk" "http://localhost:3000" "" "$INSTDIR\icon.ico" 0
    ${EndIf}
  ${EndIf}

  ; 4. Registry Keys & Uninstaller
  WriteRegStr HKLM "Software\MISHKAT" "Install_Dir" "$INSTDIR"
  WriteRegStr HKLM "Software\MISHKAT" "Role" "$SelectedRole"
  WriteRegStr HKLM "Software\MISHKAT" "Version" "1.1.6"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "DisplayName" "MISHKAT School Library System"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "DisplayVersion" "1.1.6"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "Publisher" "MISHKAT"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "NoRepair" 1

  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

; ==============================================================================
; Uninstallation
; ==============================================================================
Section "Uninstall"
  DetailPrint "إيقاف وحذف خدمة ويندوز..."
  nsExec::Exec 'net stop MishkatLibraryService'
  nsExec::Exec '"$INSTDIR\bin\nssm.exe" remove MishkatLibraryService confirm'

  ; Remove firewall rule
  nsExec::Exec 'netsh advfirewall firewall delete rule name="MISHKAT Server (Port 3000)"'

  ; Prompt user to preserve or backup institutional data
  MessageBox MB_YESNO|MB_ICONQUESTION "هل ترغب في الاحتفاظ بقاعدة البيانات والكتب والنسخ الاحتياطية (مجلد LibraryData)؟$\r$\n$\r$\nنوصي باختيار (نعم) لحماية بيانات المدرسة." IDYES keep_data
    RMDir /r "$INSTDIR\LibraryData"
  keep_data:

  ; Delete application binaries
  RMDir /r "$INSTDIR\dist"
  RMDir /r "$INSTDIR\bin"
  RMDir /r "$INSTDIR\server"
  RMDir /r "$INSTDIR\public"
  RMDir /r "$INSTDIR\node_modules"
  Delete "$INSTDIR\icon.ico"
  Delete "$INSTDIR\mishkat-student.exe"
  Delete "$INSTDIR\uninstall.exe"
  Delete "$INSTDIR\package.json"

  ; Remove Shortcuts
  Delete "$DESKTOP\MISHKAT Server Administration.lnk"
  Delete "$DESKTOP\MISHKAT Student.lnk"
  RMDir /r "$SMPROGRAMS\MISHKAT"

  ; Clean Registry
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT"
  DeleteRegKey HKLM "Software\MISHKAT"
SectionEnd
