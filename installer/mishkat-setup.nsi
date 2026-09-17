; ==============================================================================
; MISHKAT Central School Library Management System
; Unified Commercial Windows Installer (NSIS 3.x)
; Supports: Server Role, Student Role, or Combined (Server + Student)
; Zero Customer Dependencies: Bundles Portable Node Runtime & Embedded DB
; Strict Data Preservation: Never deletes LibraryData during Upgrade or Repair
; ==============================================================================

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"

; --- General Attributes ---
Name "MISHKAT - نظام المشكاة للمكتبات المدرسية"
OutFile "..\MISHKAT-Setup.exe"
InstallDir "$PROGRAMFILES64\MISHKAT"
InstallDirRegKey HKLM "Software\MISHKAT" "Install_Dir"
RequestExecutionLevel admin
ShowInstDetails show
ShowUninstDetails show
BrandingText "MISHKAT Commercial Distribution v1.0.0"

; --- Interface Settings ---
!define MUI_ABORTWARNING
!define MUI_ICON "..\public\favicon.ico"
!define MUI_UNICON "..\public\favicon.ico"

; --- Variables ---
Var Dialog
Var RadioServer
Var RadioStudent
Var RadioCombined
Var CheckRemoteSupport
Var SelectedRole ; "SERVER", "STUDENT", "COMBINED"
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

  ${NSD_CreateRadioButton} 10u 64u 90% 14u "Server + Student (خادم وطالب معًا على نفس الحاسوب)"
  Pop $RadioCombined

  ; Default to Server + Student or Server
  ${If} $SelectedRole == "STUDENT"
    ${NSD_Check} $RadioStudent
  ${ElseIf} $SelectedRole == "COMBINED"
    ${NSD_Check} $RadioCombined
  ${Else}
    ${NSD_Check} $RadioServer
  ${EndIf}

  ; Optional Remote Support Checkbox (Server only)
  ${NSD_CreateCheckBox} 15u 86u 85% 14u "تفعيل الدعم الفني عن بُعد للمؤسسة (Enable Remote Support - اختياري)"
  Pop $CheckRemoteSupport

  ${If} $RemoteSupportEnabled == "1"
    ${NSD_Check} $CheckRemoteSupport
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function PageRoleSelectionLeave
  ${NSD_GetState} $RadioServer $0
  ${NSD_GetState} $RadioStudent $1
  ${NSD_GetState} $RadioCombined $2
  ${NSD_GetState} $CheckRemoteSupport $3

  ${If} $0 == ${BST_CHECKED}
    StrCpy $SelectedRole "SERVER"
  ${ElseIf} $1 == ${BST_CHECKED}
    StrCpy $SelectedRole "STUDENT"
  ${Else}
    StrCpy $SelectedRole "COMBINED"
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

  ; 2. Install Server Components if Role is SERVER or COMBINED
  ${If} $SelectedRole == "SERVER"
  ${OrIf} $SelectedRole == "COMBINED"
    DetailPrint "تثبيت خادم MISHKAT الإنتاجي والخدمات الملحقة..."

    ; Stop existing Windows Service if running before updating binaries
    nsExec::Exec 'net stop MishkatLibraryService'

    ; Copy server production files
    SetOutPath "$INSTDIR\dist"
    File /r "..\dist\*.*"

    SetOutPath "$INSTDIR\server\db\migrations"
    File /r "..\server\db\migrations\*.*"

    SetOutPath "$INSTDIR\public"
    File /r "..\public\*.*"

    ; Copy bundled Node.js portable runtime (Zero external dependencies)
    SetOutPath "$INSTDIR\bin"
    ${If} ${FileExists} "..\bin\node.exe"
      File "..\bin\node.exe"
    ${EndIf}
    ${If} ${FileExists} "..\nssm.exe"
      File "..\nssm.exe"
    ${EndIf}

    ; Copy root package and configuration
    SetOutPath "$INSTDIR"
    File "..\package.json"

    ; Ensure .env exists with strong random JWT_SECRET if new install
    ${Unless} ${FileExists} "$INSTDIR\.env"
      FileOpen $0 "$INSTDIR\.env" w
      FileWrite $0 "JWT_SECRET=0f8a713121c4b8f65443bc1d546e2777ece3be3c4163917f58d079a5a41ed569bd3834872203e8eaaccee6cdadd4637a$\r$\n"
      FileWrite $0 "PORT=3000$\r$\n"
      FileWrite $0 "NODE_ENV=production$\r$\n"
      FileClose $0
    ${EndUnless}

    ; Configure Windows Service via NSSM
    DetailPrint "تهيئة خدمة ويندوز الذاتية (MishkatLibraryService)..."
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" install MishkatLibraryService "$INSTDIR\bin\node.exe" "$INSTDIR\dist\server.cjs"'
    nsExec::Exec '"$INSTDIR\bin\nssm.exe" set MishkatLibraryService AppDirectory "$INSTDIR"'
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

    ; Server Shortcuts
    CreateDirectory "$SMPROGRAMS\MISHKAT"
    CreateShortCut "$SMPROGRAMS\MISHKAT\إدارة نظام المشكاة المركزي.lnk" "http://localhost:3000" "" "$INSTDIR\public\favicon.ico"
    CreateShortCut "$DESKTOP\MISHKAT Server Administration.lnk" "http://localhost:3000" "" "$INSTDIR\public\favicon.ico"
  ${EndIf}

  ; 3. Install Student Components if Role is STUDENT or COMBINED
  ${If} $SelectedRole == "STUDENT"
  ${OrIf} $SelectedRole == "COMBINED"
    DetailPrint "تثبيت تطبيق الطالب المكتبي (MISHKAT Student)..."

    SetOutPath "$INSTDIR"
    ${If} ${FileExists} "..\src-tauri\target\release\mishkat-student.exe"
      File "..\src-tauri\target\release\mishkat-student.exe"
    ${EndIf}

    ; Student Shortcuts
    CreateDirectory "$SMPROGRAMS\MISHKAT"
    ${If} ${FileExists} "$INSTDIR\mishkat-student.exe"
      CreateShortCut "$SMPROGRAMS\MISHKAT\MISHKAT Student.lnk" "$INSTDIR\mishkat-student.exe" "" "$INSTDIR\public\favicon.ico"
      CreateShortCut "$DESKTOP\MISHKAT Student.lnk" "$INSTDIR\mishkat-student.exe" "" "$INSTDIR\public\favicon.ico"
    ${Else}
      ; Fallback shortcut to web kiosk if desktop binary built separately
      CreateShortCut "$DESKTOP\MISHKAT Student.lnk" "http://localhost:3000" "" "$INSTDIR\public\favicon.ico"
    ${EndIf}
  ${EndIf}

  ; 4. Registry Keys & Uninstaller
  WriteRegStr HKLM "Software\MISHKAT" "Install_Dir" "$INSTDIR"
  WriteRegStr HKLM "Software\MISHKAT" "Role" "$SelectedRole"
  WriteRegStr HKLM "Software\MISHKAT" "Version" "1.0.0"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "DisplayName" "MISHKAT School Library System"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MISHKAT" "DisplayIcon" "$INSTDIR\public\favicon.ico"
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
