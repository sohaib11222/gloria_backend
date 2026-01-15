#!/usr/bin/env perl
# Test script for booking operations
# 
# Usage:
#   1. Copy .env.example to .env and fill in your credentials
#   2. Run: perl examples/test-booking.pl

use 5.010;
use strict;
use warnings;
use lib '../lib';
use lib 'lib';

use CarHire::SDK::Client;
use CarHire::SDK::Config;

# Load environment variables (similar to test-availability.pl)
if (-f '../.env') {
    open my $fh, '<', '../.env' or die "Cannot open .env: $!";
    while (my $line = <$fh>) {
        chomp $line;
        next if $line =~ /^\s*#/;
        next unless $line =~ /=/;
        my ($key, $value) = split /=/, $line, 2;
        $ENV{trim($key)} = trim($value);
    }
    close $fh;
}

sub trim {
    my ($str) = @_;
    $str =~ s/^\s+|\s+$//g;
    return $str;
}

my $baseUrl = $ENV{BASE_URL} || 'http://localhost:8080';
my $token = $ENV{JWT_TOKEN} || '';

unless ($token) {
    die "Error: JWT_TOKEN environment variable is required\n";
}

my $config = CarHire::SDK::Config->for_rest({
    baseUrl => $baseUrl,
    token => "Bearer $token",
});

my $client = CarHire::SDK::Client->new($config);

eval {
    print "=== Testing Booking Operations ===\n";
    print "\n";

    # Step 1: Search for availability first
    print "Step 1: Searching for availability...\n";
    my $criteria = {
        pickup_unlocode => $ENV{PICKUP_LOCODE} || 'PKKHI',
        dropoff_unlocode => $ENV{RETURN_LOCODE} || 'PKLHE',
        pickup_iso => $ENV{PICKUP_DATE} || '2025-12-01T10:00:00Z',
        dropoff_iso => $ENV{RETURN_DATE} || '2025-12-03T10:00:00Z',
        driver_age => $ENV{DRIVER_AGE} || 28,
        currency => $ENV{CURRENCY} || 'USD',
        agreement_refs => [$ENV{AGREEMENT_REF} || 'AGR-001'],
    };

    my $selectedOffer;
    my $search_gen = $client->availability()->search($criteria);
    while (my $chunk = $search_gen->()) {
        my $items = $chunk->{items} || [];
        if (@$items > 0) {
            $selectedOffer = $items->[0];
            print "✓ Found offer: " . ($selectedOffer->{vehicle_class} || 'N/A') . " - " . ($selectedOffer->{make_model} || 'N/A') . "\n";
            print "  Price: " . ($selectedOffer->{currency} || 'USD') . " " . ($selectedOffer->{total_price} || 'N/A') . "\n";
            last;
        }
        if (($chunk->{status} || '') eq 'COMPLETE') {
            last;
        }
    }

    unless ($selectedOffer) {
        print "⚠ No offers found. Cannot test booking creation.\n";
        exit 0;
    }

    print "\n";

    # Step 2: Create booking
    print "Step 2: Creating booking...\n";
    my $bookingData = {
        agreement_ref => $ENV{AGREEMENT_REF} || 'AGR-001',
        offer_id => $selectedOffer->{offer_id},
        driver => {
            firstName => 'John',
            lastName => 'Doe',
            email => 'john.doe@example.com',
            phone => '+1234567890',
            age => $ENV{DRIVER_AGE} || 28,
        },
        agent_booking_ref => 'TEST-' . time(),
    };

    my $booking = $client->booking()->create($bookingData);
    my $bookingRef = $booking->{supplier_booking_ref} || $booking->{id} || 'N/A';
    my $status = $booking->{status} || 'N/A';
    print "✓ Booking created: $bookingRef\n";
    print "  Status: $status\n";
    print "\n";

    # Step 3: Check booking status
    if ($booking->{supplier_booking_ref}) {
        print "Step 3: Checking booking status...\n";
        my $status = $client->booking()->check($booking->{supplier_booking_ref}, $ENV{AGREEMENT_REF} || 'AGR-001');
        print "✓ Booking status: " . ($status->{status} || 'N/A') . "\n";
        print "\n";
    }

    print "✓ All booking tests completed successfully!\n";

} or do {
    my $error = $@ || 'Unknown error';
    print "❌ Error: $error\n";
    exit 1;
};

