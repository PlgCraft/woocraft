<?php

namespace {{namespace}};

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Values shared across the codebase. Autoloaded via composer.json's
 * "files" entry, so every class can `use const` these without wiring.
 */

/** REST namespace: /wp-json/{{apiNamespace}}/... */
const API_ENDPOINT = '{{apiNamespace}}';
