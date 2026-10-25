#pragma once
#include "resource.h"

struct EmbeddedAsset {
    int resourceId;
    const wchar_t* relativePath;
};

static const EmbeddedAsset g_embeddedAssets[] = {
    { IDR_ASSET_0, L"assets\\core-BUhCcD2K.js" },
    { IDR_ASSET_1, L"assets\\index-4KTFpUaO.js" },
    { IDR_ASSET_2, L"assets\\index-Ce9fV9Ym.js" },
    { IDR_ASSET_3, L"assets\\index-CsLEZh9M.css" },
    { IDR_ASSET_4, L"assets\\window-BPQH9sz4.js" },
    { IDR_ASSET_5, L"index.html" },
    { IDR_ASSET_6, L"markforge-icon.png" },
};

static const size_t g_embeddedAssetCount = sizeof(g_embeddedAssets) / sizeof(g_embeddedAssets[0]);
