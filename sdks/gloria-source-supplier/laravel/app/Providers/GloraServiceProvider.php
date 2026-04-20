<?php

declare(strict_types=1);

namespace App\Providers;

use Gloria\Client\Supplier\Config\AdapterConfig;
use Gloria\Client\Supplier\GloraOtaAdapter;
use Illuminate\Support\ServiceProvider;

/**
 * Copy into app/Providers/GloraServiceProvider.php and register in bootstrap/providers.php or config/app.php.
 */
final class GloraServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../../config/glora.php', 'glora');

        $this->app->singleton(GloraOtaAdapter::class, function () {
            $base = (string) config('glora.supplier_base_url');
            if ($base === '') {
                throw new \RuntimeException('config glora.supplier_base_url (GLORA_SUPPLIER_BASE_URL) is required');
            }
            $cfg = new AdapterConfig(
                baseUrl: $base,
                pathBranches: (string) config('glora.path_branches'),
                pathSearch: (string) config('glora.path_search'),
                pathBook: (string) config('glora.path_book'),
                pathCancel: (string) config('glora.path_cancel'),
                pathStatus: (string) config('glora.path_status'),
                requestorId: (string) config('glora.requestor_id'),
            );
            return new GloraOtaAdapter($cfg);
        });
    }

    public function boot(): void {}
}
