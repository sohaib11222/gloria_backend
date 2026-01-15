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
    
    # Validation
    unless ($data->{host} && $data->{host} =~ /\S/) {
        die "host is required for gRPC configuration";
    }
    unless ($data->{caCert} && $data->{caCert} =~ /\S/) {
        die "caCert is required for gRPC configuration";
    }
    unless ($data->{clientCert} && $data->{clientCert} =~ /\S/) {
        die "clientCert is required for gRPC configuration";
    }
    unless ($data->{clientKey} && $data->{clientKey} =~ /\S/) {
        die "clientKey is required for gRPC configuration";
    }
    
    # Validate timeouts if provided
    if (exists $data->{callTimeoutMs} && defined $data->{callTimeoutMs}) {
        my $timeout = $data->{callTimeoutMs};
        if ($timeout < 1000) {
            die "callTimeoutMs must be at least 1000ms";
        }
    }
    if (exists $data->{availabilitySlaMs} && defined $data->{availabilitySlaMs}) {
        my $timeout = $data->{availabilitySlaMs};
        if ($timeout < 1000) {
            die "availabilitySlaMs must be at least 1000ms";
        }
    }
    if (exists $data->{longPollWaitMs} && defined $data->{longPollWaitMs}) {
        my $timeout = $data->{longPollWaitMs};
        if ($timeout < 1000) {
            die "longPollWaitMs must be at least 1000ms";
        }
    }
    
    return $class->new(1, $data);
}

sub for_rest {
    my ($class, $data) = @_;
    
    # Validation
    unless ($data->{baseUrl} && $data->{baseUrl} =~ /\S/) {
        die "baseUrl is required for REST configuration";
    }
    unless ($data->{token} && $data->{token} =~ /\S/) {
        die "token is required for REST configuration";
    }
    
    # Validate timeouts if provided
    if (exists $data->{callTimeoutMs} && defined $data->{callTimeoutMs}) {
        my $timeout = $data->{callTimeoutMs};
        if ($timeout < 1000) {
            die "callTimeoutMs must be at least 1000ms";
        }
    }
    if (exists $data->{availabilitySlaMs} && defined $data->{availabilitySlaMs}) {
        my $timeout = $data->{availabilitySlaMs};
        if ($timeout < 1000) {
            die "availabilitySlaMs must be at least 1000ms";
        }
    }
    if (exists $data->{longPollWaitMs} && defined $data->{longPollWaitMs}) {
        my $timeout = $data->{longPollWaitMs};
        if ($timeout < 1000) {
            die "longPollWaitMs must be at least 1000ms";
        }
    }
    
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

