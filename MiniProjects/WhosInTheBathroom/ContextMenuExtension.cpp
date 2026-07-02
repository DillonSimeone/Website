#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>
#include <strsafe.h>
#include <new>
#include <string>

// {D73FC76B-7AB4-4306-BEF4-50DDA4E1980F}
static const CLSID CLSID_WhosInTheBathroom =
{ 0xd73fc76b, 0x7ab4, 0x4306, { 0xbe, 0xf4, 0x50, 0xdd, 0xa4, 0xe1, 0x98, 0x0f } };

HINSTANCE g_hInstance = nullptr;
volatile long g_dllRefCount = 0;

constexpr wchar_t kMenuText[] = L"BATHROOM CHECK";
constexpr wchar_t kRegRoot[] = L"Software\\WhosInTheBathroom";
constexpr wchar_t kRegValueHelperPath[] = L"HelperPath";
constexpr wchar_t kFriendlyName[] = L"WhosInTheBathroom?";

static std::wstring GuidToString(REFCLSID clsid)
{
    wchar_t buf[64] = {};
    if (StringFromGUID2(clsid, buf, ARRAYSIZE(buf)) == 0)
    {
        return L"";
    }
    return std::wstring(buf);
}

static HRESULT SetRegString(HKEY root, const std::wstring& subkey, const wchar_t* name, const std::wstring& value)
{
    HKEY hKey = nullptr;
    LONG rc = RegCreateKeyExW(root, subkey.c_str(), 0, nullptr, 0, KEY_SET_VALUE, nullptr, &hKey, nullptr);
    if (rc != ERROR_SUCCESS)
    {
        return HRESULT_FROM_WIN32(rc);
    }

    const DWORD cb = static_cast<DWORD>((value.size() + 1) * sizeof(wchar_t));
    rc = RegSetValueExW(hKey, name, 0, REG_SZ, reinterpret_cast<const BYTE*>(value.c_str()), cb);
    RegCloseKey(hKey);
    return (rc == ERROR_SUCCESS) ? S_OK : HRESULT_FROM_WIN32(rc);
}

static HRESULT DeleteRegTree(HKEY root, const std::wstring& subkey)
{
    LONG rc = RegDeleteTreeW(root, subkey.c_str());
    if (rc == ERROR_FILE_NOT_FOUND || rc == ERROR_PATH_NOT_FOUND)
    {
        return S_OK;
    }
    return (rc == ERROR_SUCCESS) ? S_OK : HRESULT_FROM_WIN32(rc);
}

class WhosInTheBathroomContextMenu : public IShellExtInit, public IContextMenu
{
public:
    WhosInTheBathroomContextMenu() : m_refCount(1)
    {
        InterlockedIncrement(&g_dllRefCount);
    }

    virtual ~WhosInTheBathroomContextMenu()
    {
        InterlockedDecrement(&g_dllRefCount);
    }

    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override
    {
        if (!ppv)
        {
            return E_POINTER;
        }
        *ppv = nullptr;

        if (riid == IID_IUnknown || riid == IID_IContextMenu)
        {
            *ppv = static_cast<IContextMenu*>(this);
        }
        else if (riid == IID_IShellExtInit)
        {
            *ppv = static_cast<IShellExtInit*>(this);
        }
        else
        {
            return E_NOINTERFACE;
        }

        AddRef();
        return S_OK;
    }

    IFACEMETHODIMP_(ULONG) AddRef() override
    {
        return static_cast<ULONG>(InterlockedIncrement(&m_refCount));
    }

    IFACEMETHODIMP_(ULONG) Release() override
    {
        const long refs = InterlockedDecrement(&m_refCount);
        if (refs == 0)
        {
            delete this;
            return 0;
        }
        return static_cast<ULONG>(refs);
    }

    IFACEMETHODIMP Initialize(LPCITEMIDLIST, IDataObject* pDataObj, HKEY) override
    {
        m_selectedPath.clear();
        if (!pDataObj)
        {
            return E_INVALIDARG;
        }

        FORMATETC fmt = { CF_HDROP, nullptr, DVASPECT_CONTENT, -1, TYMED_HGLOBAL };
        STGMEDIUM stg = {};
        HRESULT hr = pDataObj->GetData(&fmt, &stg);
        if (FAILED(hr))
        {
            return hr;
        }

        HDROP hDrop = static_cast<HDROP>(GlobalLock(stg.hGlobal));
        if (!hDrop)
        {
            ReleaseStgMedium(&stg);
            return E_FAIL;
        }

        wchar_t path[MAX_PATH] = {};
        const UINT fileCount = DragQueryFileW(hDrop, 0xFFFFFFFF, nullptr, 0);
        if (fileCount >= 1 && DragQueryFileW(hDrop, 0, path, ARRAYSIZE(path)) > 0)
        {
            m_selectedPath = path;
        }

        GlobalUnlock(stg.hGlobal);
        ReleaseStgMedium(&stg);
        return m_selectedPath.empty() ? E_FAIL : S_OK;
    }

    IFACEMETHODIMP QueryContextMenu(HMENU hMenu, UINT indexMenu, UINT idCmdFirst, UINT, UINT uFlags) override
    {
        if (uFlags & CMF_DEFAULTONLY)
        {
            return MAKE_HRESULT(SEVERITY_SUCCESS, FACILITY_NULL, 0);
        }

        if (!InsertMenuW(hMenu, indexMenu, MF_BYPOSITION | MF_STRING, idCmdFirst, kMenuText))
        {
            return HRESULT_FROM_WIN32(GetLastError());
        }

        return MAKE_HRESULT(SEVERITY_SUCCESS, FACILITY_NULL, 1);
    }

    IFACEMETHODIMP InvokeCommand(LPCMINVOKECOMMANDINFO pCmdInfo) override
    {
        if (!pCmdInfo)
        {
            return E_INVALIDARG;
        }

        if (HIWORD(pCmdInfo->lpVerb) != 0 || LOWORD(pCmdInfo->lpVerb) != 0)
        {
            return E_FAIL;
        }

        return LaunchHelperElevated();
    }

    IFACEMETHODIMP GetCommandString(UINT_PTR, UINT, UINT*, LPSTR, UINT) override
    {
        return E_NOTIMPL;
    }

private:
    HRESULT LaunchHelperElevated()
    {
        wchar_t helperPath[MAX_PATH] = {};
        DWORD cb = sizeof(helperPath);
        LONG rc = RegGetValueW(
            HKEY_LOCAL_MACHINE,
            kRegRoot,
            kRegValueHelperPath,
            RRF_RT_REG_SZ,
            nullptr,
            helperPath,
            &cb);
        if (rc != ERROR_SUCCESS)
        {
            return HRESULT_FROM_WIN32(rc);
        }

        std::wstring params = L"\"";
        params += m_selectedPath;
        params += L"\"";

        SHELLEXECUTEINFOW sei = {};
        sei.cbSize = sizeof(sei);
        sei.fMask = SEE_MASK_NOCLOSEPROCESS;
        sei.hwnd = nullptr;
        sei.lpVerb = L"runas";
        sei.lpFile = helperPath;
        sei.lpParameters = params.c_str();
        sei.nShow = SW_SHOWNORMAL;

        if (!ShellExecuteExW(&sei))
        {
            return HRESULT_FROM_WIN32(GetLastError());
        }

        if (sei.hProcess)
        {
            CloseHandle(sei.hProcess);
        }
        return S_OK;
    }

private:
    long m_refCount;
    std::wstring m_selectedPath;
};

class ContextMenuClassFactory : public IClassFactory
{
public:
    ContextMenuClassFactory() : m_refCount(1)
    {
        InterlockedIncrement(&g_dllRefCount);
    }

    virtual ~ContextMenuClassFactory()
    {
        InterlockedDecrement(&g_dllRefCount);
    }

    IFACEMETHODIMP QueryInterface(REFIID riid, void** ppv) override
    {
        if (!ppv)
        {
            return E_POINTER;
        }
        *ppv = nullptr;

        if (riid == IID_IUnknown || riid == IID_IClassFactory)
        {
            *ppv = static_cast<IClassFactory*>(this);
            AddRef();
            return S_OK;
        }

        return E_NOINTERFACE;
    }

    IFACEMETHODIMP_(ULONG) AddRef() override
    {
        return static_cast<ULONG>(InterlockedIncrement(&m_refCount));
    }

    IFACEMETHODIMP_(ULONG) Release() override
    {
        const long refs = InterlockedDecrement(&m_refCount);
        if (refs == 0)
        {
            delete this;
            return 0;
        }
        return static_cast<ULONG>(refs);
    }

    IFACEMETHODIMP CreateInstance(IUnknown* pUnkOuter, REFIID riid, void** ppv) override
    {
        if (pUnkOuter)
        {
            return CLASS_E_NOAGGREGATION;
        }

        auto* ext = new (std::nothrow) WhosInTheBathroomContextMenu();
        if (!ext)
        {
            return E_OUTOFMEMORY;
        }

        HRESULT hr = ext->QueryInterface(riid, ppv);
        ext->Release();
        return hr;
    }

    IFACEMETHODIMP LockServer(BOOL fLock) override
    {
        if (fLock)
        {
            InterlockedIncrement(&g_dllRefCount);
        }
        else
        {
            InterlockedDecrement(&g_dllRefCount);
        }
        return S_OK;
    }

private:
    long m_refCount;
};

extern "C" BOOL APIENTRY DllMain(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID)
{
    if (fdwReason == DLL_PROCESS_ATTACH)
    {
        g_hInstance = hinstDLL;
        DisableThreadLibraryCalls(hinstDLL);
    }
    return TRUE;
}

extern "C" HRESULT __stdcall DllCanUnloadNow(void)
{
    return (g_dllRefCount == 0) ? S_OK : S_FALSE;
}

extern "C" HRESULT __stdcall DllGetClassObject(REFCLSID rclsid, REFIID riid, LPVOID* ppv)
{
    if (rclsid != CLSID_WhosInTheBathroom)
    {
        return CLASS_E_CLASSNOTAVAILABLE;
    }

    auto* factory = new (std::nothrow) ContextMenuClassFactory();
    if (!factory)
    {
        return E_OUTOFMEMORY;
    }

    HRESULT hr = factory->QueryInterface(riid, ppv);
    factory->Release();
    return hr;
}

extern "C" HRESULT __stdcall DllRegisterServer(void)
{
    wchar_t dllPath[MAX_PATH] = {};
    if (GetModuleFileNameW(g_hInstance, dllPath, ARRAYSIZE(dllPath)) == 0)
    {
        return HRESULT_FROM_WIN32(GetLastError());
    }

    const std::wstring clsid = GuidToString(CLSID_WhosInTheBathroom);
    if (clsid.empty())
    {
        return E_FAIL;
    }

    std::wstring clsidRoot = L"Software\\Classes\\CLSID\\" + clsid;
    std::wstring inproc = clsidRoot + L"\\InprocServer32";
    std::wstring handlerStar = L"Software\\Classes\\*\\shellex\\ContextMenuHandlers\\WhosInTheBathroom";
    std::wstring handlerDir = L"Software\\Classes\\Directory\\shellex\\ContextMenuHandlers\\WhosInTheBathroom";

    HRESULT hr = SetRegString(HKEY_LOCAL_MACHINE, clsidRoot, nullptr, kFriendlyName);
    if (FAILED(hr)) return hr;
    hr = SetRegString(HKEY_LOCAL_MACHINE, inproc, nullptr, dllPath);
    if (FAILED(hr)) return hr;
    hr = SetRegString(HKEY_LOCAL_MACHINE, inproc, L"ThreadingModel", L"Apartment");
    if (FAILED(hr)) return hr;
    hr = SetRegString(HKEY_LOCAL_MACHINE, handlerStar, nullptr, clsid);
    if (FAILED(hr)) return hr;
    hr = SetRegString(HKEY_LOCAL_MACHINE, handlerDir, nullptr, clsid);
    if (FAILED(hr)) return hr;

    return S_OK;
}

extern "C" HRESULT __stdcall DllUnregisterServer(void)
{
    const std::wstring clsid = GuidToString(CLSID_WhosInTheBathroom);
    if (clsid.empty())
    {
        return E_FAIL;
    }

    std::wstring clsidRoot = L"Software\\Classes\\CLSID\\" + clsid;
    std::wstring handlerStar = L"Software\\Classes\\*\\shellex\\ContextMenuHandlers\\WhosInTheBathroom";
    std::wstring handlerDir = L"Software\\Classes\\Directory\\shellex\\ContextMenuHandlers\\WhosInTheBathroom";

    HRESULT hr1 = DeleteRegTree(HKEY_LOCAL_MACHINE, handlerStar);
    HRESULT hr2 = DeleteRegTree(HKEY_LOCAL_MACHINE, handlerDir);
    HRESULT hr3 = DeleteRegTree(HKEY_LOCAL_MACHINE, clsidRoot);

    return FAILED(hr1) ? hr1 : (FAILED(hr2) ? hr2 : hr3);
}
