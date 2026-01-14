package CarHire::SDK::Clients::Booking;

use 5.010;
use strict;
use warnings;

=head1 NAME

CarHire::SDK::Clients::Booking - Booking client

=cut

sub new {
    my ($class, $transport, $config) = @_;
    return bless {
        transport => $transport,
        config    => $config,
    }, $class;
}

sub create {
    my ($self, $dto, $idempotency_key) = @_;
    unless ($dto->{agreement_ref}) {
        die "agreement_ref required";
    }
    # Note: supplier_id is not required - backend resolves source_id from agreement_ref
    return $self->{transport}->booking_create($dto, $idempotency_key);
}

sub modify {
    my ($self, $supplier_booking_ref, $fields, $agreement_ref, $source_id) = @_;
    return $self->{transport}->booking_modify({
        supplier_booking_ref => $supplier_booking_ref,
        agreement_ref        => $agreement_ref,
        fields              => $fields,
    });
}

sub cancel {
    my ($self, $supplier_booking_ref, $agreement_ref, $source_id) = @_;
    return $self->{transport}->booking_cancel({
        supplier_booking_ref => $supplier_booking_ref,
        agreement_ref        => $agreement_ref,
    });
}

sub check {
    my ($self, $supplier_booking_ref, $agreement_ref, $source_id) = @_;
    return $self->{transport}->booking_check($supplier_booking_ref, $agreement_ref, $source_id);
}

1;

