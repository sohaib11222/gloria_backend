package CarHire::SDK::Clients::Locations;

use 5.010;
use strict;
use warnings;

=head1 NAME

CarHire::SDK::Clients::Locations - Locations client

=cut

sub new {
    my ($class, $transport, $config) = @_;
    return bless {
        transport => $transport,
        config    => $config,
    }, $class;
}

sub is_supported {
    my ($self, $agreement_ref, $locode) = @_;
    return $self->{transport}->is_location_supported($agreement_ref, $locode);
}

1;

