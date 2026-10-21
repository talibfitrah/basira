; مثبّت بصيرة لويندوز — يُبنى بـ makensis على أي نظام (لا يحتاج ويندوز)
Unicode true
ManifestDPIAware true
!include "MUI2.nsh"

!define APPNAME "Basira"
!define APPNAME_AR "بصيرة"
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef SRC
  !define SRC "dist\win-unpacked"
!endif
!ifndef OUT
  !define OUT "dist\Basira-Setup-${VERSION}.exe"
!endif

Name "${APPNAME_AR}"
OutFile "${OUT}"
InstallDir "$LOCALAPPDATA\Programs\${APPNAME}"
InstallDirRegKey HKCU "Software\${APPNAME}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
BrandingText "Stichting Tarbiyah"

!define MUI_ICON "build\icon.ico"
!define MUI_UNICON "build\icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\Basira.exe"
!define MUI_FINISHPAGE_RUN_TEXT "تشغيل بصيرة الآن"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Arabic"
!insertmacro MUI_LANGUAGE "English"

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=${LANG_ENGLISH} "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=${LANG_ENGLISH} "CompanyName" "Stichting Tarbiyah"
VIAddVersionKey /LANG=${LANG_ENGLISH} "FileDescription" "Basira Setup"
VIAddVersionKey /LANG=${LANG_ENGLISH} "FileVersion" "${VERSION}"

Section "Install"
  ; أغلق النسخة العاملة قبل التحديث
  nsExec::Exec 'taskkill /F /IM Basira.exe'
  SetOutPath "$INSTDIR"
  File /r "${SRC}\*.*"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\${APPNAME}" "InstallDir" "$INSTDIR"
  CreateDirectory "$SMPROGRAMS\${APPNAME_AR}"
  CreateShortCut "$SMPROGRAMS\${APPNAME_AR}\${APPNAME_AR}.lnk" "$INSTDIR\Basira.exe"
  CreateShortCut "$SMPROGRAMS\${APPNAME_AR}\إزالة ${APPNAME_AR}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APPNAME_AR}.lnk" "$INSTDIR\Basira.exe"
  !define UNINST "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  WriteRegStr HKCU "${UNINST}" "DisplayName" "${APPNAME_AR} (Basira)"
  WriteRegStr HKCU "${UNINST}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST}" "Publisher" "Stichting Tarbiyah"
  WriteRegStr HKCU "${UNINST}" "DisplayIcon" "$INSTDIR\Basira.exe"
  WriteRegStr HKCU "${UNINST}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM Basira.exe'
  ; نحذف ملفات البرنامج فقط؛ النماذج والمحادثات في مجلد المستخدم تبقى إلا إن حذفها هو
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${APPNAME_AR}.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME_AR}"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
  DeleteRegKey HKCU "Software\${APPNAME}"
SectionEnd
