package CarHire::SDK::Transport::REST;

use 5.010;
use strict;
use warnings;
use LWP::UserAgent;
use HTTP::Request;
use JSON;
use Time::HiRes qw(time);

=head1 NAME

CarHire::SDK::Transport::REST - REST transport implementation

=cut

sub new {
    my ($class, $config) = @_;
    my $self = bless {
        config => $config,
        ua     => LWP::UserAgent->new(
            timeout => max(
                int(($config->get('longPollWaitMs', 10000) + 2000) / 1000),
                12
            ),
        ),
        base_url => $config->get('baseUrl', '') =~ s{/$}{}r,
        json     => JSON->new->utf8,
    }, $class;
    return $self;
}

sub _headers {
    my ($self, $extra) = @_;
    my %headers = (
        'Authorization'    => $self->{config}->get('token', ''),
        'Content-Type'     => 'application/json',
        'Accept'           => 'application/json',
        'X-Agent-Id'       => $self->{config}->get('agentId', ''),
        'X-Correlation-Id' => $self->{config}->get('correlationId', ''),
    );

    my $api_key = $self->{config}->get('apiKey');
    $headers{'X-API-Key'} = $api_key if $api_key;

    %headers = (%headers, %{$extra || {}});
    return \%headers;
}

sub availability_submit {
    my ($self, $criteria) = @_;
    my $json = $self->{json}->encode($criteria);
    my $req = HTTP::Request->new(
        'POST',
        $self->{base_url} . '/availability/submit',
        $self->_headers(),
        $json
    );

    my $res = $self->{ua}->request($req);
    unless ($res->is_success) {
        die "HTTP " . $res->code . ": " . $res->message;
    }
    return $self->{json}->decode($res->content);
}

sub availability_poll {
    my ($self, $request_id, $since_seq, $wait_ms) = @_;
    my $url = $self->{base_url} . '/availability/poll?' .
              "request_id=$request_id&since_seq=$since_seq&wait_ms=$wait_ms";
    my $req = HTTP::Request->new('GET', $url, $self->_headers());

    my $timeout = max(
        ($wait_ms / 1000) + 2,
        ($self->{config}->get('callTimeoutMs', 10000) / 1000) + 2
    );
    $self->{ua}->timeout($timeout);

    my $res = $self->{ua}->request($req);
    unless ($res->is_success) {
        die "HTTP " . $res->code . ": " . $res->message;
    }
    return $self->{json}->decode($res->content);
}

sub is_location_supported {
    my ($self, $agreement_ref, $locode) = @_;
    # Backend doesn't have a direct /locations/supported endpoint
    return 0;
}

sub booking_create {
    my ($self, $payload, $idempotency_key) = @_;
    my %headers = %{$self->_headers()};
    $headers{'Idempotency-Key'} = $idempotency_key if $idempotency_key;

    my $json = $self->{json}->encode($payload);
    my $req = HTTP::Request->new(
        'POST',
        $self->{base_url} . '/bookings',
        \%headers,
        $json
    );

    my $res = $self->{ua}->request($req);
    unless ($res->is_success) {
        die "HTTP " . $res->code . ": " . $res->message;
    }
    return $self->{json}->decode($res->content);
}

sub booking_modify {
    my ($self, $payload) = @_;
    my $agreement_ref = $payload->{agreement_ref} || '';
    my $supplier_booking_ref = $payload->{supplier_booking_ref};
    my $fields = $payload->{fields} || {};

    my $json = $self->{json}->encode($fields);
    my $url = $self->{base_url} . "/bookings/$supplier_booking_ref?agreement_ref=$agreement_ref";
    my $req = HTTP::Request->new('PATCH', $url, $self->_headers(), $json);

    my $res = $self->{ua}->request($req);
    unless ($res->is_success) {
        die "HTTP " . $res->code . ": " . $res->message;
    }
    return $self->{json}->decode($res->content);
}

sub booking_cancel {
    my ($self, $payload) = @_;
    my $agreement_ref = $payload->{agreement_ref} || '';
    my $supplier_booking_ref = $payload->{supplier_booking_ref};

    my $url = $self->{base_url} . "/bookings/$supplier_booking_ref/cancel?agreement_ref=$agreement_ref";
    my $req = HTTP::Request->new('POST', $url, $self->_headers());

    my $res = $self->{ua}->request($req);
    unless ($res->is_success) {
        die "HTTP " . $res->code . ": " . $res->message;
    }
    return $self->{json}->decode($res->content);
}

sub booking_check {
    my ($self, $supplier_booking_ref, $agreement_ref, $source_id) = @_;
    my $url = $self->{base_url} . "/bookings/$supplier_booking_ref?agreement_ref=$agreement_ref";
    $url .= "&source_id=$source_id" if $source_id;

    my $req = HTTP::Request->new('GET', $url, $self->_headers());
    my $res = $self->{ua}->request($req);
    unless ($res->is_success) {
        die "HTTP " . $res->code . ": " . $res->message;
    }
    return $self->{json}->decode($res->content);
}

sub max {
    my ($a, $b) = @_;
    return $a > $b ? $a : $b;
}

1;

