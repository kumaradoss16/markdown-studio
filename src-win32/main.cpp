#include <windows.h>
#include <windowsx.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <shellapi.h>
#include <knownfolders.h>
#include <dwmapi.h>
#include <wrl.h>
#include <string>
#include <vector>
#include <memory>
#include <fstream>

#include "resource.h"
#include "version.h"
#include "embedded_assets.h"
#include "packages/Microsoft.Web.WebView2/build/native/include/WebView2.h"

using namespace Microsoft::WRL;

#pragma comment(lib, "WebView2LoaderStatic.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "advapi32.lib")

// Global application state
HINSTANCE g_hInstance = nullptr;
HWND g_hWnd = nullptr;
ComPtr<ICoreWebView2Controller> g_controller;
ComPtr<ICoreWebView2> g_webview;

// Get local application storage path: %LOCALAPPDATA%\MarkdownStudio
std::wstring GetAppStoragePath() {
    PWSTR localAppData = nullptr;
    if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, NULL, &localAppData)) && localAppData) {
        std::wstring path = localAppData;
        CoTaskMemFree(localAppData);
        path += L"\\MarkdownStudio";
        CreateDirectoryW(path.c_str(), NULL);
        return path;
    }
    // Fallback to temp folder
    WCHAR tempPath[MAX_PATH];
    GetTempPathW(MAX_PATH, tempPath);
    std::wstring path = tempPath;
    path += L"MarkdownStudio";
    CreateDirectoryW(path.c_str(), NULL);
    return path;
}

// Helper to ensure all directories in a file path exist
void EnsureParentDirectoryExists(const std::wstring& filePath) {
    WCHAR buffer[MAX_PATH];
    wcscpy_s(buffer, filePath.c_str());
    for (int i = 0; buffer[i]; ++i) {
        if (buffer[i] == L'/') buffer[i] = L'\\';
    }
    PathRemoveFileSpecW(buffer);
    SHCreateDirectoryExW(NULL, buffer, NULL);
}

// Extract embedded web assets from resource section into %LOCALAPPDATA%\MarkdownStudio\assets
std::wstring ExtractEmbeddedAssets(HINSTANCE hInstance) {
    std::wstring basePath = GetAppStoragePath() + L"\\assets";
    CreateDirectoryW(basePath.c_str(), NULL);

    for (size_t i = 0; i < g_embeddedAssetCount; ++i) {
        const auto& asset = g_embeddedAssets[i];
        HRSRC hRes = FindResourceW(hInstance, MAKEINTRESOURCEW(asset.resourceId), RT_RCDATA);
        if (!hRes) continue;

        HGLOBAL hData = LoadResource(hInstance, hRes);
        if (!hData) continue;

        DWORD size = SizeofResource(hInstance, hRes);
        const void* pData = LockResource(hData);
        if (!pData || size == 0) continue;

        std::wstring relPath = asset.relativePath;
        for (auto& ch : relPath) {
            if (ch == L'/') ch = L'\\';
        }
        std::wstring destFile = basePath + L"\\" + relPath;
        EnsureParentDirectoryExists(destFile);

        // Check if destination exists and matches size
        WIN32_FILE_ATTRIBUTE_DATA fileInfo;
        if (GetFileAttributesExW(destFile.c_str(), GetFileExInfoStandard, &fileInfo)) {
            if (fileInfo.nFileSizeLow == size) {
                continue; // Already extracted and matches size
            }
        }

        HANDLE hOut = CreateFileW(destFile.c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        if (hOut != INVALID_HANDLE_VALUE) {
            DWORD written = 0;
            WriteFile(hOut, pData, size, &written, NULL);
            CloseHandle(hOut);
        }
    }

    return basePath;
}

// Update WebView2 bounds to match client area
void UpdateWebViewBounds() {
    if (g_controller) {
        RECT bounds;
        GetClientRect(g_hWnd, &bounds);
        g_controller->put_Bounds(bounds);
    }
}

// Check for Evergreen WebView2 Runtime installation
bool CheckWebView2Runtime() {
    LPWSTR version = nullptr;
    HRESULT hr = GetAvailableCoreWebView2BrowserVersionString(nullptr, &version);
    if (FAILED(hr) || version == nullptr) {
        int msgBox = MessageBoxW(
            NULL,
            L"Microsoft Edge WebView2 Runtime is required to run MarkForge Markdown Studio.\n\n"
            L"Would you like to visit Microsoft's official download site to install it?",
            APP_NAME_W,
            MB_ICONEXCLAMATION | MB_YESNO | MB_DEFBUTTON1
        );
        if (msgBox == IDYES) {
            ShellExecuteW(NULL, L"open", L"https://go.microsoft.com/fwlink/p/?LinkId=2124703", NULL, NULL, SW_SHOWNORMAL);
        }
        return false;
    }
    CoTaskMemFree(version);
    return true;
}

// Enable Windows 10/11 Dark Mode for Title Bar
void ApplyDarkModeTitleBar(HWND hwnd) {
    BOOL useDarkMode = TRUE;
    // DWMWA_USE_IMMERSIVE_DARK_MODE = 20 (Windows 10 20H1+ and Windows 11)
    if (FAILED(DwmSetWindowAttribute(hwnd, 20, &useDarkMode, sizeof(useDarkMode)))) {
        // Fallback for earlier Windows 10 versions (attribute 19)
        DwmSetWindowAttribute(hwnd, 19, &useDarkMode, sizeof(useDarkMode));
    }
}

// Initialize WebView2 Controller and navigate to embedded assets
void InitWebView(HWND hwnd, const std::wstring& assetsFolder) {
    std::wstring userDataFolder = GetAppStoragePath() + L"\\WebView2Profile";
    CreateDirectoryW(userDataFolder.c_str(), NULL);

    CreateCoreWebView2EnvironmentWithOptions(
        nullptr,
        userDataFolder.c_str(),
        nullptr,
        Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
            [hwnd, assetsFolder](HRESULT result, ICoreWebView2Environment* env) -> HRESULT {
                if (FAILED(result) || !env) {
                    MessageBoxW(hwnd, L"Failed to create WebView2 Environment.", APP_NAME_W, MB_ICONERROR);
                    return result;
                }

                env->CreateCoreWebView2Controller(
                    hwnd,
                    Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                        [hwnd, assetsFolder](HRESULT result, ICoreWebView2Controller* controller) -> HRESULT {
                            if (FAILED(result) || !controller) {
                                MessageBoxW(hwnd, L"Failed to create WebView2 Controller.", APP_NAME_W, MB_ICONERROR);
                                return result;
                            }

                            g_controller = controller;
                            g_controller->get_CoreWebView2(&g_webview);

                            if (g_webview) {
                                // Configure WebView2 settings
                                ComPtr<ICoreWebView2Settings> settings;
                                g_webview->get_Settings(&settings);
                                if (settings) {
                                    settings->put_IsScriptEnabled(TRUE);
                                    settings->put_AreDefaultScriptDialogsEnabled(TRUE);
                                    settings->put_IsWebMessageEnabled(TRUE);
                                    settings->put_AreDevToolsEnabled(TRUE);
                                    settings->put_IsStatusBarEnabled(FALSE);
                                }

                                // Map virtual host name "app.markdownstudio.local" to the extracted assets folder
                                ComPtr<ICoreWebView2_3> webview3;
                                if (SUCCEEDED(g_webview.As(&webview3)) && webview3) {
                                    webview3->SetVirtualHostNameToFolderMapping(
                                        L"app.markdownstudio.local",
                                        assetsFolder.c_str(),
                                        COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW
                                    );
                                }

                                // Navigate to the application entry point
                                g_webview->Navigate(L"https://app.markdownstudio.local/index.html");
                            }

                            // Update window bounds and show control
                            UpdateWebViewBounds();
                            g_controller->put_IsVisible(TRUE);

                            return S_OK;
                        }
                    ).Get()
                );
                return S_OK;
            }
        ).Get()
    );
}

// Window Procedure
LRESULT CALLBACK WndProc(HWND hWnd, UINT message, WPARAM wParam, LPARAM lParam) {
    switch (message) {
    case WM_SIZE:
        UpdateWebViewBounds();
        return 0;

    case WM_GETMINMAXINFO: {
        LPMINMAXINFO lpMMI = (LPMINMAXINFO)lParam;
        lpMMI->ptMinTrackSize.x = 800;
        lpMMI->ptMinTrackSize.y = 520;
        return 0;
    }

    case WM_SETFOCUS:
        if (g_controller) {
            g_controller->MoveFocus(COREWEBVIEW2_MOVE_FOCUS_REASON_PROGRAMMATIC);
        }
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;

    default:
        return DefWindowProcW(hWnd, message, wParam, lParam);
    }
}

// Entry Point
int WINAPI wWinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, PWSTR pCmdLine, int nCmdShow) {
    g_hInstance = hInstance;

    // Initialize COM
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) {
        return 1;
    }

    // Verify WebView2 Runtime presence
    if (!CheckWebView2Runtime()) {
        CoUninitialize();
        return 1;
    }

    // Unpack embedded web assets to %LOCALAPPDATA%\MarkdownStudio\assets
    std::wstring assetsFolder = ExtractEmbeddedAssets(hInstance);

    // Register Window Class
    WNDCLASSEXW wcex = {};
    wcex.cbSize = sizeof(WNDCLASSEXW);
    wcex.style = CS_HREDRAW | CS_VREDRAW;
    wcex.lpfnWndProc = WndProc;
    wcex.hInstance = hInstance;
    wcex.hIcon = LoadIconW(hInstance, MAKEINTRESOURCEW(IDI_APP_ICON));
    wcex.hIconSm = LoadIconW(hInstance, MAKEINTRESOURCEW(IDI_APP_ICON));
    wcex.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wcex.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    wcex.lpszClassName = L"MarkForgeMarkdownStudioWindowClass";

    if (!RegisterClassExW(&wcex)) {
        MessageBoxW(NULL, L"Failed to register application window class.", APP_NAME_W, MB_ICONERROR);
        CoUninitialize();
        return 1;
    }

    // Center window on screen
    int screenW = GetSystemMetrics(SM_CXSCREEN);
    int screenH = GetSystemMetrics(SM_CYSCREEN);
    int winW = 1280;
    int winH = 800;
    int posX = (screenW - winW) / 2;
    int posY = (screenH - winH) / 2;

    g_hWnd = CreateWindowExW(
        0,
        wcex.lpszClassName,
        APP_NAME_W,
        WS_OVERLAPPEDWINDOW,
        posX, posY, winW, winH,
        NULL, NULL, hInstance, NULL
    );

    if (!g_hWnd) {
        MessageBoxW(NULL, L"Failed to create application window.", APP_NAME_W, MB_ICONERROR);
        CoUninitialize();
        return 1;
    }

    // Apply immersive dark mode title bar
    ApplyDarkModeTitleBar(g_hWnd);

    // Initialize embedded WebView2 control
    InitWebView(g_hWnd, assetsFolder);

    ShowWindow(g_hWnd, nCmdShow);
    UpdateWindow(g_hWnd);

    // Main message loop
    MSG msg = {};
    while (GetMessageW(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    CoUninitialize();
    return (int)msg.wParam;
}
