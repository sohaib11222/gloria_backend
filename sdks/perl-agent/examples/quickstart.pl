#!/usr/bin/env perl
# Quick Start Example
# 
# This is a minimal example showing how to use the Car-Hire SDK.
# 
# Usage:
#   1. Copy .env.example to .env and fill in your credentials
#   2. Run: perl examples/quickstart.pl

use 5.010;
use strict;
use warnings;
use lib '../lib';
use lib 'lib';

use CarHire::SDK::Client;
use CarHire::SDK::Config;

# 1. Create configuration
my $config = CarHire::SDK::Config->for_rest({
    baseUrl => $ENV{BASE_URL} || 'http://localhost:8080',
    token => 'Bearer ' . ($ENV{JWT_TOKEN} || ''),
    agentId => $ENV{AGENT_ID},
});

# 2. Create client
my $client = CarHire::SDK::Client->new($config);

# 3. Create availability criteria
my $criteria = {
    pickup_unlocode => 'PKKHI',
    dropoff_unlocode => 'PKLHE',
    pickup_iso => '2025-12-01T10:00:00Z',
    dropoff_iso => '2025-12-03T10:00:00Z',
    driver_age => 28,
    currency => 'USD',
    agreement_refs => ['AGR-001'],
};

# 4. Search availability (streaming)
print "Searching availability...\n";
my $search_gen = $client->availability()->search($criteria);
while (my $chunk = $search_gen->()) {
    my $items = $chunk->{items} || [];
    my $status = $chunk->{status} || 'PARTIAL';
    print "Received " . scalar(@$items) . " offers (status: $status)\n";
    
    if ($status eq 'COMPLETE') {
        last;
    }
}

print "Done!\n";

