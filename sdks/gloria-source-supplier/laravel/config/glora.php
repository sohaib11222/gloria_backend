<?php

return [
    'supplier_base_url' => env('GLORA_SUPPLIER_BASE_URL', ''),
    'path_branches' => env('GLORA_PATH_BRANCHES', '/locations'),
    'path_search' => env('GLORA_PATH_SEARCH', '/availability'),
    'path_book' => env('GLORA_PATH_BOOK', '/booking'),
    'path_cancel' => env('GLORA_PATH_CANCEL', '/cancel'),
    'path_status' => env('GLORA_PATH_STATUS', '/status'),
    'requestor_id' => env('GLORA_REQUESTOR_ID', '1000097'),
];
