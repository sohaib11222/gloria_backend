package CarHire::SDK::Clients::Availability;

use 5.010;
use strict;
use warnings;
use Time::HiRes qw(time);

=head1 NAME

CarHire::SDK::Clients::Availability - Availability client

=cut

sub new {
    my ($class, $transport, $config) = @_;
    return bless {
        transport => $transport,
        config    => $config,
    }, $class;
}

sub search {
    my ($self, $criteria) = @_;
    
    # Validate criteria
    _validate_criteria($criteria);

    my $submit = $self->{transport}->availability_submit($criteria);
    my $request_id = $submit->{request_id} or return;

    my $since = 0;
    my $deadline = time() * 1000 + $self->{config}->get('availabilitySlaMs', 120000);

    while (1) {
        my $remaining = ($deadline - time() * 1000);
        last if $remaining <= 0;

        my $wait = $remaining < $self->{config}->get('longPollWaitMs', 10000)
            ? int($remaining)
            : $self->{config}->get('longPollWaitMs', 10000);

        my $res = $self->{transport}->availability_poll($request_id, $since, $wait);
        $since = $res->{cursor} // $since;

        yield $res;
        last if ($res->{status} // '') eq 'COMPLETE';
    }
}

sub yield {
    my ($chunk) = @_;
    return $chunk;
}

sub _validate_criteria {
    my ($criteria) = @_;
    
    # Validate pickup_unlocode
    unless ($criteria->{pickup_unlocode} && $criteria->{pickup_unlocode} =~ /\S/) {
        die "pickup_unlocode is required";
    }
    $criteria->{pickup_unlocode} = uc(trim($criteria->{pickup_unlocode}));
    
    # Validate dropoff_unlocode
    unless ($criteria->{dropoff_unlocode} && $criteria->{dropoff_unlocode} =~ /\S/) {
        die "dropoff_unlocode is required";
    }
    $criteria->{dropoff_unlocode} = uc(trim($criteria->{dropoff_unlocode}));
    
    # Validate pickup_iso
    unless ($criteria->{pickup_iso} && $criteria->{pickup_iso} =~ /\S/) {
        die "pickup_iso is required";
    }
    # Basic ISO-8601 format check (YYYY-MM-DDTHH:MM:SSZ or similar)
    unless ($criteria->{pickup_iso} =~ /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/) {
        die "pickup_iso must be a valid ISO-8601 datetime string";
    }
    
    # Validate dropoff_iso
    unless ($criteria->{dropoff_iso} && $criteria->{dropoff_iso} =~ /\S/) {
        die "dropoff_iso is required";
    }
    # Basic ISO-8601 format check
    unless ($criteria->{dropoff_iso} =~ /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/) {
        die "dropoff_iso must be a valid ISO-8601 datetime string";
    }
    # Check that dropoff is after pickup (string comparison works for ISO-8601)
    if ($criteria->{dropoff_iso} le $criteria->{pickup_iso}) {
        die "dropoff_iso must be after pickup_iso";
    }
    
    # Validate driver_age
    unless (exists $criteria->{driver_age} && defined $criteria->{driver_age}) {
        die "driver_age is required";
    }
    unless ($criteria->{driver_age} =~ /^\d+$/ && $criteria->{driver_age} >= 18 && $criteria->{driver_age} <= 100) {
        die "driver_age must be between 18 and 100";
    }
    
    # Validate currency
    unless ($criteria->{currency} && $criteria->{currency} =~ /\S/) {
        die "currency is required";
    }
    $criteria->{currency} = uc(trim($criteria->{currency}));
    
    # Validate agreement_refs
    unless ($criteria->{agreement_refs} && ref($criteria->{agreement_refs}) eq 'ARRAY' && @{$criteria->{agreement_refs}}) {
        die "agreement_refs must be a non-empty array";
    }
    
    # Validate residency_country if provided
    if (exists $criteria->{residency_country} && defined $criteria->{residency_country}) {
        unless (length($criteria->{residency_country}) == 2) {
            die "residency_country must be a 2-letter ISO code";
        }
    }
}

sub trim {
    my ($str) = @_;
    $str =~ s/^\s+|\s+$//g;
    return $str;
}

1;

