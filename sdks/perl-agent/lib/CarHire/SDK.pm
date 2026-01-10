package CarHire::SDK;

use 5.010;
use strict;
use warnings;

our $VERSION = '1.0.0';

=head1 NAME

CarHire::SDK - Agent SDK for Car-Hire Middleware (REST + gRPC)

=head1 SYNOPSIS

    use CarHire::SDK;

    my $config = CarHire::SDK::Config->for_rest({
        baseUrl => 'https://your-gateway.example.com',
        token   => 'Bearer <JWT>',
        apiKey  => '<YOUR_API_KEY>',
        agentId => 'ag_123',
    });

    my $client = CarHire::SDK::Client->new($config);

    # Search availability
    my $criteria = {
        pickup_unlocode  => 'PKKHI',
        dropoff_unlocode => 'PKLHE',
        pickup_iso       => '2025-11-03T10:00:00Z',
        dropoff_iso      => '2025-11-05T10:00:00Z',
        driver_age       => 28,
        currency         => 'USD',
        agreement_refs   => ['AGR-001'],
    };

    my $availability = $client->availability();
    for my $chunk ($availability->search($criteria)) {
        print "Status: $chunk->{status}\n";
        last if $chunk->{status} eq 'COMPLETE';
    }

    # Create booking
    my $booking = {
        agreement_ref => 'AGR-001',
        supplier_id   => 'SRC-AVIS',
        offer_id      => 'off_123',
    };

    my $result = $client->booking()->create($booking, 'idem-123');
    print $result->{supplierBookingRef}, "\n";

=head1 DESCRIPTION

Agent SDK for Car-Hire Middleware supporting both REST and gRPC transports.

=head1 LICENSE

Proprietary

=cut

1;

