<?php

namespace {{namespace}}\Http;

use {{namespace}}\Http\Routes\Hello;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers every REST route the extension exposes. Add a route by
 * writing a class under Http\Routes\ and constructing it in register().
 */
class Routes {

	public function __construct() {
		add_action( 'rest_api_init', array( $this, 'register' ) );
	}

	public function register(): void {
		new Hello();
	}
}
