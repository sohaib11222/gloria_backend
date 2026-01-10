package CarHire::SDK::Client;

use 5.010;
use strict;
use warnings;
use CarHire::SDK::Transport::REST;
use CarHire::SDK::Transport::GRPC;
use CarHire::SDK::Clients::Availability;
use CarHire::SDK::Clients::Booking;
use CarHire::SDK::Clients::Locations;

=head1 NAME

CarHire::SDK::Client - Main client for Car-Hire SDK

=cut

sub new {
    my ($class, $config) = @_;
    my $transport = $config->is_grpc()
        ? CarHire::SDK::Transport::GRPC->new($config)
        : CarHire::SDK::Transport::REST->new($config);

    return bless {
        config      => $config,
        transport   => $transport,
        availability => CarHire::SDK::Clients::Availability->new($transport, $config),
        booking     => CarHire::SDK::Clients::Booking->new($transport, $config),
        locations   => CarHire::SDK::Clients::Locations->new($transport, $config),
    }, $class;
}

sub availability {
    my ($self) = @_;
    return $self->{availability};
}

sub booking {
    my ($self) = @_;
    return $self->{booking};
}

sub locations {
    my ($self) = @_;
    return $self->{locations};
}

sub transport {
    my ($self) = @_;
    return $self->{transport};
}

1;

