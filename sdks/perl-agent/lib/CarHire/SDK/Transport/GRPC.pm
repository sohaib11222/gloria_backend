package CarHire::SDK::Transport::GRPC;

use 5.010;
use strict;
use warnings;

=head1 NAME

CarHire::SDK::Transport::GRPC - gRPC transport implementation (stubs)

=head1 DESCRIPTION

gRPC transport – STUBS until proto files are generated and service clients are wired.
To generate stubs, run protoc with Perl plugin.
Then implement methods by calling generated stubs with per-call deadlines and mTLS channel credentials.

=cut

sub new {
    my ($class, $config) = @_;
    return bless { config => $config }, $class;
}

sub availability_submit {
    die "gRPC not wired yet. Generate stubs and implement.";
}

sub availability_poll {
    die "gRPC not wired yet. Generate stubs and implement.";
}

sub is_location_supported {
    die "gRPC not wired yet. Generate stubs and implement.";
}

sub booking_create {
    die "gRPC not wired yet. Generate stubs and implement.";
}

sub booking_modify {
    die "gRPC not wired yet. Generate stubs and implement.";
}

sub booking_cancel {
    die "gRPC not wired yet. Generate stubs and implement.";
}

sub booking_check {
    die "gRPC not wired yet. Generate stubs and implement.";
}

1;

