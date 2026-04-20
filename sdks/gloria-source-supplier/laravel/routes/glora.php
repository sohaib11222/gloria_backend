<?php

/**
 * Merge into your Laravel app routes/api.php:
 *
 *   Route::prefix('glora')->group(base_path('.../glora.php')); // not valid — paste the group body
 *
 * Or copy the Route::prefix('glora')->group(...) block below.
 */

use App\Http\Controllers\GloraController;
use Illuminate\Support\Facades\Route;

Route::prefix('glora')->group(function () {
    Route::get('/branches', [GloraController::class, 'branches']);
    Route::post('/branches', [GloraController::class, 'branches']);
    Route::post('/search', [GloraController::class, 'search']);
    Route::post('/book', [GloraController::class, 'book']);
    Route::post('/cancel', [GloraController::class, 'cancel']);
    Route::post('/status', [GloraController::class, 'status']);
});
