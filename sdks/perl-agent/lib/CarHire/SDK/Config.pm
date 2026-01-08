package CarHire::SDK::Config;

use 5.010;
use strict;
use warnings;

=head1 NAME

CarHire::SDK::Config - Configuration for Car-Hire SDK

=cut

sub new {
    my ($class, $grpc, $data) = @_;
    my $self = bless {
        grpc => $grpc,
        data => {
            baseUrl           => '',
            token             => '',
            apiKey            => '',
            agentId           => '',
            callTimeoutMs     => 10000,
            availabilitySlaMs => 120000,
            longPollWaitMs    => 10000,
            correlationId     => 'perl-sdk-' . unpack('H*', pack('N', rand(2**32))),
            host              => '',
            caCert            => '',
            clientCert        => '',
            clientKey         => '',
            %$data,
        },
    }, $class;
    return $self;
}

sub for_grpc {
    my ($class, $data) = @_;
    return $class->new(1, $data);
}

sub for_rest {
    my ($class, $data) = @_;
    return $class->new(0, $data);
}

sub is_grpc {
    my ($self) = @_;
    return $self->{grpc};
}

sub get {
    my ($self, $key, $default) = @_;
    return exists $self->{data}{$key} ? $self->{data}{$key} : $default;
}

sub with_correlation_id {
    my ($self, $correlation_id) = @_;
    my $new_data = { %{$self->{data}}, correlationId => $correlation_id };
    return __PACKAGE__->new($self->{grpc}, $new_data);
}

1;

