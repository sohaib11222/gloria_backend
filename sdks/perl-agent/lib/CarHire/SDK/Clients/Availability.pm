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
    unless ($criteria->{agreement_refs} && @{$criteria->{agreement_refs}}) {
        die "agreement_refs required";
    }

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

1;

