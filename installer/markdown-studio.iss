; MarkForge Markdown Studio - Inno Setup 6 Installer Definition
; Produces per-user modern Windows setup installer without requiring UAC elevation.

#define MyAppName "MarkForge Markdown Studio"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "DevspireHub"
#define MyAppURL "https://github.com/kumaradoss16/markdown-studio"
#define MyAppExeName "markdown-studio-v1.0.1-windows-x64-portable.exe"
#define MyAppInstalledExeName "markdown-studio.exe"

[Setup]
; Fixed AppId GUID so subsequent releases upgrade in place cleanly
AppId={{B42E7A91-8C5F-4D2A-9E31-1B8F5D6C7E92}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=..\dist
OutputBaseFilename=markdown-studio-v1.0.1-windows-x64-setup
SetupIconFile=..\src-win32\app.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppInstalledExeName}
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "fileassoc"; Description: "Associate Markdown files (.md) with {#MyAppName}"; GroupDescription: "File Associations:"; Flags: unchecked

[Files]
Source: "..\dist\{#MyAppExeName}"; DestDir: "{app}"; DestName: "{#MyAppInstalledExeName}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppInstalledExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppInstalledExeName}"; Tasks: desktopicon

[Registry]
; Optional .md file association - only created if user selects fileassoc task
Root: HKCU; Subkey: "Software\Classes\.md"; ValueType: string; ValueName: ""; ValueData: "MarkForge.Markdown"; Flags: uninsdeletevalue; Tasks: fileassoc
Root: HKCU; Subkey: "Software\Classes\MarkForge.Markdown"; ValueType: string; ValueName: ""; ValueData: "Markdown Document"; Flags: uninsdeletekey; Tasks: fileassoc
Root: HKCU; Subkey: "Software\Classes\MarkForge.Markdown\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppInstalledExeName},0"; Tasks: fileassoc
Root: HKCU; Subkey: "Software\Classes\MarkForge.Markdown\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppInstalledExeName}"" ""%1"""; Tasks: fileassoc

[Run]
Filename: "{app}\{#MyAppInstalledExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
