use 5.010;
use strict;
use warnings;
use ExtUtils::MakeMaker;

WriteMakefile(
    NAME              => 'CarHire::SDK',
    VERSION_FROM      => 'lib/CarHire/SDK.pm',
    PREREQ_PM         => {
        'LWP::UserAgent' => '6.00',
        'JSON'            => '4.00',
        'HTTP::Request'   => '6.00',
        'HTTP::Response'  => '6.00',
        'Time::HiRes'     => '1.97',
    },
    TEST_REQUIRES     => {
        'Test::More' => '1.30',
    },
    ABSTRACT_FROM     => 'lib/CarHire/SDK.pm',
    AUTHOR            => 'Car Hire SDK Team',
    LICENSE           => 'proprietary',
);

