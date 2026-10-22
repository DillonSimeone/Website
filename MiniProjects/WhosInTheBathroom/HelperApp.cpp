#include <windows.h>
#include <commctrl.h>
#include <winternl.h>
#include <shellapi.h>
#include <strsafe.h>

#include <algorithm>
#include <cstdlib>
#include <cstdint>
#include <memory>
#include <set>
#include <string>
#include <vector>

#pragma comment(lib, "comctl32.lib")

constexpr UINT_PTR IDC_BTN_KILL_ALL = 1001;
constexpr UINT_PTR IDC_LIST = 1002;
constexpr UINT_PTR IDC_LABEL_PATH = 1003;
constexpr UINT_PTR IDC_LABEL_STATUS = 1004;
constexpr UINT_PTR IDC_LABEL_TITLE = 1005;
constexpr UINT WM_APP_REFRESH_COMPLETE = WM_APP + 1;
constexpr NTSTATUS kStatusInfoLengthMismatch = static_cast<NTSTATUS>(0xC0000004L);
constexpr NTSTATUS kStatusUnsuccessful = static_cast<NTSTATUS>(0xC0000001L);
constexpr SYSTEM_INFORMATION_CLASS kSystemHandleInformationClass = static_cast<SYSTEM_INFORMATION_CLASS>(16);
constexpr OBJECT_INFORMATION_CLASS kObjectNameInformationClass = static_cast<OBJECT_INFORMATION_CLASS>(1);

struct SystemHandleEntry
{
    ULONG ProcessId;
    BYTE ObjectTypeNumber;
    BYTE Flags;
    USHORT Handle;
    PVOID Object;
    ACCESS_MASK GrantedAccess;
};

struct SYSTEM_HANDLE_INFORMATION_EX_COMPAT
{
    ULONG HandleCount;
    SystemHandleEntry Handles[1];
};

using NtQuerySystemInformationFn = NTSTATUS(NTAPI*)(SYSTEM_INFORMATION_CLASS, PVOID, ULONG, PULONG);
using NtQueryObjectFn = NTSTATUS(NTAPI*)(HANDLE, OBJECT_INFORMATION_CLASS, PVOID, ULONG, PULONG);

struct NameQueryContext
{
    NtQueryObjectFn NtQueryObject;
    HANDLE HandleToQuery;
    std::wstring* ResultName;
    NTSTATUS Status;
};

struct LockingProcess
{
    std::wstring processName;
    DWORD pid;
};

HINSTANCE g_hInst = nullptr;
HWND g_hMainWnd = nullptr;
HWND g_hList = nullptr;
HWND g_hBtnKillAll = nullptr;
HWND g_hPathLabel = nullptr;
HWND g_hStatusLabel = nullptr;
HWND g_hTitleLabel = nullptr;
HFONT g_hFontUi = nullptr;
HFONT g_hFontUiBold = nullptr;
HFONT g_hFontTitle = nullptr;
HBRUSH g_hWindowBrush = nullptr;
std::wstring g_targetPathDos;
std::wstring g_targetPathNtPrefix;
std::vector<LockingProcess> g_rows;
volatile LONG g_refreshInProgress = 0;
volatile LONG g_refreshQueued = 0;

COLORREF g_colorBg = RGB(241, 244, 248);
COLORREF g_colorTitle = RGB(18, 33, 56);
COLORREF g_colorText = RGB(30, 37, 46);
COLORREF g_colorMuted = RGB(85, 96, 112);

std::wstring ToLower(std::wstring s)
{
    std::transform(s.begin(), s.end(), s.begin(), [](wchar_t c) { return static_cast<wchar_t>(towlower(c)); });
    return s;
}

void DebugLog(const std::wstring& msg)
{
    OutputDebugStringW((L"[WhosInTheBathroom] " + msg + L"\n").c_str());
}

std::wstring GetProcessNameByPid(DWORD pid)
{
    std::wstring name = L"<unknown>";
    HANDLE hProcess = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!hProcess)
    {
        return name;
    }

    wchar_t path[MAX_PATH] = {};
    DWORD len = ARRAYSIZE(path);
    if (QueryFullProcessImageNameW(hProcess, 0, path, &len))
    {
        const wchar_t* lastSlash = wcsrchr(path, L'\\');
        name = lastSlash ? (lastSlash + 1) : path;
    }

    CloseHandle(hProcess);
    return name;
}

std::wstring BuildNtPrefixFromDosPath(const std::wstring& absDosPath)
{
    if (absDosPath.size() < 2 || absDosPath[1] != L':')
    {
        return L"";
    }

    const std::wstring drive = absDosPath.substr(0, 2);
    wchar_t devicePath[1024] = {};
    if (QueryDosDeviceW(drive.c_str(), devicePath, ARRAYSIZE(devicePath)) == 0)
    {
        return L"";
    }

    std::wstring suffix = absDosPath.substr(2); // includes leading backslash
    return std::wstring(devicePath) + suffix;
}

DWORD WINAPI QueryObjectNameThreadProc(LPVOID param)
{
    auto* ctx = static_cast<NameQueryContext*>(param);
    if (!ctx || !ctx->NtQueryObject || !ctx->ResultName)
    {
        return 1;
    }

    ULONG needed = 0;
    NTSTATUS status = ctx->NtQueryObject(ctx->HandleToQuery, kObjectNameInformationClass, nullptr, 0, &needed);
    if (status != kStatusInfoLengthMismatch && needed == 0)
    {
        ctx->Status = status;
        return 1;
    }

    std::vector<BYTE> buffer(needed + sizeof(WCHAR) * 2);
    status = ctx->NtQueryObject(
        ctx->HandleToQuery,
        kObjectNameInformationClass,
        buffer.data(),
        static_cast<ULONG>(buffer.size()),
        &needed);
    ctx->Status = status;
    if (status < 0)
    {
        return 1;
    }

    auto* uni = reinterpret_cast<UNICODE_STRING*>(buffer.data());
    if (uni->Buffer && uni->Length > 0)
    {
        ctx->ResultName->assign(uni->Buffer, uni->Length / sizeof(wchar_t));
    }
    return 0;
}

bool QueryObjectNameWithTimeout(NtQueryObjectFn NtQueryObject, HANDLE handleToQuery, std::wstring& outName)
{
    outName.clear();
    NameQueryContext ctx = {};
    ctx.NtQueryObject = NtQueryObject;
    ctx.HandleToQuery = handleToQuery;
    ctx.ResultName = &outName;
    ctx.Status = kStatusUnsuccessful;

    HANDLE hThread = CreateThread(nullptr, 0, QueryObjectNameThreadProc, &ctx, 0, nullptr);
    if (!hThread)
    {
        return false;
    }

    const DWORD wait = WaitForSingleObject(hThread, 50);
    if (wait == WAIT_TIMEOUT)
    {
        // Hard safeguard against kernel-mode stalls in NtQueryObject.
        TerminateThread(hThread, static_cast<DWORD>(STATUS_TIMEOUT));
        CloseHandle(hThread);
        return false;
    }

    CloseHandle(hThread);
    return (ctx.Status >= 0) && !outName.empty();
}

bool PathMatchesTarget(const std::wstring& objectName, const std::wstring& targetNtLower)
{
    if (objectName.empty() || targetNtLower.empty())
    {
        return false;
    }

    const std::wstring nameLower = ToLower(objectName);
    if (nameLower == targetNtLower)
    {
        return true;
    }

    // Directory match: handle path begins with target path + separator.
    if (nameLower.size() > targetNtLower.size() &&
        nameLower.compare(0, targetNtLower.size(), targetNtLower) == 0 &&
        (nameLower[targetNtLower.size()] == L'\\' || nameLower[targetNtLower.size()] == L'/'))
    {
        return true;
    }

    return false;
}

std::vector<LockingProcess> EnumerateLockingProcesses(const std::wstring& targetPathDos)
{
    std::vector<LockingProcess> result;
    std::set<DWORD> seenPids;

    HMODULE hNtdll = GetModuleHandleW(L"ntdll.dll");
    if (!hNtdll)
    {
        return result;
    }

    auto NtQuerySystemInformation = reinterpret_cast<NtQuerySystemInformationFn>(
        GetProcAddress(hNtdll, "NtQuerySystemInformation"));
    auto NtQueryObject = reinterpret_cast<NtQueryObjectFn>(
        GetProcAddress(hNtdll, "NtQueryObject"));
    if (!NtQuerySystemInformation || !NtQueryObject)
    {
        return result;
    }

    std::wstring targetNt = BuildNtPrefixFromDosPath(targetPathDos);
    if (targetNt.empty())
    {
        return result;
    }
    const std::wstring targetNtLower = ToLower(targetNt);

    ULONG bufSize = 0x10000;
    std::vector<BYTE> buffer;
    NTSTATUS status = kStatusInfoLengthMismatch;
    ULONG returned = 0;

    while (status == kStatusInfoLengthMismatch)
    {
        buffer.resize(bufSize);
        status = NtQuerySystemInformation(kSystemHandleInformationClass, buffer.data(), bufSize, &returned);
        if (status == kStatusInfoLengthMismatch)
        {
            bufSize = (returned > bufSize) ? (returned + 0x10000) : (bufSize * 2);
        }
    }

    if (status < 0)
    {
        return result;
    }

    const auto* info = reinterpret_cast<const SYSTEM_HANDLE_INFORMATION_EX_COMPAT*>(buffer.data());
    if (!info || info->HandleCount == 0)
    {
        return result;
    }

    for (ULONG i = 0; i < info->HandleCount; ++i)
    {
        const auto& h = info->Handles[i];
        if (h.ProcessId == 0 || h.ProcessId == GetCurrentProcessId())
        {
            continue;
        }

        HANDLE hSourceProcess = OpenProcess(PROCESS_DUP_HANDLE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, h.ProcessId);
        if (!hSourceProcess)
        {
            continue;
        }

        HANDLE hDup = nullptr;
        const BOOL dupOk = DuplicateHandle(
            hSourceProcess,
            reinterpret_cast<HANDLE>(static_cast<ULONG_PTR>(h.Handle)),
            GetCurrentProcess(),
            &hDup,
            0,
            FALSE,
            DUPLICATE_SAME_ACCESS);
        CloseHandle(hSourceProcess);

        if (!dupOk || !hDup)
        {
            continue;
        }

        std::wstring objectName;
        const bool gotName = QueryObjectNameWithTimeout(NtQueryObject, hDup, objectName);
        CloseHandle(hDup);

        if (!gotName)
        {
            continue;
        }

        if (!PathMatchesTarget(objectName, targetNtLower))
        {
            continue;
        }

        const DWORD pid = h.ProcessId;
        if (seenPids.insert(pid).second)
        {
            result.push_back({ GetProcessNameByPid(pid), pid });
        }
    }

    std::sort(result.begin(), result.end(), [](const LockingProcess& a, const LockingProcess& b)
        {
            if (a.processName == b.processName)
            {
                return a.pid < b.pid;
            }
            return a.processName < b.processName;
        });

    return result;
}

void SetStatusText(const std::wstring& text)
{
    if (g_hStatusLabel)
    {
        SetWindowTextW(g_hStatusLabel, text.c_str());
    }
}

std::wstring BuildStatusText()
{
    if (g_rows.empty())
    {
        return L"No locking processes currently detected.";
    }
    return L"Found " + std::to_wstring(g_rows.size()) + L" locking process(es).";
}

void RefreshListViewRows()
{
    ListView_DeleteAllItems(g_hList);
    for (size_t i = 0; i < g_rows.size(); ++i)
    {
        const auto& row = g_rows[i];
        LVITEMW item = {};
        item.mask = LVIF_TEXT | LVIF_PARAM;
        item.iItem = static_cast<int>(i);
        item.iSubItem = 0;
        item.pszText = const_cast<LPWSTR>(row.processName.c_str());
        item.lParam = static_cast<LPARAM>(row.pid);
        const int index = ListView_InsertItem(g_hList, &item);
        if (index >= 0)
        {
            wchar_t pidText[32] = {};
            StringCchPrintfW(pidText, ARRAYSIZE(pidText), L"%lu", row.pid);
            ListView_SetItemText(g_hList, index, 1, pidText);
            ListView_SetItemText(g_hList, index, 2, const_cast<LPWSTR>(L"KILL"));
        }
    }
}

DWORD WINAPI RefreshThreadProc(LPVOID)
{
    auto* rows = new (std::nothrow) std::vector<LockingProcess>(EnumerateLockingProcesses(g_targetPathDos));
    if (!rows)
    {
        InterlockedExchange(&g_refreshInProgress, 0);
        PostMessageW(g_hMainWnd, WM_APP_REFRESH_COMPLETE, 0, 0);
        return 1;
    }

    if (!PostMessageW(g_hMainWnd, WM_APP_REFRESH_COMPLETE, reinterpret_cast<WPARAM>(rows), 0))
    {
        delete rows;
        InterlockedExchange(&g_refreshInProgress, 0);
        return 1;
    }
    return 0;
}

void StartRefreshEnumeration()
{
    if (InterlockedCompareExchange(&g_refreshInProgress, 1, 0) != 0)
    {
        InterlockedExchange(&g_refreshQueued, 1);
        return;
    }

    SetStatusText(L"Scanning system handles...");
    HANDLE hThread = CreateThread(nullptr, 0, RefreshThreadProc, nullptr, 0, nullptr);
    if (!hThread)
    {
        InterlockedExchange(&g_refreshInProgress, 0);
        SetStatusText(L"Failed to start background scan.");
        return;
    }
    CloseHandle(hThread);
}

bool TryTerminatePid(DWORD pid)
{
    HANDLE hProcess = OpenProcess(PROCESS_TERMINATE, FALSE, pid);
    if (!hProcess)
    {
        DebugLog(L"OpenProcess failed for PID " + std::to_wstring(pid) + L", err=" + std::to_wstring(GetLastError()));
        return false;
    }

    const BOOL ok = TerminateProcess(hProcess, EXIT_FAILURE);
    if (!ok)
    {
        DebugLog(L"TerminateProcess failed for PID " + std::to_wstring(pid) + L", err=" + std::to_wstring(GetLastError()));
    }

    CloseHandle(hProcess);
    return ok == TRUE;
}

void KillAllRows()
{
    for (const auto& row : g_rows)
    {
        try
        {
            (void)TryTerminatePid(row.pid);
        }
        catch (...)
        {
            DebugLog(L"Exception while terminating PID " + std::to_wstring(row.pid));
        }
    }
    StartRefreshEnumeration();
}

void KillSingleRowByIndex(int index)
{
    if (index < 0 || static_cast<size_t>(index) >= g_rows.size())
    {
        return;
    }

    const DWORD pid = g_rows[index].pid;
    try
    {
        (void)TryTerminatePid(pid);
    }
    catch (...)
    {
        DebugLog(L"Exception while terminating PID " + std::to_wstring(pid));
    }
    StartRefreshEnumeration();
}

void InitListColumns(HWND hList)
{
    LVCOLUMNW col = {};
    col.mask = LVCF_TEXT | LVCF_WIDTH | LVCF_SUBITEM;

    col.pszText = const_cast<LPWSTR>(L"Process Name");
    col.cx = 320;
    col.iSubItem = 0;
    ListView_InsertColumn(hList, 0, &col);

    col.pszText = const_cast<LPWSTR>(L"PID");
    col.cx = 90;
    col.iSubItem = 1;
    ListView_InsertColumn(hList, 1, &col);

    col.pszText = const_cast<LPWSTR>(L"KILL");
    col.cx = 90;
    col.iSubItem = 2;
    ListView_InsertColumn(hList, 2, &col);
}

void InitUiFonts()
{
    if (g_hFontUi && g_hFontUiBold && g_hFontTitle)
    {
        return;
    }

    NONCLIENTMETRICSW ncm = {};
    ncm.cbSize = sizeof(ncm);
    if (!SystemParametersInfoW(SPI_GETNONCLIENTMETRICS, sizeof(ncm), &ncm, 0))
    {
        return;
    }

    LOGFONTW normal = ncm.lfMessageFont;
    g_hFontUi = CreateFontIndirectW(&normal);

    LOGFONTW bold = ncm.lfMessageFont;
    bold.lfWeight = FW_SEMIBOLD;
    g_hFontUiBold = CreateFontIndirectW(&bold);

    LOGFONTW title = ncm.lfMessageFont;
    title.lfWeight = FW_BOLD;
    title.lfHeight = -22;
    g_hFontTitle = CreateFontIndirectW(&title);
}

void ApplyUiFonts()
{
    InitUiFonts();
    if (g_hFontUi)
    {
        if (g_hList) SendMessageW(g_hList, WM_SETFONT, reinterpret_cast<WPARAM>(g_hFontUi), TRUE);
        if (g_hPathLabel) SendMessageW(g_hPathLabel, WM_SETFONT, reinterpret_cast<WPARAM>(g_hFontUi), TRUE);
        if (g_hStatusLabel) SendMessageW(g_hStatusLabel, WM_SETFONT, reinterpret_cast<WPARAM>(g_hFontUi), TRUE);
    }
    if (g_hFontUiBold && g_hBtnKillAll)
    {
        SendMessageW(g_hBtnKillAll, WM_SETFONT, reinterpret_cast<WPARAM>(g_hFontUiBold), TRUE);
    }
    if (g_hFontTitle && g_hTitleLabel)
    {
        SendMessageW(g_hTitleLabel, WM_SETFONT, reinterpret_cast<WPARAM>(g_hFontTitle), TRUE);
    }
}

void LayoutControls(HWND hWnd)
{
    RECT rc = {};
    GetClientRect(hWnd, &rc);
    const int width = rc.right - rc.left;
    const int height = rc.bottom - rc.top;

    const int margin = 14;
    const int buttonWidth = 176;
    const int buttonHeight = 34;
    const int titleHeight = 30;
    const int pathHeight = 26;
    const int statusHeight = 20;

    const int rightX = margin + buttonWidth + 12;
    const int rightWidth = width - (margin + rightX);

    MoveWindow(g_hBtnKillAll, margin, margin + 4, buttonWidth, buttonHeight, TRUE);
    MoveWindow(g_hTitleLabel, rightX, margin - 1, rightWidth, titleHeight, TRUE);
    MoveWindow(g_hPathLabel, rightX, margin + titleHeight - 2, rightWidth, pathHeight, TRUE);
    MoveWindow(g_hStatusLabel, rightX, margin + titleHeight + pathHeight, rightWidth, statusHeight, TRUE);

    const int listTop = margin + titleHeight + pathHeight + statusHeight + 10;
    MoveWindow(g_hList, margin, listTop, width - (2 * margin), height - (listTop + margin), TRUE);
}

LRESULT CALLBACK MainWndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg)
    {
    case WM_CREATE:
    {
        g_hBtnKillAll = CreateWindowExW(
            0,
            L"BUTTON",
            L"KILL ALL LOCKERS",
            WS_CHILD | WS_VISIBLE | BS_DEFPUSHBUTTON,
            0, 0, 0, 0,
            hWnd,
            reinterpret_cast<HMENU>(IDC_BTN_KILL_ALL),
            g_hInst,
            nullptr);

        g_hTitleLabel = CreateWindowExW(
            0,
            L"STATIC",
            L"BATHROOM CHECK",
            WS_CHILD | WS_VISIBLE | SS_LEFT,
            0, 0, 0, 0,
            hWnd,
            reinterpret_cast<HMENU>(IDC_LABEL_TITLE),
            g_hInst,
            nullptr);

        std::wstring pathText = L"Target: ";
        pathText += g_targetPathDos;
        g_hPathLabel = CreateWindowExW(
            WS_EX_CLIENTEDGE,
            L"STATIC",
            pathText.c_str(),
            WS_CHILD | WS_VISIBLE | SS_LEFT | SS_ENDELLIPSIS,
            0, 0, 0, 0,
            hWnd,
            reinterpret_cast<HMENU>(IDC_LABEL_PATH),
            g_hInst,
            nullptr);

        g_hStatusLabel = CreateWindowExW(
            0,
            L"STATIC",
            L"Preparing scan...",
            WS_CHILD | WS_VISIBLE | SS_LEFT,
            0, 0, 0, 0,
            hWnd,
            reinterpret_cast<HMENU>(IDC_LABEL_STATUS),
            g_hInst,
            nullptr);

        g_hList = CreateWindowExW(
            WS_EX_CLIENTEDGE,
            WC_LISTVIEWW,
            L"",
            WS_CHILD | WS_VISIBLE | LVS_REPORT | LVS_SINGLESEL,
            0, 0, 0, 0,
            hWnd,
            reinterpret_cast<HMENU>(IDC_LIST),
            g_hInst,
            nullptr);

        ListView_SetExtendedListViewStyle(g_hList, LVS_EX_FULLROWSELECT | LVS_EX_GRIDLINES | LVS_EX_DOUBLEBUFFER);
        InitListColumns(g_hList);
        ApplyUiFonts();
        LayoutControls(hWnd);
        StartRefreshEnumeration();
        return 0;
    }
    case WM_SIZE:
        LayoutControls(hWnd);
        return 0;
    case WM_COMMAND:
        if (LOWORD(wParam) == IDC_BTN_KILL_ALL)
        {
            KillAllRows();
            return 0;
        }
        break;
    case WM_NOTIFY:
    {
        const NMHDR* hdr = reinterpret_cast<const NMHDR*>(lParam);
        if (hdr && hdr->idFrom == IDC_LIST && hdr->code == NM_CUSTOMDRAW)
        {
            auto* cd = reinterpret_cast<LPNMLVCUSTOMDRAW>(lParam);
            if (cd->nmcd.dwDrawStage == CDDS_PREPAINT)
            {
                return CDRF_NOTIFYITEMDRAW;
            }
            if (cd->nmcd.dwDrawStage == CDDS_ITEMPREPAINT)
            {
                return CDRF_NOTIFYSUBITEMDRAW;
            }
            if (cd->nmcd.dwDrawStage == (CDDS_ITEMPREPAINT | CDDS_SUBITEM))
            {
                const bool alt = ((cd->nmcd.dwItemSpec % 2) != 0);
                cd->clrTextBk = alt ? RGB(248, 250, 252) : RGB(255, 255, 255);
                cd->clrText = RGB(28, 35, 44);
                return CDRF_DODEFAULT;
            }
        }
        if (hdr && hdr->idFrom == IDC_LIST && hdr->code == NM_CLICK)
        {
            auto* act = reinterpret_cast<const NMITEMACTIVATE*>(lParam);
            if (act && act->iItem >= 0 && act->iSubItem == 2)
            {
                KillSingleRowByIndex(act->iItem);
            }
        }
        break;
    }
    case WM_APP_REFRESH_COMPLETE:
    {
        auto* rows = reinterpret_cast<std::vector<LockingProcess>*>(wParam);
        if (rows)
        {
            g_rows = std::move(*rows);
            delete rows;
        }

        RefreshListViewRows();
        InterlockedExchange(&g_refreshInProgress, 0);
        SetStatusText(BuildStatusText());

        if (InterlockedExchange(&g_refreshQueued, 0) != 0)
        {
            StartRefreshEnumeration();
        }
        return 0;
    }
    case WM_CTLCOLORSTATIC:
    {
        HDC hdc = reinterpret_cast<HDC>(wParam);
        SetBkMode(hdc, TRANSPARENT);
        HWND ctl = reinterpret_cast<HWND>(lParam);
        if (ctl == g_hTitleLabel)
        {
            SetTextColor(hdc, g_colorTitle);
        }
        else if (ctl == g_hStatusLabel)
        {
            SetTextColor(hdc, g_colorMuted);
        }
        else
        {
            SetTextColor(hdc, g_colorText);
        }
        return reinterpret_cast<INT_PTR>(g_hWindowBrush);
    }
    case WM_CLOSE:
        DestroyWindow(hWnd);
        return 0;
    case WM_DESTROY:
        if (g_hFontUi)
        {
            DeleteObject(g_hFontUi);
            g_hFontUi = nullptr;
        }
        if (g_hFontUiBold)
        {
            DeleteObject(g_hFontUiBold);
            g_hFontUiBold = nullptr;
        }
        if (g_hFontTitle)
        {
            DeleteObject(g_hFontTitle);
            g_hFontTitle = nullptr;
        }
        if (g_hWindowBrush)
        {
            DeleteObject(g_hWindowBrush);
            g_hWindowBrush = nullptr;
        }
        PostQuitMessage(0);
        return 0;
    default:
        break;
    }
    return DefWindowProcW(hWnd, msg, wParam, lParam);
}

int APIENTRY wWinMain(HINSTANCE hInstance, HINSTANCE, LPWSTR, int nCmdShow)
{
    g_hInst = hInstance;

    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv || argc < 2)
    {
        MessageBoxW(nullptr, L"No target path provided.", L"WhosInTheBathroom?", MB_ICONERROR | MB_OK);
        if (argv) LocalFree(argv);
        return EXIT_FAILURE;
    }

    wchar_t fullPath[MAX_PATH] = {};
    if (!GetFullPathNameW(argv[1], ARRAYSIZE(fullPath), fullPath, nullptr))
    {
        MessageBoxW(nullptr, L"Invalid target path.", L"WhosInTheBathroom?", MB_ICONERROR | MB_OK);
        LocalFree(argv);
        return EXIT_FAILURE;
    }
    g_targetPathDos = fullPath;
    g_targetPathNtPrefix = BuildNtPrefixFromDosPath(g_targetPathDos);
    LocalFree(argv);

    INITCOMMONCONTROLSEX icc = {};
    icc.dwSize = sizeof(icc);
    icc.dwICC = ICC_LISTVIEW_CLASSES;
    InitCommonControlsEx(&icc);

    const wchar_t kClassName[] = L"WhosInTheBathroomMainWnd";
    g_hWindowBrush = CreateSolidBrush(g_colorBg);
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = MainWndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = g_hWindowBrush ? g_hWindowBrush : reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
    wc.lpszClassName = kClassName;
    wc.hIcon = LoadIcon(nullptr, IDI_WARNING);

    if (!RegisterClassExW(&wc))
    {
        return EXIT_FAILURE;
    }

    g_hMainWnd = CreateWindowExW(
        0,
        kClassName,
        L"WhosInTheBathroom?",
        WS_OVERLAPPEDWINDOW | WS_VISIBLE,
        CW_USEDEFAULT,
        CW_USEDEFAULT,
        560,
        420,
        nullptr,
        nullptr,
        hInstance,
        nullptr);
    if (!g_hMainWnd)
    {
        return EXIT_FAILURE;
    }

    ShowWindow(g_hMainWnd, nCmdShow);
    UpdateWindow(g_hMainWnd);

    MSG msg = {};
    while (GetMessageW(&msg, nullptr, 0, 0) > 0)
    {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    return static_cast<int>(msg.wParam);
}
