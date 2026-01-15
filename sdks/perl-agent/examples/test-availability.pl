#!/usr/bin/env perl
# Test script for availability search
# 
# Usage:
#   1. Copy .env.example to .env and fill in your credentials
#   2. Run: perl examples/test-availability.pl
# 
# Or set environment variables:
#   BASE_URL=http://localhost:8080 JWT_TOKEN=your_token perl examples/test-availability.pl

use 5.010;
use strict;
use warnings;
use lib '../lib';
use lib 'lib';

use CarHire::SDK::Client;
use CarHire::SDK::Config;
use CarHire::SDK::DTO::AvailabilityCriteria;

# Load environment variables from .env file if available
if (-f '../.env') {
    open my $fh, '<', '../.env' or die "Cannot open .env: $!";
    while (my $line = <$fh>) {
        chomp $line;
        next if $line =~ /^\s*#/;  # Skip comments
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

# Get configuration from environment variables
my $baseUrl = $ENV{BASE_URL} || 'http://localhost:8080';
my $token = $ENV{JWT_TOKEN} || '';
my $agentId = $ENV{AGENT_ID} || '';

unless ($token) {
    die "Error: JWT_TOKEN environment variable is required\n";
}

# Create configuration
my $config = CarHire::SDK::Config->for_rest({
    baseUrl => $baseUrl,
    token => "Bearer $token",
    agentId => $agentId || undef,
});

# Create client
my $client = CarHire::SDK::Client->new($config);

# Test data from environment variables
my $pickupLocode = $ENV{PICKUP_LOCODE} || 'PKKHI';
my $returnLocode = $ENV{RETURN_LOCODE} || 'PKLHE';
my $pickupDate = $ENV{PICKUP_DATE} || '2025-12-01T10:00:00Z';
my $returnDate = $ENV{RETURN_DATE} || '2025-12-03T10:00:00Z';
my $driverAge = $ENV{DRIVER_AGE} || 28;
my $currency = $ENV{CURRENCY} || 'USD';
my $agreementRef = $ENV{AGREEMENT_REF} || 'AGR-001';

eval {
    print "=== Testing Availability Search ===\n";
    print "Base URL: $baseUrl\n";
    print "Pickup: $pickupLocode at $pickupDate\n";
    print "Return: $returnLocode at $returnDate\n";
    print "Driver Age: $driverAge, Currency: $currency\n";
    print "Agreement: $agreementRef\n";
    print "\n";

    # Create availability criteria
    my $criteria = {
        pickup_unlocode => $pickupLocode,
        dropoff_unlocode => $returnLocode,
        pickup_iso => $pickupDate,
        dropoff_iso => $returnDate,
        driver_age => $driverAge,
        currency => $currency,
        agreement_refs => [$agreementRef],
    };

    print "Searching availability...\n";
    print "\n";

    # Search availability (streaming)
    my $chunkCount = 0;
    my $totalOffers = 0;

    my $search_gen = $client->availability()->search($criteria);
    while (my $chunk = $search_gen->()) {
        $chunkCount++;
        my $status = $chunk->{status} || 'PARTIAL';
        my $items = $chunk->{items} || [];
        $totalOffers += scalar @$items;

        print "[Chunk $chunkCount] Status: $status, Offers: " . scalar(@$items) . "\n";

        if (@$items > 0) {
            my $firstOffer = $items->[0];
            my $vehicleClass = $firstOffer->{vehicle_class} || 'N/A';
            my $makeModel = $firstOffer->{make_model} || 'N/A';
            my $price = $firstOffer->{total_price} || 'N/A';
            my $offerCurrency = $firstOffer->{currency} || $currency;
            my $sourceId = $firstOffer->{source_id} || 'N/A';
            print "  Example offer: $vehicleClass - $makeModel\n";
            print "    Price: $offerCurrency $price\n";
            print "    Source: $sourceId\n";
        }

        if ($status eq 'COMPLETE') {
            print "\n";
            print "✓ Search complete! Total chunks: $chunkCount, Total offers: $totalOffers\n";
            last;
        }
    }

    if ($chunkCount == 0) {
        print "⚠ No availability chunks received\n";
    }

} or do {
    my $error = $@ || 'Unknown error';
    print "❌ Error: $error\n";
    exit 1;
};

