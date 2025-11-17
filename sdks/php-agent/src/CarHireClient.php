<?php
declare(strict_types=1);

namespace HMS\CarHire;

use HMS\CarHire\Clients\AvailabilityClient;
use HMS\CarHire\Clients\BookingClient;
use HMS\CarHire\Clients\LocationsClient;
use HMS\CarHire\Transport\GrpcTransport;
use HMS\CarHire\Transport\RestTransport;
use HMS\CarHire\Transport\TransportInterface;

final class CarHireClient
{
    private TransportInterface $transport;
    private AvailabilityClient $availability;
    private BookingClient $booking;
    private LocationsClient $locations;

    public function __construct(private Config $config)
    {
        $this->transport = $config->isGrpc()
            ? new GrpcTransport($config)
            : new RestTransport($config);

        $this->availability = new AvailabilityClient($this->transport, $this->config);
        $this->booking      = new BookingClient($this->transport, $this->config);
        $this->locations    = new LocationsClient($this->transport, $this->config);
    }

    public function availability(): AvailabilityClient { return $this->availability; }
    public function booking(): BookingClient { return $this->booking; }
    public function locations(): LocationsClient { return $this->locations; }
    public function transport(): TransportInterface { return $this->transport; }
}

