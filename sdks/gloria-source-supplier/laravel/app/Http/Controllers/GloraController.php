<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Routing\Controller;

use Gloria\Client\Supplier\Config\AdapterConfig;
use Gloria\Client\Supplier\Exception\SupplierException;
use Gloria\Client\Supplier\GloraOtaAdapter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Copy into your Laravel app (e.g. app/Http/Controllers/GloraController.php).
 * Register adapter in AppServiceProvider:
 *
 *   $this->app->singleton(GloraOtaAdapter::class, function () {
 *       $cfg = new AdapterConfig(
 *           baseUrl: config('glora.supplier_base_url'),
 *           pathBranches: config('glora.path_branches', '/locations'),
 *           ...
 *       );
 *       return new GloraOtaAdapter($cfg);
 *   });
 *   $this->app->bind(GloraController::class, fn ($app) => new GloraController($app->make(GloraOtaAdapter::class)));
 */
final class GloraController extends Controller // Laravel base
{
    public function __construct(
        private readonly GloraOtaAdapter $adapter
    ) {}

    public function branches(Request $request): JsonResponse
    {
        try {
            $city = $request->input('city');
            $data = $this->adapter->getBranches(is_string($city) ? $city : null);
            return response()->json(['success' => true, 'branches' => $data]);
        } catch (SupplierException $e) {
            return response()->json(['success' => false, 'error' => $e->errorCode, 'message' => $e->getMessage()], 502);
        }
    }

    public function search(Request $request): JsonResponse
    {
        $v = $request->validate([
            'pickup_unlocode' => 'required|string',
            'dropoff_unlocode' => 'required|string',
            'pickup_iso' => 'required|string',
            'dropoff_iso' => 'required|string',
            'driver_age' => 'sometimes|integer',
            'residency_country' => 'sometimes|string|size:2',
        ]);
        try {
            $cars = $this->adapter->searchCars($v);
            return response()->json(['success' => true, 'cars' => $cars]);
        } catch (SupplierException $e) {
            return response()->json(['success' => false, 'error' => $e->errorCode, 'message' => $e->getMessage()], 502);
        }
    }

    public function book(Request $request): JsonResponse
    {
        $v = $request->validate([
            'agent_id' => 'required|string',
            'agreement_ref' => 'required|string',
            'supplier_offer_ref' => 'sometimes|string',
            'agent_booking_ref' => 'sometimes|string',
            'pickup_unlocode' => 'sometimes|string',
            'dropoff_unlocode' => 'sometimes|string',
            'pickup_iso' => 'sometimes|string',
            'dropoff_iso' => 'sometimes|string',
            'vehicle_class' => 'sometimes|string',
            'vehicle_make_model' => 'sometimes|string',
        ]);
        try {
            $booking = $this->adapter->bookCar($v);
            return response()->json(['success' => true, 'booking' => $booking]);
        } catch (SupplierException $e) {
            return response()->json(['success' => false, 'error' => $e->errorCode, 'message' => $e->getMessage()], 502);
        }
    }

    public function cancel(Request $request): JsonResponse
    {
        $v = $request->validate([
            'reservation_id' => 'required|string',
            'agreement_ref' => 'sometimes|string',
        ]);
        try {
            $booking = $this->adapter->cancelBooking($v['reservation_id'], $v['agreement_ref'] ?? null);
            return response()->json(['success' => true, 'booking' => $booking]);
        } catch (SupplierException $e) {
            return response()->json(['success' => false, 'error' => $e->errorCode, 'message' => $e->getMessage()], 502);
        }
    }

    public function status(Request $request): JsonResponse
    {
        $v = $request->validate([
            'reservation_id' => 'required|string',
            'agreement_ref' => 'sometimes|string',
        ]);
        try {
            $booking = $this->adapter->getBookingStatus($v['reservation_id'], $v['agreement_ref'] ?? null);
            return response()->json(['success' => true, 'booking' => $booking]);
        } catch (SupplierException $e) {
            return response()->json(['success' => false, 'error' => $e->errorCode, 'message' => $e->getMessage()], 502);
        }
    }
}
